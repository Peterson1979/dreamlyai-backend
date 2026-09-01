/**
 * Cloudflare R2 Storage Layer for DreamlyAI Social Pipeline
 *
 * Provides fail-closed, deterministic upload of rendered social carousel slides to R2
 * via AWS S3 SDK with strict pre-upload validation and metadata tagging.
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { validatePreparedContent } = require("./contentSchema");
const {
  loadR2Config,
  buildSlideStorageKey,
  buildPublicMediaUrl
} = require("./storageConfig");
const { WIDTH, HEIGHT, FORMAT } = require("./renderConfig");
const { SLIDE_COUNT, SLIDE_ROLES } = require("./config");

/**
 * Checks if a value is a plain object.
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Creates an S3Client instance configured for Cloudflare R2.
 * @param {object} config
 * @param {string} config.endpoint
 * @param {string} config.accessKeyId
 * @param {string} config.secretAccessKey
 * @returns {S3Client}
 */
function createR2Client(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid config passed to createR2Client: expected config object");
  }
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

/**
 * Validates a rendered carousel object before any storage provider writes.
 * @param {*} carousel
 */
function validateRenderedCarousel(carousel) {
  if (!isPlainObject(carousel)) {
    throw new Error("Invalid renderedCarousel: expected a plain object");
  }

  if (carousel.width !== WIDTH) {
    throw new Error(`Invalid renderedCarousel width: expected ${WIDTH}, received ${carousel.width}`);
  }

  if (carousel.height !== HEIGHT) {
    throw new Error(`Invalid renderedCarousel height: expected ${HEIGHT}, received ${carousel.height}`);
  }

  if (carousel.format !== FORMAT) {
    throw new Error(`Invalid renderedCarousel format: expected '${FORMAT}', received '${carousel.format}'`);
  }

  if (carousel.slideCount !== SLIDE_COUNT) {
    throw new Error(`Invalid renderedCarousel slideCount: expected ${SLIDE_COUNT}, received ${carousel.slideCount}`);
  }

  if (!Array.isArray(carousel.slides) || carousel.slides.length !== SLIDE_COUNT) {
    throw new Error(
      `Invalid renderedCarousel slides: expected array of length ${SLIDE_COUNT}, received ${
        Array.isArray(carousel.slides) ? carousel.slides.length : typeof carousel.slides
      }`
    );
  }

  for (let i = 0; i < carousel.slides.length; i++) {
    const slide = carousel.slides[i];
    const expectedIndex = i + 1;
    const expectedRole = SLIDE_ROLES[i];

    if (!isPlainObject(slide)) {
      throw new Error(`Invalid slide at index ${i}: expected a plain object`);
    }

    if (slide.index !== expectedIndex) {
      throw new Error(`Invalid slide index at position ${i}: expected ${expectedIndex}, received ${slide.index}`);
    }

    if (slide.role !== expectedRole) {
      throw new Error(`Invalid slide role at position ${i}: expected '${expectedRole}', received '${slide.role}'`);
    }

    if (!Buffer.isBuffer(slide.buffer)) {
      throw new Error(`Invalid slide buffer at position ${i}: expected a Buffer instance`);
    }

    if (slide.byteLength !== slide.buffer.length) {
      throw new Error(
        `Slide byteLength mismatch at position ${i}: declared ${slide.byteLength}, actual buffer length ${slide.buffer.length}`
      );
    }

    if (slide.byteLength <= 10000) {
      throw new Error(
        `Slide buffer too small at position ${i}: byteLength ${slide.byteLength} must be > 10000`
      );
    }
  }
}

/**
 * Uploads a validated rendered carousel to Cloudflare R2.
 * @param {object} params
 * @param {object} params.preparedContent Validated prepared content envelope
 * @param {object} params.renderedCarousel Validated rendered carousel object
 * @param {S3Client} [params.client] Optional injected S3Client instance for testing
 * @param {object} [params.config] Optional injected R2 config for testing
 * @returns {Promise<{ provider: string, slideCount: number, media: Array<{ index: number, role: string, key: string, url: string, contentType: string, width: number, height: number, byteLength: number }> }>}
 */
async function uploadRenderedCarousel({
  preparedContent,
  renderedCarousel,
  client,
  config
} = {}) {
  // 1. Strict pre-upload validation of prepared content
  const contentValidation = validatePreparedContent(preparedContent);
  if (!contentValidation.valid) {
    throw new Error(
      `Pre-upload validation failed for prepared content: ${contentValidation.errors.join("; ")}`
    );
  }

  // 2. Strict pre-upload validation of rendered carousel
  validateRenderedCarousel(renderedCarousel);

  // 3. Resolve configuration and client (supports dependency injection)
  const r2Config = config || loadR2Config();
  const r2Client = client || createR2Client(r2Config);

  const mediaRecords = [];

  // 4. Sequential deterministic upload of slides 1..5
  for (let i = 0; i < renderedCarousel.slides.length; i++) {
    const slide = renderedCarousel.slides[i];
    const storageKey = buildSlideStorageKey(preparedContent.publishDate, slide.index);
    const publicUrl = buildPublicMediaUrl(r2Config.publicBaseUrl, storageKey);

    const command = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: storageKey,
      Body: slide.buffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000",
      Metadata: {
        "content-id": preparedContent.contentId,
        "publish-date": preparedContent.publishDate,
        "slide-index": String(slide.index),
        "slide-role": slide.role
      }
    });

    await r2Client.send(command);

    mediaRecords.push({
      index: slide.index,
      role: slide.role,
      key: storageKey,
      url: publicUrl,
      contentType: "image/jpeg",
      width: renderedCarousel.width,
      height: renderedCarousel.height,
      byteLength: slide.byteLength
    });
  }

  return {
    provider: "cloudflare-r2",
    slideCount: mediaRecords.length,
    media: mediaRecords
  };
}

module.exports = {
  createR2Client,
  uploadRenderedCarousel,
  validateRenderedCarousel
};
