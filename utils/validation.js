// utils/validation.js
const config = require("./config");

// Complete 32-language catalog aligned with Android client localizations
const SUPPORTED_LANGUAGES = {
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
  cs: "Czech",
  el: "Greek",
  hr: "Croatian",
  sk: "Slovak",
};

// Regional, BCP-47, and Android legacy language alias mapping
const LANGUAGE_ALIASES = {
  in: "id", // Legacy Android Locale.getLanguage() for Indonesian
  "pt-br": "pt",
  "pt-rbr": "pt",
  pt_br: "pt",
  "pt-pt": "pt",
  pt_pt: "pt",
  "zh-cn": "zh",
  "zh-hans": "zh",
  "zh-sg": "zh",
  zh_cn: "zh",
  "zh-tw": "zh",
  "zh-hant": "zh",
  "zh-hk": "zh",
  zh_tw: "zh",
  "bn-in": "bn",
  "bn-rin": "bn",
  bn_in: "bn",
  "en-us": "en",
  "en-gb": "en",
  "en-ca": "en",
  "en-au": "en",
  "es-es": "es",
  "es-mx": "es",
  "es-419": "es",
  "es-us": "es",
  "fr-fr": "fr",
  "fr-ca": "fr",
  "fr-ch": "fr",
  "fr-be": "fr",
  "de-de": "de",
  "de-at": "de",
  "de-ch": "de",
};

function normalizeLanguageCode(rawLang) {
  if (!rawLang || typeof rawLang !== "string") return null;
  const clean = rawLang.trim().toLowerCase().replace(/_/g, "-");

  // Direct supported code
  if (SUPPORTED_LANGUAGES[clean]) {
    return clean;
  }

  // Alias / BCP-47 / Legacy mapping
  if (LANGUAGE_ALIASES[clean]) {
    return LANGUAGE_ALIASES[clean];
  }

  // Primary subtag fallback (e.g. "en-NZ" -> "en")
  const primarySubtag = clean.split("-")[0];
  if (SUPPORTED_LANGUAGES[primarySubtag]) {
    return primarySubtag;
  }
  if (LANGUAGE_ALIASES[primarySubtag]) {
    return LANGUAGE_ALIASES[primarySubtag];
  }

  return null;
}

function validateInterpretationRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      isValid: false,
      status: 400,
      error: "invalid_payload",
      message: "Request body must be a valid JSON object.",
    };
  }

  const { dreamNarrative, symbols, emotions, language } = body;

  // 1. dreamNarrative validation (Required, string, length bounds: max 3000 chars)
  if (typeof dreamNarrative !== "string" || dreamNarrative.trim().length === 0) {
    return {
      isValid: false,
      status: 400,
      error: "missing_dream",
      message: "Dream narrative is required and must be a non-empty string.",
    };
  }

  if (dreamNarrative.length > config.MAX_DREAM_CHARS) {
    return {
      isValid: false,
      status: 400,
      error: "dream_too_long",
      message: `Dream narrative exceeds maximum length of ${config.MAX_DREAM_CHARS} characters.`,
    };
  }

  // 2. symbols validation (Optional, string, length bounds: max 500 chars)
  if (symbols !== undefined && symbols !== null) {
    if (typeof symbols !== "string") {
      return {
        isValid: false,
        status: 400,
        error: "invalid_symbols",
        message: "Symbols field must be a string.",
      };
    }
    if (symbols.length > config.MAX_SYMBOLS_CHARS) {
      return {
        isValid: false,
        status: 400,
        error: "symbols_too_long",
        message: `Symbols field exceeds maximum length of ${config.MAX_SYMBOLS_CHARS} characters.`,
      };
    }
  }

  // 3. emotions validation (Optional, string, length bounds: max 500 chars)
  if (emotions !== undefined && emotions !== null) {
    if (typeof emotions !== "string") {
      return {
        isValid: false,
        status: 400,
        error: "invalid_emotions",
        message: "Emotions field must be a string.",
      };
    }
    if (emotions.length > config.MAX_EMOTIONS_CHARS) {
      return {
        isValid: false,
        status: 400,
        error: "emotions_too_long",
        message: `Emotions field exceeds maximum length of ${config.MAX_EMOTIONS_CHARS} characters.`,
      };
    }
  }

  // 4. language validation (Optional, supported 32-language whitelist & BCP-47 / legacy alias normalization)
  let langCode = "en";
  if (language !== undefined && language !== null) {
    if (typeof language !== "string") {
      return {
        isValid: false,
        status: 400,
        error: "invalid_language",
        message: "Language field must be a string.",
      };
    }

    if (language.length > config.MAX_LANGUAGE_CHARS) {
      return {
        isValid: false,
        status: 400,
        error: "unsupported_language",
        message: `Language code exceeds maximum length of ${config.MAX_LANGUAGE_CHARS} characters.`,
      };
    }

    const normalized = normalizeLanguageCode(language);
    if (!normalized) {
      return {
        isValid: false,
        status: 400,
        error: "unsupported_language",
        message: `Language '${language}' is not supported. Supported codes: ${Object.keys(SUPPORTED_LANGUAGES).join(", ")}.`,
      };
    }
    langCode = normalized;
  }

  return {
    isValid: true,
    sanitized: {
      dreamNarrative: dreamNarrative.trim(),
      symbols: symbols && typeof symbols === "string" ? symbols.trim() : "",
      emotions: emotions && typeof emotions === "string" ? emotions.trim() : "",
      language: langCode,
      languageName: SUPPORTED_LANGUAGES[langCode],
    },
  };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  LANGUAGE_ALIASES,
  normalizeLanguageCode,
  validateInterpretationRequest,
};
