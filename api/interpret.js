const { GoogleGenerativeAI } = require("@google/generative-ai");
const Redis = require("ioredis");
const crypto = require("crypto");

// --- Beállítások ---
const DAILY_TOKEN_LIMIT = 500_000;
const GEMINI_TIMEOUT_MS = 25000;
const MAX_RETRIES = 3;
const RATE_LIMIT = 20;

// --- Redis ---
let redis = global.redisClient;

if (!redis && process.env.UPSTASH_REDIS_URL) {
  redis = new Redis(process.env.UPSTASH_REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    tls: {},
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err?.message || err);
  });

  global.redisClient = redis;
}

if (!redis) {
  console.error("❌ Redis REQUIRED (fail-closed).");
}

// --- Token becslés ---
function estimateTokens(str) {
  return Math.ceil((str?.length || 0) / 4);
}

// --- TELJES NYELVI MAP (optimalizált objektum formában) ---
const LANGUAGE_MAP = {
  en: "English",
  hu: "Hungarian",
  de: "German",
  fr: "French",
  it: "Italian",
  ru: "Russian",
  es: "Spanish",
  pt: "Portuguese",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
  sw: "Swahili",
  fa: "Persian",
  ta: "Tamil",
  bn: "Bengali",
  hi: "Hindi",
  id: "Indonesian",
  th: "Thai",
  vi: "Vietnamese",
  ur: "Urdu",
  te: "Telugu",
  pl: "Polish",
  tr: "Turkish",
  uk: "Ukrainian",
  ro: "Romanian",
  nl: "Dutch",
  ms: "Malay",
  ar: "Arabic",
};

// --- Section titles ---
const SECTION_TITLES = {
  hu: { s: "Összefoglalás", d: "Részletes elemzés", sym: "Szimbólumok", emo: "Érzelmek", seq: "Eseménysor", mean: "Lehetséges jelentés" },
  de: { s: "Zusammenfassung", d: "Detaillierte Analyse", sym: "Symbole", emo: "Emotionen", seq: "Ereignisablauf", mean: "Mögliche Bedeutung" },
  fr: { s: "Résumé", d: "Analyse détaillée", sym: "Symboles", emo: "Émotions", seq: "Séquence d'événements", mean: "Signification possible" },
  es: { s: "Resumen", d: "Análisis detallado", sym: "Símbolos", emo: "Emociones", seq: "Secuencia de eventos", mean: "Significado posible" },
  it: { s: "Riassunto", d: "Analisi dettagliata", sym: "Simboli", emo: "Emozioni", seq: "Sequenza di eventi", mean: "Significato possibile" },
  pt: { s: "Resumo", d: "Análise detalhada", sym: "Símbolos", emo: "Emoções", seq: "Sequência de eventos", mean: "Significado possível" },
  ru: { s: "Краткое содержание", d: "Подробный анализ", sym: "Символы", emo: "Эмоции", seq: "Последовательность событий", mean: "Возможное значение" },
  zh: { s: "总结", d: "详细分析", sym: "符号", emo: "情绪", seq: "事件顺序", mean: "可能的含义" },
  ja: { s: "要約", d: "詳細な分析", sym: "シンボル", emo: "感情", seq: "出来事の流れ", mean: "可能な意味" },
  ko: { s: "요약", d: "자세한 분석", sym: "상징", emo: "감정", seq: "사건 순서", mean: "가능한 의미" },
  default: { s: "Summary", d: "Detailed Analysis", sym: "Symbols", emo: "Emotions", seq: "Event Sequence", mean: "Possible Meaning" },
};

// --- cleanText (változatlan) ---
function cleanText(text) {
  if (!text || text.trim().length === 0) return text;

  let cleaned = text
    .replace(/\*\*|\*|__|_|~~/g, '')
    .replace(/(^|\n)#+\s*/g, '$1')
    .replace(/(^|\n)\s*[\*\-\+]\s+/g, '$1• ')
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/delta:\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();

  return cleaned.length > 0 ? cleaned : text.trim();
}

// --- Token + rate limit ---
async function canUseTokens(estimatedTokens) {
  if (!redis) return false;

  const today = new Date().toISOString().slice(0, 10);
  const tokenKey = `tokens:${today}`;
  const minuteKey = `rate:${Math.floor(Date.now() / 60000)}`;

  const used = parseInt(await redis.get(tokenKey)) || 0;
  if (used + estimatedTokens > DAILY_TOKEN_LIMIT) return false;

  const req = parseInt(await redis.get(minuteKey)) || 0;
  if (req >= RATE_LIMIT) return false;

  const pipe = redis.multi();
  pipe.incrby(tokenKey, estimatedTokens);
  pipe.expire(tokenKey, 86400);
  pipe.incr(minuteKey);
  pipe.expire(minuteKey, 60);
  await pipe.exec();

  return true;
}

// --- Retry ---
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 200 * 2 ** attempt));
    }
  }
}

// --- Handler ---
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { dreamNarrative, symbols, emotions, language } = req.body || {};
    if (!dreamNarrative) {
      return res.status(400).json({ error: "missing_dream" });
    }

    const langCode = language || "en";
    const languageName = LANGUAGE_MAP[langCode] || "English";
    const titles = SECTION_TITLES[langCode] || SECTION_TITLES.default;

    const estimatedTokens =
      estimateTokens(dreamNarrative) +
      estimateTokens(symbols) +
      estimateTokens(emotions) +
      200;

    const allowed = await canUseTokens(estimatedTokens);
    if (!allowed) {
      return res.status(429).json({ error: "limit_exceeded" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.7,
      },
    });

    const systemInstruction = `
You are a thoughtful dream interpreter.

Rules:
- Respond ONLY in ${languageName}.
- No English words.
- Plain text only.
- Max 120 words.

Structure:
${titles.s}
${titles.d}
${titles.sym}:
${titles.emo}:
${titles.seq}:
${titles.mean}:
`;

    const userPrompt = `
Dream: ${dreamNarrative}
Symbols: ${symbols || "none"}
Emotions: ${emotions || "none"}
`;

    const fullPrompt = systemInstruction + userPrompt;

    // --- CACHE ---
    const hash = crypto.createHash("sha256").update(fullPrompt).digest("hex");
    const cached = await redis.get(`cache:${hash}`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.flushHeaders();

    if (cached) {
      res.write(`data: ${JSON.stringify({ delta: cached })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    let fullResponse = "";

    await retryWithBackoff(async () => {
      const stream = await model.generateContentStream(fullPrompt, {
        timeout: GEMINI_TIMEOUT_MS,
      });

      for await (const chunk of stream.stream) {
        const text = chunk.text();
        if (text) {
          const cleaned = cleanText(text);
          fullResponse += cleaned;
          res.write(`data: ${JSON.stringify({ delta: cleaned })}\n\n`);
        }
      }
    });

    if (fullResponse) {
      await redis.set(`cache:${hash}`, fullResponse, "EX", 3600);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error(err);

    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "internal_error" })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
};