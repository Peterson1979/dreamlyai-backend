/**
 * Social Publication Manifest Creation and Validation
 *
 * Implements deterministic publication manifest generation linking validated creative content
 * with Cloudflare R2 stored media assets.
 */

const {
  SOCIAL_SCHEMA_VERSION,
  SLIDE_COUNT,
  SLIDE_ROLES,
  TEXT_LIMITS
} = require("./config");
const { TOPIC_CATEGORY_IDS, isValidDateString } = require("./topics");
const { validatePreparedContent } = require("./contentSchema");
const { buildSlideStorageKey } = require("./storageConfig");
const { WIDTH, HEIGHT } = require("./renderConfig");

/**
 * Checks if a value is a plain object.
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Builds a strict deterministic publication manifest.
 * @param {object} params
 * @param {object} params.preparedContent Validated prepared content envelope
 * @param {object} params.storageResult Validated Cloudflare R2 storage result
 * @returns {object} Manifest object
 */
function buildManifest({ preparedContent, storageResult } = {}) {
  const contentValidation = validatePreparedContent(preparedContent);
  if (!contentValidation.valid) {
    throw new Error(
      `Cannot build manifest: prepared content is invalid: ${contentValidation.errors.join("; ")}`
    );
  }

  if (!isPlainObject(storageResult)) {
    throw new Error("Cannot build manifest: storageResult must be a plain object");
  }

  if (storageResult.provider !== "cloudflare-r2") {
    throw new Error(
      `Cannot build manifest: storageResult provider must be 'cloudflare-r2', received '${storageResult.provider}'`
    );
  }

  if (storageResult.slideCount !== SLIDE_COUNT) {
    throw new Error(
      `Cannot build manifest: storageResult slideCount must be ${SLIDE_COUNT}, received ${storageResult.slideCount}`
    );
  }

  if (!Array.isArray(storageResult.media) || storageResult.media.length !== SLIDE_COUNT) {
    throw new Error(
      `Cannot build manifest: storageResult media must be an array of length ${SLIDE_COUNT}`
    );
  }

  const mediaItems = [];
  const allowedMediaKeys = new Set([
    "index",
    "role",
    "key",
    "url",
    "contentType",
    "width",
    "height",
    "byteLength"
  ]);

  for (let i = 0; i < storageResult.media.length; i++) {
    const item = storageResult.media[i];
    const expectedIndex = i + 1;
    const expectedRole = SLIDE_ROLES[i];
    const expectedKey = buildSlideStorageKey(preparedContent.publishDate, expectedIndex);

    if (!isPlainObject(item)) {
      throw new Error(`Cannot build manifest: media[${i}] must be a plain object`);
    }

    for (const key of Object.keys(item)) {
      if (!allowedMediaKeys.has(key)) {
        throw new Error(`Cannot build manifest: unexpected field '${key}' in media[${i}]`);
      }
    }

    if (item.index !== expectedIndex) {
      throw new Error(
        `Cannot build manifest: media[${i}] index must be ${expectedIndex}, received ${item.index}`
      );
    }

    if (item.role !== expectedRole) {
      throw new Error(
        `Cannot build manifest: media[${i}] role must be '${expectedRole}', received '${item.role}'`
      );
    }

    if (typeof item.key !== "string" || item.key !== expectedKey) {
      throw new Error(
        `Cannot build manifest: media[${i}] key must be '${expectedKey}', received '${item.key}'`
      );
    }

    if (typeof item.url !== "string") {
      throw new Error(`Cannot build manifest: media[${i}] url must be a string`);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(item.url);
    } catch (err) {
      throw new Error(`Cannot build manifest: media[${i}] url '${item.url}' is not a valid absolute URL`);
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error(
        `Cannot build manifest: media[${i}] url must use HTTPS protocol, received '${parsedUrl.protocol}'`
      );
    }

    if (!parsedUrl.pathname.endsWith(expectedKey)) {
      throw new Error(
        `Cannot build manifest: media[${i}] url pathname '${parsedUrl.pathname}' must end with storage key '${expectedKey}'`
      );
    }

    if (item.contentType !== "image/jpeg") {
      throw new Error(
        `Cannot build manifest: media[${i}] contentType must be 'image/jpeg', received '${item.contentType}'`
      );
    }

    if (item.width !== WIDTH) {
      throw new Error(
        `Cannot build manifest: media[${i}] width must be ${WIDTH}, received ${item.width}`
      );
    }

    if (item.height !== HEIGHT) {
      throw new Error(
        `Cannot build manifest: media[${i}] height must be ${HEIGHT}, received ${item.height}`
      );
    }

    if (!Number.isInteger(item.byteLength) || item.byteLength <= 10000) {
      throw new Error(
        `Cannot build manifest: media[${i}] byteLength must be integer > 10000, received ${item.byteLength}`
      );
    }

    mediaItems.push({
      index: expectedIndex,
      role: expectedRole,
      key: expectedKey,
      url: item.url,
      contentType: "image/jpeg",
      width: WIDTH,
      height: HEIGHT,
      byteLength: item.byteLength
    });
  }

  const manifest = {
    schemaVersion: SOCIAL_SCHEMA_VERSION,
    publishDate: preparedContent.publishDate,
    contentId: preparedContent.contentId,
    category: preparedContent.category,
    topic: preparedContent.creative.topic,
    slideCount: SLIDE_COUNT,
    media: mediaItems,
    captions: {
      instagram: preparedContent.creative.captions.instagram,
      facebook: preparedContent.creative.captions.facebook
    }
  };

  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Generated manifest failed validation: ${validation.errors.join("; ")}`);
  }

  return manifest;
}

/**
 * Strictly validates a publication manifest.
 * @param {*} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManifest(manifest) {
  const errors = [];

  if (!isPlainObject(manifest)) {
    return {
      valid: false,
      errors: ["Manifest must be a plain object"]
    };
  }

  const allowedTopLevel = new Set([
    "schemaVersion",
    "publishDate",
    "contentId",
    "category",
    "topic",
    "slideCount",
    "media",
    "captions"
  ]);

  for (const key of Object.keys(manifest)) {
    if (!allowedTopLevel.has(key)) {
      errors.push(`Unexpected top-level field '${key}' in manifest`);
    }
  }

  if (manifest.schemaVersion !== SOCIAL_SCHEMA_VERSION) {
    errors.push(
      `Invalid schemaVersion: expected ${SOCIAL_SCHEMA_VERSION}, received ${manifest.schemaVersion}`
    );
  }

  if (!isValidDateString(manifest.publishDate)) {
    errors.push(
      `Invalid publishDate: expected strict YYYY-MM-DD format, received '${manifest.publishDate}'`
    );
  }

  const expectedContentId =
    typeof manifest.publishDate === "string" ? `social-${manifest.publishDate}` : null;
  if (!manifest.contentId || manifest.contentId !== expectedContentId) {
    errors.push(
      `Invalid contentId: expected '${expectedContentId}', received '${manifest.contentId}'`
    );
  }

  if (typeof manifest.category !== "string" || !TOPIC_CATEGORY_IDS.includes(manifest.category)) {
    errors.push(
      `Invalid category: '${manifest.category}'. Must be one of: ${TOPIC_CATEGORY_IDS.join(", ")}`
    );
  }

  if (typeof manifest.topic !== "string" || manifest.topic.trim().length === 0) {
    errors.push("Field 'topic' must be a non-empty string");
  }

  if (manifest.slideCount !== SLIDE_COUNT) {
    errors.push(
      `Invalid slideCount: expected ${SLIDE_COUNT}, received ${manifest.slideCount}`
    );
  }

  if (!Array.isArray(manifest.media) || manifest.media.length !== SLIDE_COUNT) {
    errors.push(
      `Field 'media' must be an array of length ${SLIDE_COUNT}`
    );
  } else {
    const allowedMediaKeys = new Set([
      "index",
      "role",
      "key",
      "url",
      "contentType",
      "width",
      "height",
      "byteLength"
    ]);

    for (let i = 0; i < manifest.media.length; i++) {
      const item = manifest.media[i];
      const expectedIndex = i + 1;
      const expectedRole = SLIDE_ROLES[i];
      const mediaPath = `media[${i}]`;

      if (!isPlainObject(item)) {
        errors.push(`${mediaPath} must be a plain object`);
        continue;
      }

      for (const key of Object.keys(item)) {
        if (!allowedMediaKeys.has(key)) {
          errors.push(`Unexpected field '${key}' in ${mediaPath}`);
        }
      }

      if (item.index !== expectedIndex) {
        errors.push(`${mediaPath} index must be ${expectedIndex}, received ${item.index}`);
      }

      if (item.role !== expectedRole) {
        errors.push(`${mediaPath} role must be '${expectedRole}', received '${item.role}'`);
      }

      const expectedKey = isValidDateString(manifest.publishDate)
        ? buildSlideStorageKey(manifest.publishDate, expectedIndex)
        : null;

      if (typeof item.key !== "string" || (expectedKey && item.key !== expectedKey)) {
        errors.push(`${mediaPath} key must be '${expectedKey}', received '${item.key}'`);
      }

      if (typeof item.url !== "string") {
        errors.push(`${mediaPath} url must be a string`);
      } else {
        try {
          const parsed = new URL(item.url);
          if (parsed.protocol !== "https:") {
            errors.push(`${mediaPath} url must use HTTPS protocol, received '${parsed.protocol}'`);
          }
          if (expectedKey && !parsed.pathname.endsWith(expectedKey)) {
            errors.push(
              `${mediaPath} url pathname '${parsed.pathname}' must end with storage key '${expectedKey}'`
            );
          }
        } catch (err) {
          errors.push(`${mediaPath} url '${item.url}' is not a valid absolute URL`);
        }
      }

      if (item.contentType !== "image/jpeg") {
        errors.push(`${mediaPath} contentType must be 'image/jpeg', received '${item.contentType}'`);
      }

      if (item.width !== WIDTH) {
        errors.push(`${mediaPath} width must be ${WIDTH}, received ${item.width}`);
      }

      if (item.height !== HEIGHT) {
        errors.push(`${mediaPath} height must be ${HEIGHT}, received ${item.height}`);
      }

      if (!Number.isInteger(item.byteLength) || item.byteLength <= 10000) {
        errors.push(`${mediaPath} byteLength must be integer > 10000, received ${item.byteLength}`);
      }
    }
  }

  if (!isPlainObject(manifest.captions)) {
    errors.push("Field 'captions' must be a plain object");
  } else {
    const allowedCaptionsKeys = new Set(["instagram", "facebook"]);
    for (const key of Object.keys(manifest.captions)) {
      if (!allowedCaptionsKeys.has(key)) {
        errors.push(`Unexpected field '${key}' in captions`);
      }
    }

    if (
      typeof manifest.captions.instagram !== "string" ||
      manifest.captions.instagram.trim().length === 0
    ) {
      errors.push("Field 'captions.instagram' must be a non-empty string");
    } else if (manifest.captions.instagram.length > TEXT_LIMITS.INSTAGRAM_CAPTION_MAX) {
      errors.push(
        `Field 'captions.instagram' exceeds max length of ${TEXT_LIMITS.INSTAGRAM_CAPTION_MAX}`
      );
    }

    if (
      typeof manifest.captions.facebook !== "string" ||
      manifest.captions.facebook.trim().length === 0
    ) {
      errors.push("Field 'captions.facebook' must be a non-empty string");
    } else if (manifest.captions.facebook.length > TEXT_LIMITS.FACEBOOK_CAPTION_MAX) {
      errors.push(
        `Field 'captions.facebook' exceeds max length of ${TEXT_LIMITS.FACEBOOK_CAPTION_MAX}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  buildManifest,
  validateManifest
};
