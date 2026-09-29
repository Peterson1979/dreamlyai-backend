/**
 * Dreamly AI Daily Video Social Pipeline Runner
 *
 * Coordinates end-to-end execution of scheduled daily promotional video publishing.
 * Resolves the deterministic video manifest for the target date, ensures Redis state
 * isolation, and executes multi-target video publishing.
 */

const { isValidDateString } = require("../topics");
const { getRedisClient } = require("../../utils/redisClient");
const { getVideoManifestForDate, isPromoVideoCampaignDate } = require("./videoRegistry");
const { executeVideoPublishing } = require("./videoPublisher");
const { loadVideoTargetsConfig } = require("./videoTargets");

/**
 * Returns current UTC calendar date as strict YYYY-MM-DD.
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
function getUtcVideoPublishDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Runs the daily video social pipeline for a given publishDate.
 *
 * @param {object} params
 * @param {string} [params.publishDate] Strict YYYY-MM-DD (defaults to UTC today)
 * @param {object} [params.redis] Injected Redis client
 * @param {object} [params.targetsConfig] Injected targets config
 * @param {object} [params.adapters] Injected custom adapters
 * @param {Array<string>} [params.requestedTargets] Optional subset of target IDs
 * @param {Function} [params.fetchFn] Injected fetch function
 * @param {Function} [params.sleepFn] Injected sleep function
 * @param {string} [params.leaseId] Optional lease identifier
 * @param {boolean} [params.dryRun=false] If true, executes validation dry run
 * @param {boolean} [params.isCanary=false] If true, marks as canary execution
 * @returns {Promise<object>}
 */
async function runDailyVideoPipeline({
  publishDate,
  redis,
  targetsConfig,
  adapters,
  requestedTargets,
  fetchFn,
  sleepFn,
  leaseId,
  dryRun = false,
  isCanary = false
} = {}) {
  const effectiveDate = publishDate ? String(publishDate).trim() : getUtcVideoPublishDate();

  if (!isValidDateString(effectiveDate)) {
    return {
      success: false,
      status: "FAILED",
      publishDate: effectiveDate,
      error: `Invalid publishDate: expected strict YYYY-MM-DD format, received '${effectiveDate}'`
    };
  }

  // 1. Resolve Video Manifest for Date
  const manifest = getVideoManifestForDate(effectiveDate);
  if (!manifest) {
    return {
      success: false,
      status: "FAILED",
      publishDate: effectiveDate,
      error: `No promotional video manifest available for date: ${effectiveDate}`
    };
  }

  // 2. Resolve Redis Client
  let resolvedRedis = redis;
  if (!resolvedRedis && !dryRun) {
    try {
      resolvedRedis = getRedisClient();
    } catch (_) {
      resolvedRedis = null;
    }
  }

  // 3. Execute Multi-Target Publishing
  try {
    const result = await executeVideoPublishing({
      manifest,
      publishDate: effectiveDate,
      redis: resolvedRedis,
      targetsConfig,
      adapters,
      requestedTargets,
      fetchFn,
      sleepFn,
      leaseId,
      dryRun,
      isCanary
    });

    return {
      success: result.success,
      status: result.success ? "COMPLETED" : "PARTIAL_SUCCESS",
      publishDate: effectiveDate,
      sequenceNumber: manifest.metadata?.sequenceNumber,
      videoFileName: manifest.metadata?.videoFileName,
      manifestId: manifest.id,
      dryRun,
      pinterestEnvKeys: result.pinterestEnvKeys,
      targets: result.targets
    };
  } catch (err) {
    return {
      success: false,
      status: "FAILED",
      publishDate: effectiveDate,
      error: err.message || "Unhandled error during video pipeline execution"
    };
  }
}

module.exports = {
  runDailyVideoPipeline,
  getUtcVideoPublishDate
};
