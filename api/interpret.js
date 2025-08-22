// api/interpret.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Redis = require("ioredis");

// --- Beállítások ---
const DAILY_TOKEN_LIMIT = 1_000_000; // napi 1 millió token

// --- Redis kliens (csak UPSTASH_REDIS_URL) ---
const redisUrl = process.env.UPSTASH_REDIS_URL;
let redis = null;

if (redisUrl) {
  // Upstash Redis URL formátum: rediss://:<PASSWORD>@<HOST>:<PORT>
  // A TLS automatikus; a maxRetriesPerRequest-et levesszük, hogy ne lógjon sokáig hiba esetén.
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    tls: {}, // Upstash-hez TLS kell
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err?.message || err);
  });
} else {
  console.warn("UPSTASH_REDIS_URL nincs beállítva – token limit ellenőrzés KIHAGYVA (fail-open).");
}

// --- Nyelvkód -> megjelenítendő nyelv ---
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

// --- Token limit ellenőrzés (Redis) ---
async function canUseTokens(estimatedTokens) {
  // Ha nincs redis beállítva, fail-open (engedjük a hívást, csak logolunk)
  if (!redis) {
    console.warn("Redis nem elérhető – token limit ellenőrzés átugorva.");
    return true;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `daily_tokens:${today}`;

  // 1) Jelenlegi felhasználás lekérdezése
  const usedStr = await redis.get(key);
  const used = usedStr ? parseInt(usedStr, 10) : 0;

  // 2) Limit ellenőrzése
  if (used + estimatedTokens > DAILY_TOKEN_LIMIT) {
    return false;
  }

  // 3) Növelés + lejárat beállítás (1 nap)
  //   Ha új kulcs, az EXPIRE gondoskodik a napi resetről.
  const pipeline = redis.multi();
  pipeline.incrby(key, estimatedTokens);
  pipeline.expire(key, 60 * 60 * 24); // 24 óra
  await pipeline.exec();

  return true;
}

// --- HTTP handler ---
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

    // Durva token becslés (szöveghossz + ~500 a rendszerprompt)
    const estimatedTokens =
      (dreamNarrative?.length || 0) +
      (symbols?.length || 0) +
      (emotions?.length || 0) +
      500;

    // Token limit ellenőrzés
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

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

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const interpretationText = response.text();

    return res.status(200).json({ interpretation: interpretationText });
  } catch (error) {
    console.error("Error calling Gemini API:", error);

    let statusCode = 500;
    let errorCode = "internal_error";
    let message = "An unexpected error occurred.";

    if (error?.status === 503) {
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

    return res.status(statusCode).json({ error: errorCode, message });
  }
};
