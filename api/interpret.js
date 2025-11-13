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
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    tls: {},
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err?.message || err);
  });

  global.redisClient = redis;
} else if (!process.env.UPSTASH_REDIS_URL) {
  console.warn("UPSTASH_REDIS_URL nincs beállítva – token limit ellenőrzés KIHAGYVA (fail-open).");
  redis = null;
}

// --- Nyelvkód -> nyelv neve ---
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

// --- Szekció címek nyelvenként ---
function getSectionTitles(langCode) {
  switch (langCode) {
    case "hu": return { s: "Összefoglalás", d: "Részletes elemzés", sym: "Szimbólumok", emo: "Érzelmek", seq: "Eseménysor", mean: "Lehetséges jelentés" };
    case "de": return { s: "Zusammenfassung", d: "Detaillierte Analyse", sym: "Symbole", emo: "Emotionen", seq: "Ereignisablauf", mean: "Mögliche Bedeutung" };
    case "fr": return { s: "Résumé", d: "Analyse détaillée", sym: "Symboles", emo: "Émotions", seq: "Séquence d'événements", mean: "Signification possible" };
    case "it": return { s: "Riassunto", d: "Analisi dettagliata", sym: "Simboli", emo: "Emozioni", seq: "Sequenza di eventi", mean: "Significato possibile" };
    case "ru": return { s: "Краткое содержание", d: "Подробный анализ", sym: "Символы", emo: "Эмоции", seq: "Последовательность событий", mean: "Возможное значение" };
    case "es": return { s: "Resumen", d: "Análisis detallado", sym: "Símbolos", emo: "Emociones", seq: "Secuencia de eventos", mean: "Significado posible" };
    case "pt": return { s: "Resumo", d: "Análise detalhada", sym: "Símbolos", emo: "Emoções", seq: "Sequência de eventos", mean: "Significado possível" };
    case "zh": return { s: "总结", d: "详细分析", sym: "符号", emo: "情绪", seq: "事件顺序", mean: "可能的含义" };
    case "ja": return { s: "要約", d: "詳細な分析", sym: "シンボル", emo: "感情", seq: "出来事の流れ", mean: "可能な意味" };
    case "ko": return { s: "요약", d: "자세한 분석", sym: "상징", emo: "감정", seq: "사건 순서", mean: "가능한 의미" };
    case "sw": return { s: "Muhtasari", d: "Uchambuzi wa kina", sym: "Alama", emo: "Hisia", seq: "Mtiririko wa matukio", mean: "Maana inayowezekana" };
    case "fa": return { s: "خلاصه", d: "تحلیل دقیق", sym: "نمادها", emo: "احساسات", seq: "دنباله‌ی رویدادها", mean: "معنای احتمالی" };
    case "ta": return { s: "சுருக்கம்", d: "விரிவான பகுப்பாய்வு", sym: "குறியீடுகள்", emo: "உணர்ச்சிகள்", seq: "நிகழ்வு வரிசை", mean: "சாத்தியமான பொருள்" };
    case "bn": return { s: "সারাংশ", d: "বিস্তারিত বিশ্লেষণ", sym: "প্রতীক", emo: "আবেগ", seq: "ঘটনার ধারা", mean: "সম্ভাব্য অর্থ" };
    case "hi": return { s: "सारांश", d: "विस्तृत विश्लेषण", sym: "प्रतीक", emo: "भावनाएँ", seq: "घटना क्रम", mean: "संभावित अर्थ" };
    case "id": return { s: "Ringkasan", d: "Analisis Mendetail", sym: "Simbol", emo: "Emosi", seq: "Urutan Kejadian", mean: "Kemungkinan Makna" };
    case "th": return { s: "สรุป", d: "การวิเคราะห์โดยละเอียด", sym: "สัญลักษณ์", emo: "อารมณ์", seq: "ลำดับเหตุการณ์", mean: "ความหมายที่เป็นไปได้" };
    case "vi": return { s: "Tóm tắt", d: "Phân tích chi tiết", sym: "Biểu tượng", emo: "Cảm xúc", seq: "Trình tự sự kiện", mean: "Ý nghĩa có thể" };
    case "ur": return { s: "خلاصہ", d: "تفصیلی تجزیہ", sym: "علامات", emo: "جذبات", seq: "واقعات کا سلسلہ", mean: "ممکنہ معنی" };
    case "te": return { s: "సారాంశం", d: "వివరణాత్మక విశ్లేషణ", sym: "చిహ్నాలు", emo: "భావోద్వేగాలు", seq: "సంఘటనల క్రమం", mean: "సాధ్యమైన అర్థం" };
    case "pl": return { s: "Podsumowanie", d: "Szczegółowa analiza", sym: "Symbole", emo: "Emocje", seq: "Kolejność zdarzeń", mean: "Możliwe znaczenie" };
    case "tr": return { s: "Özet", d: "Detaylı Analiz", sym: "Semboller", emo: "Duygular", seq: "Olay Akışı", mean: "Olası Anlam" };
    case "uk": return { s: "Підсумок", d: "Детальний аналіз", sym: "Символи", emo: "Емоції", seq: "Послідовність подій", mean: "Можливе значення" };
    case "ro": return { s: "Rezumat", d: "Analiză detaliată", sym: "Simboluri", emo: "Emoții", seq: "Secvența evenimentelor", mean: "Semnificație posibilă" };
    case "nl": return { s: "Samenvatting", d: "Gedetailleerde analyse", sym: "Symbolen", emo: "Emoties", seq: "Gebeurtenisvolgorde", mean: "Mogelijke betekenis" };
    case "ms": return { s: "Ringkasan", d: "Analisis Terperinci", sym: "Simbol", emo: "Emosi", seq: "Turutan Peristiwa", mean: "Maksud yang Mungkin" };
    case "ar": return { s: "الملخص", d: "التحليل التفصيلي", sym: "الرموز", emo: "المشاعر", seq: "تسلسل الأحداث", mean: "المعنى المحتمل" };
    default: return { s: "Summary", d: "Detailed Analysis", sym: "Symbols", emo: "Emotions", seq: "Event Sequence", mean: "Possible Meaning" };
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
    return true;
  }
}

// --- Retry helper ---
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const delay = Math.pow(2, attempt) * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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

    const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });


    const langCode = language || "en";
    const languageName = getLanguageName(langCode);
    const titles = getSectionTitles(langCode);

    const systemInstruction = `
You are an empathetic and insightful dream interpreter. Your goal is to provide a thoughtful, non-definitive interpretation of a user's dream.
Your tone should be supportive, curious, and gentle, like a wise guide. Never state interpretations as facts, but as possibilities for self-reflection.
Use phrases like "This could symbolize...", "Perhaps this reflects...", "It might suggest...".

IMPORTANT RULES:
1. Your ENTIRE response MUST be in ${languageName}.
2. DO NOT use ANY English words – not even for section titles.
3. Use ONLY the following section titles, EXACTLY as provided below.
4. Keep your response under 150 words.
5. Output MUST be in Markdown format.

### ${titles.s}
### ${titles.d}
- **${titles.sym}:**
- **${titles.emo}:**
- **${titles.seq}:**
- **${titles.mean}:**
`;

    const userPrompt = `
Here is my dream:
- Narrative: ${dreamNarrative}
- Key Symbols: ${symbols || "Not provided"}
- Emotions Felt: ${emotions || "Not provided"}
`;

    const fullPrompt = systemInstruction + "\n\n" + userPrompt;

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
      res.write(`data: ${JSON.stringify({ error: errorCode, message })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
};