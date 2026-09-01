/**
 * Social Content Schema Validation and Envelope Construction
 *
 * Implements strict, fail-closed validation for AI creative payloads
 * and deterministic prepared content envelopes without external dependencies.
 */

const {
  SOCIAL_SCHEMA_VERSION,
  SLIDE_COUNT,
  SLIDE_ROLES,
  TEXT_LIMITS
} = require("./config");
const { TOPIC_CATEGORY_IDS, isValidDateString } = require("./topics");

const FORBIDDEN_AI_FIELDS = Object.freeze([
  "publishDate",
  "contentId",
  "category",
  "storageKey",
  "media",
  "manifest",
  "platform",
  "googlePlayUrl",
  "url"
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /as an ai/i,
  /language model/i,
  /insert text here/i,
  /placeholder/i,
  /lorem ipsum/i,
  /your text here/i,
  /\[topic\]/i,
  /\[headline\]/i,
  /\[cta\]/i,
  /\btbd\b/i
]);

/**
 * Checks if a value is a plain object (not null, not array).
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Checks if a string contains forbidden placeholder or meta phrases.
 * @param {string} text
 * @returns {boolean}
 */
function hasPlaceholderText(text) {
  if (typeof text !== "string") return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Validates a single string field against presence, emptiness, max length, and placeholder rules.
 * @param {*} value
 * @param {string} fieldName
 * @param {number} maxLength
 * @param {string[]} errors
 */
function validateStringField(value, fieldName, maxLength, errors) {
  if (typeof value !== "string") {
    errors.push(`Field '${fieldName}' must be a string`);
    return;
  }
  if (value.trim().length === 0) {
    errors.push(`Field '${fieldName}' cannot be empty`);
    return;
  }
  if (value.length > maxLength) {
    errors.push(
      `Field '${fieldName}' exceeds maximum length of ${maxLength} characters (got ${value.length})`
    );
  }
  if (hasPlaceholderText(value)) {
    errors.push(`Field '${fieldName}' contains forbidden placeholder or meta text`);
  }
}

/**
 * Validates an AI-generated creative payload.
 * @param {*} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCreativePayload(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ["Creative payload must be a plain object"]
    };
  }

  // Reject unexpected top-level fields
  const allowedTopLevel = new Set(["topic", "slides", "captions"]);
  for (const key of Object.keys(payload)) {
    if (!allowedTopLevel.has(key)) {
      errors.push(`Unexpected top-level field '${key}' in creative payload`);
    }
  }

  // Reject forbidden backend-owned fields at top level
  for (const forbidden of FORBIDDEN_AI_FIELDS) {
    if (forbidden in payload) {
      errors.push(`Creative payload contains forbidden backend-owned field '${forbidden}'`);
    }
  }

  // Validate topic
  if (!("topic" in payload)) {
    errors.push("Missing required field 'topic'");
  } else if (typeof payload.topic !== "string") {
    errors.push("Field 'topic' must be a string");
  } else if (payload.topic.trim().length === 0) {
    errors.push("Field 'topic' cannot be empty");
  } else if (hasPlaceholderText(payload.topic)) {
    errors.push("Field 'topic' contains forbidden placeholder or meta text");
  }

  // Validate slides array
  if (!("slides" in payload)) {
    errors.push("Missing required field 'slides'");
  } else if (!Array.isArray(payload.slides)) {
    errors.push("Field 'slides' must be an array");
  } else if (payload.slides.length !== SLIDE_COUNT) {
    errors.push(
      `Field 'slides' must contain exactly ${SLIDE_COUNT} slides, received ${payload.slides.length}`
    );
  } else {
    for (let i = 0; i < payload.slides.length; i++) {
      const slide = payload.slides[i];
      const expectedRole = SLIDE_ROLES[i];
      const slidePath = `slides[${i}]`;

      if (!isPlainObject(slide)) {
        errors.push(`${slidePath} must be a plain object`);
        continue;
      }

      // Check forbidden fields inside slide
      for (const forbidden of FORBIDDEN_AI_FIELDS) {
        if (forbidden in slide) {
          errors.push(`${slidePath} contains forbidden backend-owned field '${forbidden}'`);
        }
      }

      if (slide.role !== expectedRole) {
        errors.push(`${slidePath} role must be '${expectedRole}', received '${slide.role}'`);
      }

      if (expectedRole === "cover") {
        const allowedCoverKeys = new Set(["role", "headline", "subheadline"]);
        for (const key of Object.keys(slide)) {
          if (!allowedCoverKeys.has(key)) {
            errors.push(`Unexpected field '${key}' in ${slidePath}`);
          }
        }
        if (!("headline" in slide)) {
          errors.push(`Missing required field 'headline' in ${slidePath}`);
        } else {
          validateStringField(
            slide.headline,
            `${slidePath}.headline`,
            TEXT_LIMITS.COVER_HEADLINE_MAX,
            errors
          );
        }
        if (!("subheadline" in slide)) {
          errors.push(`Missing required field 'subheadline' in ${slidePath}`);
        } else {
          validateStringField(
            slide.subheadline,
            `${slidePath}.subheadline`,
            TEXT_LIMITS.COVER_SUBHEADLINE_MAX,
            errors
          );
        }
      } else if (expectedRole === "content") {
        const allowedContentKeys = new Set(["role", "title", "body"]);
        for (const key of Object.keys(slide)) {
          if (!allowedContentKeys.has(key)) {
            errors.push(`Unexpected field '${key}' in ${slidePath}`);
          }
        }
        if (!("title" in slide)) {
          errors.push(`Missing required field 'title' in ${slidePath}`);
        } else {
          validateStringField(
            slide.title,
            `${slidePath}.title`,
            TEXT_LIMITS.CONTENT_TITLE_MAX,
            errors
          );
        }
        if (!("body" in slide)) {
          errors.push(`Missing required field 'body' in ${slidePath}`);
        } else {
          validateStringField(
            slide.body,
            `${slidePath}.body`,
            TEXT_LIMITS.CONTENT_BODY_MAX,
            errors
          );
        }
      } else if (expectedRole === "cta") {
        const allowedCtaKeys = new Set(["role", "headline", "body"]);
        for (const key of Object.keys(slide)) {
          if (!allowedCtaKeys.has(key)) {
            errors.push(`Unexpected field '${key}' in ${slidePath}`);
          }
        }
        if (!("headline" in slide)) {
          errors.push(`Missing required field 'headline' in ${slidePath}`);
        } else {
          validateStringField(
            slide.headline,
            `${slidePath}.headline`,
            TEXT_LIMITS.CTA_HEADLINE_MAX,
            errors
          );
        }
        if (!("body" in slide)) {
          errors.push(`Missing required field 'body' in ${slidePath}`);
        } else {
          validateStringField(
            slide.body,
            `${slidePath}.body`,
            TEXT_LIMITS.CTA_BODY_MAX,
            errors
          );
        }
      }
    }
  }

  // Validate captions object
  if (!("captions" in payload)) {
    errors.push("Missing required field 'captions'");
  } else if (!isPlainObject(payload.captions)) {
    errors.push("Field 'captions' must be a plain object");
  } else {
    const allowedCaptionsKeys = new Set(["instagram", "facebook"]);
    for (const key of Object.keys(payload.captions)) {
      if (!allowedCaptionsKeys.has(key)) {
        errors.push(`Unexpected field '${key}' in captions`);
      }
    }
    for (const forbidden of FORBIDDEN_AI_FIELDS) {
      if (forbidden in payload.captions) {
        errors.push(`captions contains forbidden backend-owned field '${forbidden}'`);
      }
    }
    if (!("instagram" in payload.captions)) {
      errors.push("Missing required field 'instagram' in captions");
    } else {
      validateStringField(
        payload.captions.instagram,
        "captions.instagram",
        TEXT_LIMITS.INSTAGRAM_CAPTION_MAX,
        errors
      );
    }
    if (!("facebook" in payload.captions)) {
      errors.push("Missing required field 'facebook' in captions");
    } else {
      validateStringField(
        payload.captions.facebook,
        "captions.facebook",
        TEXT_LIMITS.FACEBOOK_CAPTION_MAX,
        errors
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Builds deterministic prepared-content envelope.
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string} params.category Configured category ID
 * @param {object} params.creative Validated creative payload
 * @returns {object} Prepared content envelope
 */
function buildPreparedContent({ publishDate, category, creative } = {}) {
  const errors = [];

  if (!isValidDateString(publishDate)) {
    errors.push(`Invalid publishDate: expected strict YYYY-MM-DD format, received '${publishDate}'`);
  }

  if (typeof category !== "string" || !TOPIC_CATEGORY_IDS.includes(category)) {
    errors.push(`Invalid category: '${category}'. Must be one of: ${TOPIC_CATEGORY_IDS.join(", ")}`);
  }

  const creativeValidation = validateCreativePayload(creative);
  if (!creativeValidation.valid) {
    errors.push(...creativeValidation.errors);
  }

  if (errors.length > 0) {
    const error = new Error(`Failed to build prepared content: ${errors.join("; ")}`);
    error.errors = errors;
    throw error;
  }

  return {
    schemaVersion: SOCIAL_SCHEMA_VERSION,
    publishDate,
    contentId: `social-${publishDate}`,
    category,
    slideCount: SLIDE_COUNT,
    creative
  };
}

/**
 * Validates a deterministic prepared content envelope.
 * @param {*} prepared
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePreparedContent(prepared) {
  const errors = [];

  if (!isPlainObject(prepared)) {
    return {
      valid: false,
      errors: ["Prepared content must be a plain object"]
    };
  }

  const allowedKeys = new Set([
    "schemaVersion",
    "publishDate",
    "contentId",
    "category",
    "slideCount",
    "creative"
  ]);

  for (const key of Object.keys(prepared)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unexpected field '${key}' in prepared content`);
    }
  }

  if (prepared.schemaVersion !== SOCIAL_SCHEMA_VERSION) {
    errors.push(
      `Invalid schemaVersion: expected ${SOCIAL_SCHEMA_VERSION}, received ${prepared.schemaVersion}`
    );
  }

  if (!isValidDateString(prepared.publishDate)) {
    errors.push(
      `Invalid publishDate: expected strict YYYY-MM-DD format, received '${prepared.publishDate}'`
    );
  }

  const expectedContentId = typeof prepared.publishDate === "string" ? `social-${prepared.publishDate}` : null;
  if (!prepared.contentId || prepared.contentId !== expectedContentId) {
    errors.push(`Invalid contentId: expected '${expectedContentId}', received '${prepared.contentId}'`);
  }

  if (typeof prepared.category !== "string" || !TOPIC_CATEGORY_IDS.includes(prepared.category)) {
    errors.push(`Invalid category: '${prepared.category}'. Must be one of: ${TOPIC_CATEGORY_IDS.join(", ")}`);
  }

  if (prepared.slideCount !== SLIDE_COUNT) {
    errors.push(`Invalid slideCount: expected ${SLIDE_COUNT}, received ${prepared.slideCount}`);
  }

  if (!("creative" in prepared)) {
    errors.push("Missing required field 'creative'");
  } else {
    const creativeValidation = validateCreativePayload(prepared.creative);
    if (!creativeValidation.valid) {
      errors.push(...creativeValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  FORBIDDEN_AI_FIELDS,
  PLACEHOLDER_PATTERNS,
  validateCreativePayload,
  buildPreparedContent,
  validatePreparedContent
};
