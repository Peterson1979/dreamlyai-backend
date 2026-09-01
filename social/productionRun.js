/**
 * DreamlyAI Social Pipeline Production Entrypoint
 *
 * Provides the production entrypoint for executing the daily social pipeline.
 * Resolves production dependencies (Redis, AI provider, R2 storage, Facebook config,
 * Instagram config) and delegates execution to runDailySocialPipeline.
 *
 * Enforces strict publishDate validation, fail-closed configuration verification,
 * and sanitized result emission without introducing cron, endpoints, or duplicate logic.
 */

const crypto = require("node:crypto");
const { isValidDateString } = require("./topics");
const { runDailySocialPipeline } = require("./dailyRun");
const { generateSocialAiText, sanitizeErrorMessage } = require("./aiProvider");
const { getRedisClient } = require("../utils/redisClient");
const { loadR2Config } = require("./storageConfig");
const { createR2Client } = require("./storage");
const { loadFacebookConfig } = require("./facebookConfig");
const { loadInstagramConfig } = require("./instagramConfig");

/**
 * Executes the complete daily social pipeline with production dependency wiring.
 *
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD (required)
 * @param {string} [params.leaseId] Optional explicit lease identifier
 * @param {object} [params.redis] Optional injected Redis client
 * @param {Function} [params.generateText] Optional injected text generator
 * @param {object} [params.r2Client] Optional injected R2 client
 * @param {object} [params.r2Config] Optional injected R2 config
 * @param {Function} [params.fetchImpl] Optional injected fetch implementation
 * @param {object} [params.facebookConfig] Optional injected Facebook config
 * @param {object} [params.instagramConfig] Optional injected Instagram config
 * @param {Function} [params.sleepImpl] Optional injected sleep implementation
 * @param {number} [params.instagramMaxPollAttempts] Optional max Instagram poll attempts
 * @param {number} [params.instagramPollIntervalMs] Optional Instagram poll interval ms
 * @param {Array<string>} [params.recentTopicHints] Optional topic hints
 * @returns {Promise<object>} Sanitized execution result
 */
async function runProductionSocialPipeline(params = {}) {
  const {
    publishDate,
    leaseId,
    redis,
    generateText,
    r2Client,
    r2Config,
    fetchImpl,
    facebookConfig,
    instagramConfig,
    sleepImpl,
    instagramMaxPollAttempts,
    instagramPollIntervalMs,
    recentTopicHints = []
  } = params;

  // 1. Strict publishDate validation
  if (!isValidDateString(publishDate)) {
    return {
      success: false,
      status: "FAILED",
      publishDate: typeof publishDate === "string" ? publishDate : null,
      contentId: typeof publishDate === "string" && publishDate.trim().length > 0 ? `social-${publishDate}` : null,
      error: `Invalid publishDate: expected strict YYYY-MM-DD format, received '${publishDate}'`,
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: "INVALID_DATE"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "INVALID_DATE" },
        instagram: { success: false, status: "SKIPPED", reason: "INVALID_DATE" }
      }
    };
  }

  const contentId = `social-${publishDate}`;

  // 2. Resolve production Redis client
  let resolvedRedis;
  try {
    resolvedRedis = redis || getRedisClient();
    if (!resolvedRedis || typeof resolvedRedis !== "object") {
      throw new Error("Redis client is not configured or unavailable");
    }
  } catch (redisErr) {
    return {
      success: false,
      status: "FAILED",
      publishDate,
      contentId,
      error: `Redis initialization failed: ${sanitizeErrorMessage(redisErr.message)}`,
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: "REDIS_UNAVAILABLE"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "REDIS_UNAVAILABLE" },
        instagram: { success: false, status: "SKIPPED", reason: "REDIS_UNAVAILABLE" }
      }
    };
  }

  // 3. Resolve production AI text generator
  const resolvedGenerateText =
    typeof generateText === "function" ? generateText : generateSocialAiText;

  // 4. Resolve production R2 storage config and client
  let resolvedR2Config;
  let resolvedR2Client;
  try {
    resolvedR2Config = r2Config || loadR2Config();
    resolvedR2Client = r2Client || createR2Client(resolvedR2Config);
  } catch (r2Err) {
    return {
      success: false,
      status: "FAILED",
      publishDate,
      contentId,
      error: `R2 storage configuration failed: ${sanitizeErrorMessage(r2Err.message)}`,
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: "R2_CONFIG_ERROR"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "PREPARATION_FAILED" },
        instagram: { success: false, status: "SKIPPED", reason: "PREPARATION_FAILED" }
      }
    };
  }

  // 5. Resolve Facebook configuration
  let resolvedFacebookConfig;
  try {
    resolvedFacebookConfig = facebookConfig || loadFacebookConfig();
  } catch (fbCfgErr) {
    return {
      success: false,
      status: "FAILED",
      publishDate,
      contentId,
      error: `Facebook configuration failed: ${sanitizeErrorMessage(fbCfgErr.message)}`,
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: "FACEBOOK_CONFIG_ERROR"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "CONFIGURATION_ERROR" },
        instagram: { success: false, status: "SKIPPED", reason: "CONFIGURATION_ERROR" }
      }
    };
  }

  // 6. Resolve Instagram configuration
  let resolvedInstagramConfig;
  try {
    resolvedInstagramConfig = instagramConfig || loadInstagramConfig();
  } catch (igCfgErr) {
    return {
      success: false,
      status: "FAILED",
      publishDate,
      contentId,
      error: `Instagram configuration failed: ${sanitizeErrorMessage(igCfgErr.message)}`,
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: "INSTAGRAM_CONFIG_ERROR"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "CONFIGURATION_ERROR" },
        instagram: { success: false, status: "SKIPPED", reason: "CONFIGURATION_ERROR" }
      }
    };
  }

  // 7. Resolve fetch implementation
  const resolvedFetch = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;

  // 8. Generate fresh invocation leaseId if not provided
  const resolvedLeaseId =
    typeof leaseId === "string" && leaseId.trim().length > 0
      ? leaseId.trim()
      : `prod-run-${publishDate}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  // 9. Delegate to Daily Social Pipeline Runner
  return await runDailySocialPipeline({
    publishDate,
    leaseId: resolvedLeaseId,
    redis: resolvedRedis,
    generateText: resolvedGenerateText,
    r2Client: resolvedR2Client,
    r2Config: resolvedR2Config,
    fetchImpl: resolvedFetch,
    facebookConfig: resolvedFacebookConfig,
    instagramConfig: resolvedInstagramConfig,
    sleepImpl,
    instagramMaxPollAttempts,
    instagramPollIntervalMs,
    recentTopicHints
  });
}

module.exports = {
  runProductionSocialPipeline,
  runProductionPipeline: runProductionSocialPipeline
};
