/**
 * DreamlyAI Daily Social Pipeline Runner
 *
 * Coordinates end-to-end daily social pipeline execution for a given date:
 * Phase A: Preparation (AI creative generation, SVG rendering, R2 storage, manifest construction, Quality Gate)
 * Phase B: Publishing (Independent Facebook and Instagram multi-image carousel publishing)
 *
 * Enforces immutable manifests, idempotent execution, platform isolation, and fail-closed security.
 */

const crypto = require("node:crypto");
const { isValidDateString } = require("./topics");
const {
  prepareDailySocialContent,
  PREPARATION_ERROR_CODES,
  SocialPreparationError
} = require("./preparation");
const {
  publishSocialPlatform,
  PUBLISHING_ERROR_CODES,
  SocialPublishingError
} = require("./publishing");
const { generateSocialAiText, sanitizeErrorMessage } = require("./aiProvider");
const { getRedisClient } = require("../utils/redisClient");
const { loadR2Config } = require("./storageConfig");
const { createR2Client } = require("./storage");
const { loadFacebookConfig } = require("./facebookConfig");
const { loadInstagramConfig } = require("./instagramConfig");

const DAILY_RUN_STATUS = Object.freeze({
  COMPLETED: "COMPLETED",
  PARTIAL_SUCCESS: "PARTIAL_SUCCESS",
  PUBLISHING_FAILED: "PUBLISHING_FAILED",
  PREPARATION_FAILED: "PREPARATION_FAILED",
  QUALITY_FAILED: "QUALITY_FAILED",
  LEASE_HELD: "LEASE_HELD",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED"
});

/**
 * Runs the daily social pipeline end-to-end for a given publishDate.
 *
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string} [params.leaseId] Optional lease identifier
 * @param {object} [params.redis] Injected Redis client
 * @param {Function} [params.generateText] Injected text generator function
 * @param {object} [params.r2Client] Injected R2 / S3 client
 * @param {object} [params.r2Config] Injected R2 config
 * @param {Function} [params.fetchImpl] Injected fetch implementation
 * @param {object} [params.facebookConfig] Injected Facebook config
 * @param {object} [params.instagramConfig] Injected Instagram config
 * @param {Function} [params.sleepImpl] Injected sleep function for Instagram polling
 * @param {number} [params.instagramMaxPollAttempts] Max Instagram polling attempts
 * @param {number} [params.instagramPollIntervalMs] Instagram polling interval in ms
 * @param {Array<string>} [params.recentTopicHints] Optional topic hints
 * @returns {Promise<object>} Sanitized execution result
 */
async function runDailySocialPipeline(params = {}) {
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

  // 1. Validate publishDate input
  if (!isValidDateString(publishDate)) {
    return {
      success: false,
      status: DAILY_RUN_STATUS.FAILED,
      publishDate,
      contentId: typeof publishDate === "string" ? `social-${publishDate}` : null,
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
  const runnerLeaseId =
    typeof leaseId === "string" && leaseId.trim().length > 0
      ? leaseId.trim()
      : `runner-${publishDate}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  // 2. Resolve Redis client
  let resolvedRedis;
  try {
    resolvedRedis = redis || getRedisClient();
    if (!resolvedRedis || typeof resolvedRedis !== "object") {
      throw new Error("Redis client is not configured or unavailable");
    }
  } catch (redisErr) {
    return {
      success: false,
      status: DAILY_RUN_STATUS.FAILED,
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

  // 3. Resolve Preparation Dependencies
  let resolvedGenerateText;
  let resolvedR2Config;
  let resolvedR2Client;

  try {
    resolvedGenerateText =
      typeof generateText === "function" ? generateText : generateSocialAiText;
    resolvedR2Config = r2Config || loadR2Config();
    resolvedR2Client = r2Client || createR2Client(resolvedR2Config);
  } catch (depErr) {
    return {
      success: false,
      status: DAILY_RUN_STATUS.FAILED,
      publishDate,
      contentId,
      error: `Preparation dependency resolution failed: ${sanitizeErrorMessage(depErr.message)}`,
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: "DEPENDENCY_ERROR"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "PREPARATION_FAILED" },
        instagram: { success: false, status: "SKIPPED", reason: "PREPARATION_FAILED" }
      }
    };
  }

  // 4. Phase A: Preparation
  let prepResult;
  try {
    prepResult = await prepareDailySocialContent({
      publishDate,
      leaseId: runnerLeaseId,
      redis: resolvedRedis,
      generateText: resolvedGenerateText,
      r2Client: resolvedR2Client,
      r2Config: resolvedR2Config,
      recentTopicHints
    });
  } catch (prepErr) {
    return {
      success: false,
      status: DAILY_RUN_STATUS.PREPARATION_FAILED,
      publishDate,
      contentId,
      error: sanitizeErrorMessage(prepErr.message),
      preparation: {
        success: false,
        status: "FAILED",
        errorCode: prepErr.code || "PREPARATION_FAILED"
      },
      publishing: {
        facebook: { success: false, status: "SKIPPED", reason: "PREPARATION_FAILED" },
        instagram: { success: false, status: "SKIPPED", reason: "PREPARATION_FAILED" }
      }
    };
  }

  // Check if preparation reached a valid state that permits publishing
  const isPreparationValid =
    prepResult &&
    prepResult.success === true &&
    (prepResult.status === "PREPARED" ||
      prepResult.status === "ALREADY_PREPARED" ||
      prepResult.status === "PREPARED_RECOVERED");

  if (!isPreparationValid) {
    let overallStatus = DAILY_RUN_STATUS.PREPARATION_FAILED;
    if (prepResult?.status === "QUALITY_FAILED") {
      overallStatus = DAILY_RUN_STATUS.QUALITY_FAILED;
    } else if (prepResult?.status === "LEASE_HELD") {
      overallStatus = DAILY_RUN_STATUS.LEASE_HELD;
    } else if (prepResult?.status === "RECOVERY_REQUIRED") {
      overallStatus = DAILY_RUN_STATUS.RECOVERY_REQUIRED;
    }

    return {
      success: false,
      status: overallStatus,
      publishDate,
      contentId,
      preparation: {
        success: false,
        status: prepResult?.status || "FAILED",
        errorCode: prepResult?.errorCode,
        errorCodes: prepResult?.errorCodes
      },
      publishing: {
        facebook: {
          success: false,
          status: "SKIPPED",
          reason: prepResult?.status || "PREPARATION_FAILED"
        },
        instagram: {
          success: false,
          status: "SKIPPED",
          reason: prepResult?.status || "PREPARATION_FAILED"
        }
      }
    };
  }

  // 5. Phase B: Publishing
  const resolvedFetch = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;

  // Execute Facebook publishing
  let facebookResult;
  try {
    let resolvedFbConfig = facebookConfig;
    if (!resolvedFbConfig) {
      resolvedFbConfig = loadFacebookConfig();
    }
    facebookResult = await publishSocialPlatform({
      publishDate,
      platform: "facebook",
      leaseId: runnerLeaseId,
      redis: resolvedRedis,
      fetchImpl: resolvedFetch,
      facebookConfig: resolvedFbConfig
    });
  } catch (fbErr) {
    facebookResult = {
      success: false,
      status: "FAILED",
      platform: "facebook",
      publishDate,
      contentId,
      errorCode: fbErr.code || "FACEBOOK_PUBLISH_FAILED",
      error: sanitizeErrorMessage(fbErr.message)
    };
  }

  // Execute Instagram publishing independently
  let instagramResult;
  try {
    let resolvedIgConfig = instagramConfig;
    if (!resolvedIgConfig) {
      resolvedIgConfig = loadInstagramConfig();
    }
    instagramResult = await publishSocialPlatform({
      publishDate,
      platform: "instagram",
      leaseId: runnerLeaseId,
      redis: resolvedRedis,
      fetchImpl: resolvedFetch,
      instagramConfig: resolvedIgConfig,
      sleepImpl,
      instagramMaxPollAttempts,
      instagramPollIntervalMs
    });
  } catch (igErr) {
    instagramResult = {
      success: false,
      status: "FAILED",
      platform: "instagram",
      publishDate,
      contentId,
      errorCode: igErr.code || "INSTAGRAM_PUBLISH_FAILED",
      error: sanitizeErrorMessage(igErr.message)
    };
  }

  // 6. Compute overall status
  const fbOk =
    facebookResult &&
    facebookResult.success === true &&
    (facebookResult.status === "PUBLISHED" || facebookResult.status === "ALREADY_PUBLISHED");
  const igOk =
    instagramResult &&
    instagramResult.success === true &&
    (instagramResult.status === "PUBLISHED" || instagramResult.status === "ALREADY_PUBLISHED");

  let overallStatus;
  let overallSuccess;

  if (fbOk && igOk) {
    overallSuccess = true;
    overallStatus = DAILY_RUN_STATUS.COMPLETED;
  } else if (fbOk || igOk) {
    overallSuccess = false;
    overallStatus = DAILY_RUN_STATUS.PARTIAL_SUCCESS;
  } else {
    overallSuccess = false;
    overallStatus = DAILY_RUN_STATUS.PUBLISHING_FAILED;
  }

  // 7. Return sanitized summary object
  return {
    success: overallSuccess,
    status: overallStatus,
    publishDate,
    contentId,
    preparation: {
      success: prepResult.success,
      status: prepResult.status,
      category: prepResult.category,
      slideCount: prepResult.slideCount
    },
    publishing: {
      facebook: {
        success: facebookResult.success,
        status: facebookResult.status,
        providerId: facebookResult.providerId,
        errorCode: facebookResult.errorCode
      },
      instagram: {
        success: instagramResult.success,
        status: instagramResult.status,
        providerId: instagramResult.providerId,
        errorCode: instagramResult.errorCode
      }
    }
  };
}

module.exports = {
  DAILY_RUN_STATUS,
  runDailySocialPipeline,
  runDailySocialRun: runDailySocialPipeline,
  executeDailySocialRun: runDailySocialPipeline
};
