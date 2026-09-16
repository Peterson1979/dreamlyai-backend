/**
 * Dream Topic Model for DreamlyAI Content Engine
 *
 * Core domain entity representing a canonical dream topic, symbol, or theme.
 * Reusable foundation for SEO articles, social carousels, Pinterest pins,
 * and app acquisition content.
 */

const ID_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEFAULT_CTA = Object.freeze({
  headline: "Reflect on Your Dreams with Dreamly AI",
  body: "Track patterns, log symbols, and explore personal reflections in a private journal.",
  buttonText: "Try Dreamly AI on Google Play"
});

/**
 * Validates whether a value is a non-empty string.
 * @param {*} val
 * @returns {boolean}
 */
function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Validates a structured appCTA object or string.
 * @param {*} cta
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAppCTA(cta) {
  const errors = [];
  if (cta === undefined || cta === null) {
    errors.push("appCTA is required");
    return { valid: false, errors };
  }

  if (typeof cta === "string") {
    if (cta.trim().length === 0) {
      errors.push("appCTA string cannot be empty");
    }
  } else if (typeof cta === "object" && !Array.isArray(cta)) {
    if (!isNonEmptyString(cta.headline)) {
      errors.push("appCTA.headline must be a non-empty string");
    }
    if (!isNonEmptyString(cta.body)) {
      errors.push("appCTA.body must be a non-empty string");
    }
    if (cta.buttonText !== undefined && !isNonEmptyString(cta.buttonText)) {
      errors.push("appCTA.buttonText must be a non-empty string if provided");
    }
  } else {
    errors.push("appCTA must be an object or a non-empty string");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes an appCTA input into a canonical frozen object.
 * @param {string|object} cta
 * @returns {Readonly<{headline: string, body: string, buttonText: string}>}
 */
function normalizeAppCTA(cta) {
  if (typeof cta === "string") {
    return Object.freeze({
      headline: cta.trim(),
      body: DEFAULT_CTA.body,
      buttonText: DEFAULT_CTA.buttonText
    });
  }

  return Object.freeze({
    headline: cta.headline.trim(),
    body: cta.body.trim(),
    buttonText: isNonEmptyString(cta.buttonText)
      ? cta.buttonText.trim()
      : DEFAULT_CTA.buttonText
  });
}

/**
 * Validates a raw dream topic data object.
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDreamTopic(data) {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      errors: ["Topic data must be a non-null object"]
    };
  }

  // 1. id
  if (!isNonEmptyString(data.id)) {
    errors.push("id is required and must be a non-empty string");
  } else if (!ID_SLUG_REGEX.test(data.id.trim())) {
    errors.push(`id '${data.id}' must be lowercase alphanumeric with hyphens (kebab-case)`);
  }

  // 2. title
  if (!isNonEmptyString(data.title)) {
    errors.push("title is required and must be a non-empty string");
  }

  // 3. category
  if (!isNonEmptyString(data.category)) {
    errors.push("category is required and must be a non-empty string");
  }

  // 4. keywords
  if (!Array.isArray(data.keywords) || data.keywords.length === 0) {
    errors.push("keywords must be a non-empty array of strings");
  } else {
    const hasInvalidKeyword = data.keywords.some((k) => !isNonEmptyString(k));
    if (hasInvalidKeyword) {
      errors.push("all keywords must be non-empty strings");
    }
  }

  // 5. searchIntent
  if (!isNonEmptyString(data.searchIntent)) {
    errors.push("searchIntent is required and must be a non-empty string");
  }

  // 6. socialAngles
  if (!Array.isArray(data.socialAngles) || data.socialAngles.length === 0) {
    errors.push("socialAngles must be a non-empty array of strings");
  } else {
    const hasInvalidAngle = data.socialAngles.some((a) => !isNonEmptyString(a));
    if (hasInvalidAngle) {
      errors.push("all socialAngles must be non-empty strings");
    }
  }

  // 7. priority
  if (typeof data.priority !== "number" || !Number.isInteger(data.priority) || data.priority < 1 || data.priority > 100) {
    errors.push("priority must be an integer between 1 and 100");
  }

  // 8. appCTA
  const ctaValidation = validateAppCTA(data.appCTA);
  if (!ctaValidation.valid) {
    errors.push(...ctaValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Creates and freezes a canonical DreamTopic instance.
 * Throws an Error if validation fails.
 *
 * @param {object} data
 * @param {string} data.id Unique kebab-case slug
 * @param {string} data.title Human-readable topic title
 * @param {string} data.category Primary topic category
 * @param {string[]} data.keywords Array of SEO/search keywords
 * @param {string} data.searchIntent User search intent description
 * @param {string[]} data.socialAngles Hooks and angles for social/visual content
 * @param {number} data.priority Integer priority ranking (1-100, 1 = highest)
 * @param {string|object} data.appCTA App call to action hook
 * @returns {Readonly<object>}
 */
function createDreamTopic(data) {
  const validation = validateDreamTopic(data);
  if (!validation.valid) {
    throw new Error(`Invalid DreamTopic data: ${validation.errors.join("; ")}`);
  }

  const topic = {
    id: data.id.trim(),
    title: data.title.trim(),
    category: data.category.trim(),
    keywords: Object.freeze(data.keywords.map((k) => k.trim())),
    searchIntent: data.searchIntent.trim(),
    socialAngles: Object.freeze(data.socialAngles.map((a) => a.trim())),
    priority: data.priority,
    appCTA: normalizeAppCTA(data.appCTA)
  };

  return Object.freeze(topic);
}

module.exports = {
  ID_SLUG_REGEX,
  DEFAULT_CTA,
  validateDreamTopic,
  validateAppCTA,
  createDreamTopic
};
