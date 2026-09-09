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
const {
  loadFacebookConfig,
  loadFacebookSecondaryConfig
} = require("./facebookConfig");
const {
  loadInstagramConfig,
  loadInstagramSecondaryConfig
} = require("./instagramConfig");

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
 * Builds publishing response object with explicit destination fields and backward-compatible aliases.
 * @param {object} destinations
 * @returns {object}
 */
function buildPublishingOutput(destinations) {
  const output = {
    facebook_primary: destinations.facebook_primary,
    facebook_secondary: destinations.facebook_secondary,
    instagram_primary: destinations.instagram_primary,
    instagram_secondary: destinations.instagram_secondary
  };

  Object.defineProperty(output, "facebook", {
    get() {
      return this.facebook_primary;
    },
    enumerable: true
  });

  Object.defineProperty(output, "instagram", {
    get() {
      return this.instagram_primary;
    },
    enumerable: true
  });

  return output;
}

/**
 * Builds skipped publishing object for early-exit failure conditions.
 * @param {string} reason
 * @returns {object}
 */
function buildSkippedPublishing(reason) {
  return buildPublishingOutput({
    facebook_primary: { success: false, status: "SKIPPED", reason },
    facebook_secondary: { success: false, status: "SKIPPED", reason },
    instagram_primary: { success: false, status: "SKIPPED", reason },
    instagram_secondary: { success: false, status: "SKIPPED", reason }
  });
}

/**
 * Runs the daily social pipeline end-to-end for a given publishDate across all configured destinations.
 *
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string} [params.leaseId] Optional lease identifier
 * @param {object} [params.redis] Injected Redis client
 * @param {Function} [params.generateText] Injected text generator function
 * @param {object} [params.r2Client] Injected R2 / S3 client
 * @param {object} [params.r2Config] Injected R2 config
 * @param {Function} [params.fetchImpl] Injected fetch implementation
 * @param {object} [params.facebookConfig] Injected primary Facebook config
 * @param {object} [params.facebookSecondaryConfig] Injected secondary Facebook config (or null if unconfigured)
 * @param {object} [params.instagramConfig] Injected primary Instagram config
 * @param {object} [params.instagramSecondaryConfig] Injected secondary Instagram config (or null if unconfigured)
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
    facebookSecondaryConfig,
    instagramConfig,
    instagramSecondaryConfig,
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
      publishing: buildSkippedPublishing("INVALID_DATE")
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
      publishing: buildSkippedPublishing("REDIS_UNAVAILABLE")
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
      publishing: buildSkippedPublishing("PREPARATION_FAILED")
    };
  }

  // 4. Phase A: Preparation (Single Generation, Quality Gate, Render, Storage)
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
      publishing: buildSkippedPublishing("PREPARATION_FAILED")
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
      publishing: buildSkippedPublishing(prepResult?.status || "PREPARATION_FAILED")
    };
  }

  // 5. Phase B: Publishing — Independent publishing across all 4 destinations
  const resolvedFetch = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;

  // Resolve Facebook Configurations
  let resolvedFbPrimaryConfig = facebookConfig;
  if (!resolvedFbPrimaryConfig) {
    try {
      resolvedFbPrimaryConfig = loadFacebookConfig();
    } catch (_) {
      resolvedFbPrimaryConfig = null;
    }
  }

  let resolvedFbSecondaryConfig =
    facebookSecondaryConfig !== undefined
      ? facebookSecondaryConfig
      : (() => {
          try {
            return loadFacebookSecondaryConfig();
          } catch (_) {
            return null;
          }
        })();

  // Resolve Instagram Configurations
  let resolvedIgPrimaryConfig = instagramConfig;
  if (!resolvedIgPrimaryConfig) {
    try {
      resolvedIgPrimaryConfig = loadInstagramConfig();
    } catch (_) {
      resolvedIgPrimaryConfig = null;
    }
  }

  let resolvedIgSecondaryConfig =
    instagramSecondaryConfig !== undefined
      ? instagramSecondaryConfig
      : (() => {
          try {
            return loadInstagramSecondaryConfig();
          } catch (_) {
            return null;
          }
        })();

  // Destination 1: facebook_primary
  let facebookPrimaryResult;
  try {
    if (!resolvedFbPrimaryConfig) {
      resolvedFbPrimaryConfig = loadFacebookConfig();
    }
    facebookPrimaryResult = await publishSocialPlatform({
      publishDate,
      destination: "facebook_primary",
      leaseId: runnerLeaseId,
      redis: resolvedRedis,
      fetchImpl: resolvedFetch,
      facebookConfig: resolvedFbPrimaryConfig
    });
  } catch (fbErr) {
    facebookPrimaryResult = {
      success: false,
      status: "FAILED",
      destination: "facebook_primary",
      platform: "facebook",
      publishDate,
      contentId,
      errorCode: fbErr.code || "FACEBOOK_PUBLISH_FAILED",
      error: sanitizeErrorMessage(fbErr.message)
    };
  }

  // Destination 2: facebook_secondary
  let facebookSecondaryResult;
  if (resolvedFbSecondaryConfig === null) {
    facebookSecondaryResult = {
      success: false,
      status: "SKIPPED",
      destination: "facebook_secondary",
      platform: "facebook",
      reason: "NOT_CONFIGURED"
    };
  } else {
    try {
      facebookSecondaryResult = await publishSocialPlatform({
        publishDate,
        destination: "facebook_secondary",
        leaseId: runnerLeaseId,
        redis: resolvedRedis,
        fetchImpl: resolvedFetch,
        facebookConfig: resolvedFbSecondaryConfig
      });
    } catch (fbSecErr) {
      facebookSecondaryResult = {
        success: false,
        status: "FAILED",
        destination: "facebook_secondary",
        platform: "facebook",
        publishDate,
        contentId,
        errorCode: fbSecErr.code || "FACEBOOK_PUBLISH_FAILED",
        error: sanitizeErrorMessage(fbSecErr.message)
      };
    }
  }

  // Destination 3: instagram_primary
  let instagramPrimaryResult;
  try {
    if (!resolvedIgPrimaryConfig) {
      resolvedIgPrimaryConfig = loadInstagramConfig();
    }
    instagramPrimaryResult = await publishSocialPlatform({
      publishDate,
      destination: "instagram_primary",
      leaseId: runnerLeaseId,
      redis: resolvedRedis,
      fetchImpl: resolvedFetch,
      instagramConfig: resolvedIgPrimaryConfig,
      sleepImpl,
      instagramMaxPollAttempts,
      instagramPollIntervalMs
    });
  } catch (igErr) {
    instagramPrimaryResult = {
      success: false,
      status: "FAILED",
      destination: "instagram_primary",
      platform: "instagram",
      publishDate,
      contentId,
      errorCode: igErr.code || "INSTAGRAM_PUBLISH_FAILED",
      error: sanitizeErrorMessage(igErr.message)
    };
  }

  // Destination 4: instagram_secondary
  let instagramSecondaryResult;
  if (resolvedIgSecondaryConfig === null) {
    instagramSecondaryResult = {
      success: false,
      status: "SKIPPED",
      destination: "instagram_secondary",
      platform: "instagram",
      reason: "NOT_CONFIGURED"
    };
  } else {
    try {
      instagramSecondaryResult = await publishSocialPlatform({
        publishDate,
        destination: "instagram_secondary",
        leaseId: runnerLeaseId,
        redis: resolvedRedis,
        fetchImpl: resolvedFetch,
        instagramConfig: resolvedIgSecondaryConfig,
        sleepImpl,
        instagramMaxPollAttempts,
        instagramPollIntervalMs
      });
    } catch (igSecErr) {
      instagramSecondaryResult = {
        success: false,
        status: "FAILED",
        destination: "instagram_secondary",
        platform: "instagram",
        publishDate,
        contentId,
        errorCode: igSecErr.code || "INSTAGRAM_PUBLISH_FAILED",
        error: sanitizeErrorMessage(igSecErr.message)
      };
    }
  }

  // 6. Compute overall status across all configured destinations
  const checkDestOk = (res) =>
    res &&
    res.success === true &&
    (res.status === "PUBLISHED" || res.status === "ALREADY_PUBLISHED");

  const checkDestConfigured = (res) =>
    !(res && res.status === "SKIPPED" && res.reason === "NOT_CONFIGURED");

  const allDestResults = [
    facebookPrimaryResult,
    facebookSecondaryResult,
    instagramPrimaryResult,
    instagramSecondaryResult
  ];

  const configuredDestResults = allDestResults.filter(checkDestConfigured);
  const okCount = configuredDestResults.filter(checkDestOk).length;
  const totalConfigured = configuredDestResults.length;

  let overallStatus;
  let overallSuccess;

  if (totalConfigured > 0 && okCount === totalConfigured) {
    overallSuccess = true;
    overallStatus = DAILY_RUN_STATUS.COMPLETED;
  } else if (okCount > 0) {
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
    publishing: buildPublishingOutput({
      facebook_primary: {
        success: facebookPrimaryResult.success,
        status: facebookPrimaryResult.status,
        providerId: facebookPrimaryResult.providerId,
        errorCode: facebookPrimaryResult.errorCode
      },
      facebook_secondary: {
        success: facebookSecondaryResult.success,
        status: facebookSecondaryResult.status,
        providerId: facebookSecondaryResult.providerId,
        errorCode: facebookSecondaryResult.errorCode,
        reason: facebookSecondaryResult.reason
      },
      instagram_primary: {
        success: instagramPrimaryResult.success,
        status: instagramPrimaryResult.status,
        providerId: instagramPrimaryResult.providerId,
        errorCode: instagramPrimaryResult.errorCode
      },
      instagram_secondary: {
        success: instagramSecondaryResult.success,
        status: instagramSecondaryResult.status,
        providerId: instagramSecondaryResult.providerId,
        errorCode: instagramSecondaryResult.errorCode,
        reason: instagramSecondaryResult.reason
      }
    })
  };
}

module.exports = {
  DAILY_RUN_STATUS,
  runDailySocialPipeline,
  runDailySocialRun: runDailySocialPipeline,
  executeDailySocialRun: runDailySocialPipeline
};

