// api/interpret.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Redis = require("ioredis");

// --- Beállítások ---
const DAILY_TOKEN_LIMIT = 1_000_000; // napi 1 millió token
const GEMINI_TIMEOUT_MS = 25000; // max 25 másodperc várakozás
const MAX_RETRIES = 3;

// --- Redis kliens (singleton) ---
let redis = global.redisClient;

if (!redis && process.env.UPSTASH_REDIS_URL) {
  redis = new Redis(process.env.UPSTASH_REDIS_URL, {
    lazyConnect: true,          // csak használatkor próbál kapcsolódni
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,       // rövidebb connect timeout
    tls: {},                    // Upstash TLS kötelező
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err?.message || err);
  });

  global.redisClient = redis; // cache-eljük a kapcsolatot
} else if (!process.env.UPSTASH_REDIS_URL) {
  console.warn("UPSTASH_REDIS_URL nincs beállítva – token limit ellenőrzés KIHAGYVA (fail-open).");
  redis = null;
}

// --- Nyelvkód -> nyelv ---
function getLanguageName(code) {
  switch (code) {
    case "en": return "English";
    case "hu": return "Hungarian";
    case "de": return "German";
    case "fr": return "French";
    case "it": return "Italian";
    case "ru": return "Russian";
    case "es": return "Spanish";
    case "pt": return "Portuguese";
    case "zh": return "Chinese (Simplified)";
    case "ja": return "Japanese";
    case "ko": return "Korean";
    case "sw": return "Swahili";
    case "fa": return "Persian";
    case "ta": return "Tamil";
    case "bn": return "Bengali";
    case "hi": return "Hindi";
    case "id": return "Indonesian";
    case "th": return "Thai";
    case "vi": return "Vietnamese";
    case "ur": return "Urdu";
    case "te": return "Telugu";
    case "pl": return "Polish";
    case "tr": return "Turkish";
    case "uk": return "Ukrainian";
    case "ro": return "Romanian";
    case "nl": return "Dutch";
    case "ms": return "Malay";
    case "ar": return "Arabic";
    default: return "English";
  }
}

// --- Token limit ellenőrzés ---
async function canUseTokens(estimatedTokens) {
  if (!redis) {
    console.warn("Redis nem elérhető – token limit ellenőrzés átugorva.");
    return true;
  }

  const today = new Date().toISOString().slice(0, 10);
  const key = `daily_tokens:${today}`;

  try {
    const usedStr = await redis.get(key);
    const used = usedStr ? parseInt(usedStr, 10) : 0;

    if (used + estimatedTokens > DAILY_TOKEN_LIMIT) {
      return false;
    }

    const pipeline = redis.multi();
    pipeline.incrby(key, estimatedTokens);
    pipeline.expire(key, 60 * 60 * 24);
    await pipeline.exec();

    return true;
  } catch (err) {
    console.error("Redis write error:", err?.message || err);
    // Fail-open fallback
    return true;
  }
}

// --- Retry helper (exponential backoff) ---
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const delay = Math.pow(2, attempt) * 200; // pl. 200ms, 400ms, 800ms
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// --- HTTP handler (SSE streaming) ---
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Only POST requests are allowed.",
    });
  }

  try {
    const { dreamNarrative, symbols, emotions, language } = req.body || {};

    if (!dreamNarrative) {
      return res.status(400).json({
        error: "missing_dream_narrative",
        message: "Dream narrative is required.",
      });
    }

    const estimatedTokens =
      (dreamNarrative?.length || 0) +
      (symbols?.length || 0) +
      (emotions?.length || 0) +
      500;

    const allowed = await canUseTokens(estimatedTokens);
    if (!allowed) {
      return res.status(429).json({
        error: "token_limit_exceeded",
        message: "Daily token quota exceeded.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Gemini API key not found.");
      return res.status(500).json({
        error: "server_config_error",
        message: "Server configuration error.",
      });
    }

    // --- Gemini 2.5 Flash ---
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const languageName = getLanguageName(language || "en");

    const systemInstruction = `
You are an empathetic and insightful dream interpreter. Your goal is to provide a thoughtful, non-definitive interpretation of a user's dream.
Your tone should be supportive, curious, and gentle, like a wise guide. Never state interpretations as facts, but as possibilities for self-reflection.
Use phrases like "This could symbolize...", "Perhaps this reflects...", "It might suggest...".

IMPORTANT: Your full response must be in ${languageName} and under 150 words.

The output MUST be in Markdown format and strictly follow this structure:
### Summary
A brief, one or two-sentence summary of the most likely core theme of the dream.

### Detailed Analysis
- **Symbols:** Analyze the key symbols provided or found in the narrative. For each symbol, explain its common meanings and how it might relate to the user's context.
- **Emotions:** Discuss the emotions felt in the dream and what they might indicate about the user's current emotional state.
- **Narrative Flow:** Interpret the story or events of the dream. What could the progression of events signify?
- **Possible Meaning:** Offer a concluding thought on what the dream as a whole could be encouraging the user to reflect upon in their waking life.
`;

    const userPrompt = `
Here is my dream:
- Narrative: ${dreamNarrative}
- Key Symbols: ${symbols || "Not provided"}
- Emotions Felt: ${emotions || "Not provided"}
`;

    const fullPrompt = systemInstruction + "\n\n" + userPrompt;

    // --- Streaming válasz küldése a kliensnek ---
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    await retryWithBackoff(async () => {
      const stream = await model.generateContentStream(fullPrompt, {
        timeout: GEMINI_TIMEOUT_MS,
      });

      for await (const chunk of stream.stream) {
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

  } catch (error) {
    console.error("Error calling Gemini API:", error);

    let statusCode = 500;
    let errorCode = "internal_error";
    let message = "An unexpected error occurred.";

    if (error?.code === "ETIMEDOUT" || error.message?.includes("timeout")) {
      statusCode = 504;
      errorCode = "timeout";
      message = "The request to Gemini timed out. Please try again.";
    } else if (error?.status === 503) {
      statusCode = 503;
      errorCode = "model_overloaded";
      message = "The Gemini model is currently overloaded. Please try again later.";
    } else if (error?.status === 429) {
      statusCode = 429;
      errorCode = "rate_limited";
      message = "Too many requests. Please wait and try again.";
    } else if (error?.status === 401 || error?.status === 403) {
      statusCode = error.status;
      errorCode = "unauthorized";
      message = "Unauthorized request. Please check your API key.";
    }

    if (!res.headersSent) {
      res.status(statusCode).json({ error: errorCode, message });
    } else {
      // ha már streamelés közben volt hiba
      res.write(`data: ${JSON.stringify({ error: errorCode, message })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
};
