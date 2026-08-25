// utils/config.js

function getIntEnv(key, defaultValue) {
  const val = process.env[key];
  if (val !== undefined && val !== null && val !== "") {
    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return defaultValue;
}

module.exports = {
  // Token Budgets (Daily limits)
  get GROQ_DAILY_TOKEN_LIMIT() {
    return getIntEnv("GROQ_DAILY_TOKEN_LIMIT", 170000);
  },
  get GEMINI_DAILY_TOKEN_LIMIT() {
    return getIntEnv("GEMINI_DAILY_TOKEN_LIMIT", 20000);
  },
  get AI_TOTAL_DAILY_TOKEN_LIMIT() {
    return getIntEnv("AI_TOTAL_DAILY_TOKEN_LIMIT", 190000);
  },

  // Groq Free-Tier Guardrails
  get GROQ_RPM_LIMIT() {
    return getIntEnv("GROQ_RPM_LIMIT", 25);
  },
  get GROQ_RPD_LIMIT() {
    return getIntEnv("GROQ_RPD_LIMIT", 900);
  },
  get GROQ_TPM_LIMIT() {
    return getIntEnv("GROQ_TPM_LIMIT", 7000);
  },

  // Rate Limits
  get AI_PER_IP_RPM_LIMIT() {
    return getIntEnv("AI_PER_IP_RPM_LIMIT", 5);
  },
  get AI_GLOBAL_RPM_LIMIT() {
    return getIntEnv("AI_GLOBAL_RPM_LIMIT", 25);
  },

  // Payload Limits
  get MAX_DREAM_CHARS() {
    return getIntEnv("MAX_DREAM_CHARS", 3000);
  },
  get MAX_SYMBOLS_CHARS() {
    return getIntEnv("MAX_SYMBOLS_CHARS", 500);
  },
  get MAX_EMOTIONS_CHARS() {
    return getIntEnv("MAX_EMOTIONS_CHARS", 500);
  },
  get MAX_LANGUAGE_CHARS() {
    return getIntEnv("MAX_LANGUAGE_CHARS", 15);
  },

  // Timeouts (ms)
  get GROQ_TIMEOUT_MS() {
    return getIntEnv("GROQ_TIMEOUT_MS", 15000);
  },
  get GEMINI_TIMEOUT_MS() {
    return getIntEnv("GEMINI_TIMEOUT_MS", 20000);
  },

  // Exact In-flight Lock TTL (seconds): Groq timeout (15s) + Gemini timeout (20s) + 10s orchestration safety margin = 45s
  get DUPLICATE_LOCK_TTL_SECONDS() {
    return getIntEnv("DUPLICATE_LOCK_TTL_SECONDS", 45);
  },

  // Models & Gen Config
  GROQ_MODEL: "openai/gpt-oss-20b",
  GEMINI_MODEL: "gemini-2.5-flash-lite",
  GROQ_REASONING_EFFORT: "low",
  GROQ_MAX_COMPLETION_TOKENS: 550,
  GEMINI_MAX_OUTPUT_TOKENS: 500,
  TEMPERATURE: 0.7,
};
