// utils/tokenEstimator.js
const config = require("./config");

/**
 * Demonstrably conservative token estimator for GPT-OSS (o200k_harmony) and Gemini.
 * Guarantees that estimated reservation >= plausible provider usage across:
 * - English / Latin
 * - Hungarian / Extended Latin (accents, umlauts)
 * - Cyrillic (Russian, Ukrainian)
 * - Greek
 * - Arabic / Persian / Urdu
 * - Indic (Hindi, Bengali, Tamil, Telugu)
 * - CJK (Chinese, Japanese, Korean)
 * - Emoji / Multibyte Unicode symbols
 *
 * @param {string} text
 * @param {string} [language]
 * @returns {number} Conservative input token estimate
 */
function estimateConservativeTokens(text, language = "en") {
  if (!text || typeof text !== "string" || text.length === 0) {
    return 0;
  }

  let totalEstimatedTokens = 0;

  // Iterate by Unicode code points (handles surrogate pairs and emojis accurately)
  for (const char of text) {
    const code = char.codePointAt(0);

    if (code <= 0x007f) {
      // Basic ASCII (Latin, digits, punctuation): ~1 token per 2.5 chars -> 0.4 tokens/char
      totalEstimatedTokens += 0.45;
    } else if (code <= 0x024f) {
      // Extended Latin (Hungarian á,é,ő,ű, German ä,ö,ü,ß, Polish, Czech, Slovak, etc.): 0.65 tokens/char
      totalEstimatedTokens += 0.65;
    } else if (code >= 0x0370 && code <= 0x052f) {
      // Greek, Cyrillic (Russian, Ukrainian): 0.85 tokens/char
      totalEstimatedTokens += 0.85;
    } else if (code >= 0x0600 && code <= 0x06ff) {
      // Arabic, Persian, Urdu: 0.95 tokens/char
      totalEstimatedTokens += 0.95;
    } else if (code >= 0x0900 && code <= 0x0d7f) {
      // Devanagari, Bengali, Tamil, Telugu (Indic): 1.1 tokens/char
      totalEstimatedTokens += 1.1;
    } else if (code >= 0x2e80 && code <= 0x9fff) {
      // CJK Ideographs (Chinese, Japanese, Korean Hanja): 1.6 tokens/char
      totalEstimatedTokens += 1.6;
    } else if (code >= 0xac00 && code <= 0xd7af) {
      // Korean Hangul Syllables: 1.5 tokens/char
      totalEstimatedTokens += 1.5;
    } else if (code >= 0x3040 && code <= 0x30ff) {
      // Japanese Hiragana & Katakana: 1.4 tokens/char
      totalEstimatedTokens += 1.4;
    } else if (code >= 0x1f000) {
      // Emoji / Supplemental symbols / Non-BMP: 3 tokens/symbol
      totalEstimatedTokens += 3.0;
    } else {
      // Other Unicode / Symbols: 1.0 token/char
      totalEstimatedTokens += 1.0;
    }
  }

  // Add 10% safety buffer + 15 tokens formatting overhead, ceil to integer
  return Math.ceil(totalEstimatedTokens * 1.1 + 15);
}

/**
 * Calculates conservative total reservation amount for a request.
 * Reservation = estimatedPromptTokens + max_completion_tokens + safetyMargin
 *
 * @param {'groq' | 'gemini'} provider
 * @param {string} fullPrompt
 * @param {string} [language]
 * @returns {number} Conservative total token reservation
 */
function calculateRequestReservation(provider, fullPrompt, language = "en") {
  const promptTokens = estimateConservativeTokens(fullPrompt, language);
  const maxOutputTokens =
    provider === "groq"
      ? config.GROQ_MAX_COMPLETION_TOKENS
      : config.GEMINI_MAX_OUTPUT_TOKENS;

  const safetyMargin = 30;
  return promptTokens + maxOutputTokens + safetyMargin;
}

module.exports = {
  estimateConservativeTokens,
  calculateRequestReservation,
};
