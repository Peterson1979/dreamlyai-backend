/**
 * Production Quality Gate and Duplicate History for DreamlyAI Social Pipeline
 *
 * Enforces cryptographic manifest/creative binding, Sharp image integrity checks,
 * deterministic caption validation, and Redis-backed 30-day Jaccard token / headline duplicate detection.
 */

const crypto = require("node:crypto");
const sharp = require("sharp");

const { validatePreparedContent } = require("./contentSchema");
const { validateManifest } = require("./manifest");
const { buildPlatformCaptions } = require("./captions");
const { isValidDateString } = require("./topics");
const { getRedisClient } = require("../utils/redisClient");
const { WIDTH, HEIGHT, FORMAT } = require("./renderConfig");
const { SLIDE_COUNT, SLIDE_ROLES, GOOGLE_PLAY_URL } = require("./config");

const QUALITY_GATE_VERSION = 1;

const QUALITY_STATUS = Object.freeze({
  PASS: "PASS",
  FAILED: "FAILED"
});

const STOPWORDS = Object.freeze(
  new Set([
    "the", "and", "that", "this", "with", "from", "your", "you", "are",
    "may", "might", "can", "dream", "dreams", "dreaming", "dreamlyai",
    "for", "our", "all", "about", "how", "what", "when", "why", "who",
    "which", "into", "over", "under", "more", "most", "some", "such",
    "is", "in", "it", "to", "of", "on", "as", "an", "a"
  ])
);

const JACCARD_DUPLICATE_THRESHOLD = 0.72;

/**
 * Checks if a value is a plain object.
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Resolves Redis client instance.
 * @param {object} [injectedRedis]
 * @returns {object}
 */
function resolveRedis(injectedRedis) {
  if (injectedRedis) return injectedRedis;
  const client = getRedisClient();
  if (!client) {
    throw new Error("Redis client is unavailable");
  }
  return client;
}

/**
 * Recursively produces deterministic canonical JSON representation.
 * @param {*} val
 * @returns {string}
 */
function canonicalJsonStringify(val) {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return "[" + val.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(val).sort();
  const entries = keys.map(
    (key) => JSON.stringify(key) + ":" + canonicalJsonStringify(val[key])
  );
  return "{" + entries.join(",") + "}";
}

/**
 * Computes lowercase hexadecimal SHA-256 digest of canonicalized object.
 * @param {*} data
 * @returns {string}
 */
function computeDigest(data) {
  return crypto
    .createHash("sha256")
    .update(canonicalJsonStringify(data))
    .digest("hex");
}

/**
 * Computes SHA-256 digest of validated publication manifest.
 * @param {object} manifest
 * @returns {string}
 */
function computeManifestDigest(manifest) {
  return computeDigest(manifest);
}

/**
 * Computes SHA-256 digest of validated creative payload.
 * @param {object} creative
 * @returns {string}
 */
function computeCreativeDigest(creative) {
  return computeDigest(creative);
}

/**
 * Normalizes text for comparison (Unicode NFKD, lowercase, punctuation stripped).
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Normalizes cover headline for exact headline reuse checks.
 * @param {string} headline
 * @returns {string}
 */
function normalizeHeadline(headline) {
  return normalizeText(headline);
}

/**
 * Extracts meaningful comparison tokens from creative content.
 * Excludes CTA slide (slide 4), captions, branding, and Google Play URL.
 * @param {object} creative
 * @returns {string[]} Sorted unique normalized tokens
 */
function extractComparisonTokens(creative) {
  if (!isPlainObject(creative)) return [];

  const textParts = [];
  if (typeof creative.topic === "string") textParts.push(creative.topic);

  if (Array.isArray(creative.slides)) {
    // Cover slide (index 0)
    if (creative.slides[0]) {
      if (creative.slides[0].headline) textParts.push(creative.slides[0].headline);
      if (creative.slides[0].subheadline) textParts.push(creative.slides[0].subheadline);
    }
    // Content slides (indices 1, 2, 3)
    for (let i = 1; i <= 3; i++) {
      const slide = creative.slides[i];
      if (slide) {
        if (slide.title) textParts.push(slide.title);
        if (slide.body) textParts.push(slide.body);
      }
    }
  }

  const combined = textParts.join(" ");
  const normalized = normalizeText(combined);
  const words = normalized.split(/\s+/).filter(Boolean);

  const tokens = new Set();
  for (const word of words) {
    if (word.length > 2 && !STOPWORDS.has(word)) {
      tokens.add(word);
    }
  }

  return Array.from(tokens).sort();
}

/**
 * Calculates Jaccard similarity between two token sets.
 * @param {string[]} tokensA
 * @param {string[]} tokensB
 * @returns {number}
 */
function calculateJaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Builds Redis key for Quality Gate state.
 * @param {string} publishDate
 * @returns {string}
 */
function buildQualityKey(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for quality key: '${publishDate}'`);
  }
  return `social:quality:${publishDate}`;
}

/**
 * Builds Redis key for content history record.
 * @param {string} publishDate
 * @returns {string}
 */
function buildHistoryKey(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for history key: '${publishDate}'`);
  }
  return `social:history:${publishDate}`;
}

/**
 * Evaluates the complete social publication artifact against Quality Gate rules.
 * Does NOT perform any Redis writes.
 * @param {object} params
 * @param {object} params.preparedContent Validated prepared content
 * @param {object} params.renderedCarousel Validated rendered carousel
 * @param {object} params.manifest Validated publication manifest
 * @param {Array<object>} [params.recentHistory=[]] Loaded history records
 * @returns {Promise<object>} Evaluation result
 */
async function evaluateQualityGate({
  preparedContent,
  renderedCarousel,
  manifest,
  recentHistory = []
} = {}) {
  const errorCodes = [];

  // A. Validate Prepared Content
  const prepVal = validatePreparedContent(preparedContent);
  if (!prepVal.valid) {
    errorCodes.push("PREPARED_CONTENT_INVALID");
  }

  // B. Validate Manifest & cross-check with preparedContent
  const manVal = validateManifest(manifest);
  if (!manVal.valid) {
    errorCodes.push("MANIFEST_INVALID");
  } else if (prepVal.valid) {
    if (
      manifest.schemaVersion !== preparedContent.schemaVersion ||
      manifest.publishDate !== preparedContent.publishDate ||
      manifest.contentId !== preparedContent.contentId ||
      manifest.category !== preparedContent.category ||
      manifest.topic !== preparedContent.creative.topic ||
      manifest.slideCount !== preparedContent.slideCount ||
      manifest.captions.instagram !== preparedContent.creative.captions.instagram ||
      manifest.captions.facebook !== preparedContent.creative.captions.facebook
    ) {
      errorCodes.push("MANIFEST_PREPARED_MISMATCH");
    }
  }

  // C. Final Platform Captions
  let finalCaptions;
  let finalCaptionsDigest = "";
  try {
    finalCaptions = buildPlatformCaptions(manifest);
    finalCaptionsDigest = computeDigest(finalCaptions);

    if (
      !finalCaptions.instagram ||
      finalCaptions.instagram !== manifest.captions.instagram
    ) {
      errorCodes.push("FINAL_CAPTIONS_INVALID");
    }

    if (
      !finalCaptions.facebook ||
      !finalCaptions.facebook.includes(GOOGLE_PLAY_URL) ||
      finalCaptions.facebook.split(GOOGLE_PLAY_URL).length !== 2
    ) {
      errorCodes.push("FINAL_CAPTIONS_INVALID");
    }
  } catch (err) {
    errorCodes.push("FINAL_CAPTIONS_INVALID");
  }

  // D. Rendered Carousel verification & Sharp inspection
  if (
    !isPlainObject(renderedCarousel) ||
    renderedCarousel.width !== WIDTH ||
    renderedCarousel.height !== HEIGHT ||
    renderedCarousel.format !== FORMAT ||
    renderedCarousel.slideCount !== SLIDE_COUNT ||
    !Array.isArray(renderedCarousel.slides) ||
    renderedCarousel.slides.length !== SLIDE_COUNT
  ) {
    errorCodes.push("RENDERED_CAROUSEL_INVALID");
  } else {
    for (let i = 0; i < renderedCarousel.slides.length; i++) {
      const slide = renderedCarousel.slides[i];
      const expectedIndex = i + 1;
      const expectedRole = SLIDE_ROLES[i];

      if (
        !isPlainObject(slide) ||
        slide.index !== expectedIndex ||
        slide.role !== expectedRole ||
        !Buffer.isBuffer(slide.buffer) ||
        slide.byteLength !== slide.buffer.length ||
        slide.byteLength <= 10000
      ) {
        errorCodes.push("RENDERED_CAROUSEL_INVALID");
        break;
      }

      try {
        const meta = await sharp(slide.buffer).metadata();
        if (
          meta.format !== "jpeg" ||
          meta.width !== WIDTH ||
          meta.height !== HEIGHT
        ) {
          errorCodes.push("RENDER_METADATA_CORRUPT");
          break;
        }
      } catch (err) {
        errorCodes.push("RENDER_METADATA_CORRUPT");
        break;
      }
    }
  }

  // E. Manifest / Render Consistency
  if (manVal.valid && isPlainObject(renderedCarousel) && Array.isArray(renderedCarousel.slides)) {
    if (manifest.media.length !== renderedCarousel.slides.length) {
      errorCodes.push("MANIFEST_RENDER_MISMATCH");
    } else {
      for (let i = 0; i < manifest.media.length; i++) {
        const m = manifest.media[i];
        const s = renderedCarousel.slides[i];
        if (
          !s ||
          m.index !== s.index ||
          m.role !== s.role ||
          m.width !== WIDTH ||
          m.height !== HEIGHT ||
          m.contentType !== "image/jpeg" ||
          m.byteLength !== s.buffer.length
        ) {
          errorCodes.push("MANIFEST_RENDER_MISMATCH");
          break;
        }
      }
    }
  }

  // Compute digests & comparison elements
  const manifestDigest = manVal.valid ? computeManifestDigest(manifest) : "";
  const creativeDigest = prepVal.valid
    ? computeCreativeDigest(preparedContent.creative)
    : "";
  const coverHeadline =
    prepVal.valid && preparedContent.creative?.slides?.[0]?.headline
      ? normalizeHeadline(preparedContent.creative.slides[0].headline)
      : "";
  const comparisonTokens = prepVal.valid
    ? extractComparisonTokens(preparedContent.creative)
    : [];

  // F. Duplicate / Near-Duplicate checks against recent history
  if (Array.isArray(recentHistory)) {
    for (const item of recentHistory) {
      if (!isPlainObject(item)) continue;

      if (creativeDigest && item.creativeDigest === creativeDigest) {
        errorCodes.push("DUPLICATE_EXACT");
      }

      if (coverHeadline && item.coverHeadline === coverHeadline) {
        errorCodes.push("DUPLICATE_COVER_HEADLINE");
      }

      if (
        comparisonTokens.length > 0 &&
        Array.isArray(item.comparisonTokens) &&
        item.comparisonTokens.length > 0
      ) {
        const similarity = calculateJaccardSimilarity(
          comparisonTokens,
          item.comparisonTokens
        );
        if (similarity >= JACCARD_DUPLICATE_THRESHOLD) {
          errorCodes.push("DUPLICATE_NEAR");
        }
      }
    }
  }

  const uniqueErrorCodes = Array.from(new Set(errorCodes));
  const pass = uniqueErrorCodes.length === 0;

  return {
    pass,
    status: pass ? QUALITY_STATUS.PASS : QUALITY_STATUS.FAILED,
    errorCodes: uniqueErrorCodes,
    manifestDigest,
    creativeDigest,
    finalCaptionsDigest,
    finalCaptions,
    historyRecord: {
      stateVersion: QUALITY_GATE_VERSION,
      publishDate: preparedContent?.publishDate || manifest?.publishDate || "",
      contentId: preparedContent?.contentId || manifest?.contentId || "",
      creativeDigest,
      manifestDigest,
      coverHeadline,
      comparisonTokens
    }
  };
}

/**
 * Retrieves stored Quality Gate state for a publishDate.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @returns {Promise<object|null>}
 */
async function getQualityGateState({ redis, publishDate } = {}) {
  const r = resolveRedis(redis);
  const key = buildQualityKey(publishDate);
  const raw = await r.get(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Corrupt stored quality state JSON for date '${publishDate}': ${err.message}`
    );
  }

  if (
    !isPlainObject(parsed) ||
    parsed.stateVersion !== QUALITY_GATE_VERSION ||
    parsed.publishDate !== publishDate ||
    parsed.contentId !== `social-${publishDate}` ||
    !Object.values(QUALITY_STATUS).includes(parsed.status) ||
    typeof parsed.manifestDigest !== "string" ||
    typeof parsed.creativeDigest !== "string" ||
    typeof parsed.finalCaptionsDigest !== "string" ||
    !Array.isArray(parsed.errorCodes)
  ) {
    throw new Error(`Invalid stored quality state for date '${publishDate}'`);
  }

  return parsed;
}

/**
 * Retrieves stored content history record for a publishDate.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @returns {Promise<object|null>}
 */
async function getHistoryRecord({ redis, publishDate } = {}) {
  const r = resolveRedis(redis);
  const key = buildHistoryKey(publishDate);
  const raw = await r.get(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Corrupt stored history record JSON for date '${publishDate}': ${err.message}`
    );
  }

  if (
    !isPlainObject(parsed) ||
    parsed.stateVersion !== QUALITY_GATE_VERSION ||
    parsed.publishDate !== publishDate ||
    parsed.contentId !== `social-${publishDate}` ||
    typeof parsed.creativeDigest !== "string" ||
    typeof parsed.manifestDigest !== "string" ||
    typeof parsed.coverHeadline !== "string" ||
    !Array.isArray(parsed.comparisonTokens)
  ) {
    throw new Error(`Invalid stored history record for date '${publishDate}'`);
  }

  return parsed;
}

/**
 * Loads recent content history for the previous N calendar days (excluding current date).
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {number} [params.days=30]
 * @returns {Promise<Array<object>>}
 */
async function loadRecentHistory({ redis, publishDate, days = 30 } = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error(`Invalid days parameter: must be integer between 1 and 90, received '${days}'`);
  }

  const r = resolveRedis(redis);
  const parts = publishDate.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const baseTime = Date.UTC(year, month - 1, day);

  const history = [];
  for (let i = 1; i <= days; i++) {
    const prevDateObj = new Date(baseTime - i * 86400000);
    const yStr = String(prevDateObj.getUTCFullYear());
    const mStr = String(prevDateObj.getUTCMonth() + 1).padStart(2, "0");
    const dStr = String(prevDateObj.getUTCDate()).padStart(2, "0");
    const prevDateStr = `${yStr}-${mStr}-${dStr}`;

    const rec = await getHistoryRecord({ redis: r, publishDate: prevDateStr });
    if (rec) {
      history.push(rec);
    }
  }

  return history;
}

/**
 * Persists Quality Gate evaluation result and content history record if PASS.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {object} params.evaluation
 * @returns {Promise<{ status: "PASS" | "FAILED" | "EXISTS_IDENTICAL" }>}
 */
async function saveQualityGateResult({ redis, evaluation } = {}) {
  if (!isPlainObject(evaluation) || !evaluation.historyRecord) {
    throw new Error("Invalid evaluation passed to saveQualityGateResult");
  }

  const r = resolveRedis(redis);
  const publishDate = evaluation.historyRecord.publishDate;
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate in evaluation: '${publishDate}'`);
  }

  const qualityKey = buildQualityKey(publishDate);

  if (evaluation.status === QUALITY_STATUS.PASS) {
    const existing = await getQualityGateState({ redis: r, publishDate });

    if (existing) {
      if (existing.status === QUALITY_STATUS.PASS) {
        if (
          existing.contentId === evaluation.historyRecord.contentId &&
          existing.manifestDigest === evaluation.manifestDigest &&
          existing.creativeDigest === evaluation.creativeDigest &&
          existing.finalCaptionsDigest === evaluation.finalCaptionsDigest
        ) {
          return { status: "EXISTS_IDENTICAL" };
        }
        throw new Error(
          `Quality Gate conflict for date '${publishDate}': a different terminal PASS record already exists`
        );
      }
    }

    const qualityRecord = {
      stateVersion: QUALITY_GATE_VERSION,
      publishDate,
      contentId: evaluation.historyRecord.contentId,
      status: QUALITY_STATUS.PASS,
      manifestDigest: evaluation.manifestDigest,
      creativeDigest: evaluation.creativeDigest,
      finalCaptionsDigest: evaluation.finalCaptionsDigest,
      errorCodes: []
    };

    await r.set(qualityKey, JSON.stringify(qualityRecord));

    // Save history record with NX semantics
    const historyKey = buildHistoryKey(publishDate);
    const setRes = await r.set(
      historyKey,
      JSON.stringify(evaluation.historyRecord),
      "NX"
    );

    if (setRes !== "OK" && setRes !== 1) {
      const existingHist = await getHistoryRecord({ redis: r, publishDate });
      if (
        existingHist &&
        canonicalJsonStringify(existingHist) ===
          canonicalJsonStringify(evaluation.historyRecord)
      ) {
        return { status: "EXISTS_IDENTICAL" };
      }
      throw new Error(`Content history conflict for date '${publishDate}'`);
    }

    return { status: "PASS" };
  } else {
    // Evaluation FAILED
    const existing = await getQualityGateState({ redis: r, publishDate });
    if (existing && existing.status === QUALITY_STATUS.PASS) {
      throw new Error(
        `Cannot overwrite terminal PASS Quality Gate state with FAILED for date '${publishDate}'`
      );
    }

    const qualityRecord = {
      stateVersion: QUALITY_GATE_VERSION,
      publishDate,
      contentId: evaluation.historyRecord.contentId,
      status: QUALITY_STATUS.FAILED,
      manifestDigest: evaluation.manifestDigest,
      creativeDigest: evaluation.creativeDigest,
      finalCaptionsDigest: evaluation.finalCaptionsDigest,
      errorCodes: evaluation.errorCodes
    };

    await r.set(qualityKey, JSON.stringify(qualityRecord));
    return { status: "FAILED" };
  }
}

/**
 * Runs the end-to-end Quality Gate evaluation and saves the result to Redis.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {object} params.preparedContent
 * @param {object} params.renderedCarousel
 * @param {object} params.manifest
 * @param {number} [params.historyDays=30]
 * @returns {Promise<object>}
 */
async function runQualityGate({
  redis,
  preparedContent,
  renderedCarousel,
  manifest,
  historyDays = 30
} = {}) {
  const r = resolveRedis(redis);
  const publishDate = preparedContent?.publishDate || manifest?.publishDate;
  const recentHistory = await loadRecentHistory({
    redis: r,
    publishDate,
    days: historyDays
  });

  const evaluation = await evaluateQualityGate({
    preparedContent,
    renderedCarousel,
    manifest,
    recentHistory
  });

  await saveQualityGateResult({ redis: r, evaluation });
  return evaluation;
}

/**
 * Asserts that Quality Gate state exists, is PASS, and is cryptographically bound to the manifest.
 * @param {object} params
 * @param {object} params.qualityState
 * @param {object} params.manifest
 * @returns {boolean}
 */
function assertQualityGatePass({ qualityState, manifest } = {}) {
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    throw new Error(
      `Cannot assert Quality Gate: manifest is invalid: ${manifestValidation.errors.join("; ")}`
    );
  }

  if (!isPlainObject(qualityState)) {
    throw new Error("Quality Gate state is missing or invalid");
  }

  if (qualityState.status !== QUALITY_STATUS.PASS) {
    throw new Error(
      `Quality Gate check failed: status is '${qualityState.status}', expected 'PASS'`
    );
  }

  if (qualityState.publishDate !== manifest.publishDate) {
    throw new Error(
      `Quality Gate publishDate '${qualityState.publishDate}' does not match manifest '${manifest.publishDate}'`
    );
  }

  if (qualityState.contentId !== manifest.contentId) {
    throw new Error(
      `Quality Gate contentId '${qualityState.contentId}' does not match manifest '${manifest.contentId}'`
    );
  }

  const expectedManifestDigest = computeManifestDigest(manifest);
  if (qualityState.manifestDigest !== expectedManifestDigest) {
    throw new Error(
      `Quality Gate manifestDigest mismatch: state bound to '${qualityState.manifestDigest}', manifest digest is '${expectedManifestDigest}'`
    );
  }

  return true;
}

module.exports = {
  QUALITY_GATE_VERSION,
  QUALITY_STATUS,
  JACCARD_DUPLICATE_THRESHOLD,
  canonicalJsonStringify,
  computeDigest,
  computeManifestDigest,
  computeCreativeDigest,
  normalizeHeadline,
  extractComparisonTokens,
  calculateJaccardSimilarity,
  buildQualityKey,
  buildHistoryKey,
  evaluateQualityGate,
  getQualityGateState,
  getHistoryRecord,
  loadRecentHistory,
  saveQualityGateResult,
  runQualityGate,
  assertQualityGatePass
};
