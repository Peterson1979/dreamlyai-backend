/**
 * Social Content Publishing Orchestrator for DreamlyAI
 *
 * Coordinates single-platform publishing (Facebook or Instagram) by verifying
 * durable preparation state (PREPARED), valid publication manifest, and exact
 * cryptographic Quality Gate PASS before claiming an atomic platform lease and
 * executing target provider adapter.
 */

const { isValidDateString } = require("./topics");
const { validateManifest } = require("./manifest");
const {
  PREPARATION_STATUS,
  getPreparationState,
  getManifest,
  claimPublication,
  markPublicationPublished,
  markPublicationFailed,
  markPublicationReconciliationRequired
} = require("./state");
const {
  getQualityGateState,
  assertQualityGatePass
} = require("./qualityGate");
const {
  ERROR_CLASSIFICATION: FB_ERROR_CLASSIFICATION,
  publishFacebookCarousel
} = require("./facebook");
const {
  ERROR_CLASSIFICATION: IG_ERROR_CLASSIFICATION,
  publishInstagramCarousel
} = require("./instagram");

const SUPPORTED_PUBLISH_DESTINATIONS = Object.freeze([
  "facebook_primary",
  "facebook_secondary",
  "instagram_primary",
  "instagram_secondary",
  "facebook",
  "instagram"
]);

const SUPPORTED_PUBLISH_PLATFORMS = SUPPORTED_PUBLISH_DESTINATIONS;

const PUBLISHING_ERROR_CODES = Object.freeze({
  INVALID_PUBLISH_INPUT: "INVALID_PUBLISH_INPUT",
  PREPARATION_NOT_PREPARED: "PREPARATION_NOT_PREPARED",
  MANIFEST_INVALID_OR_MISSING: "MANIFEST_INVALID_OR_MISSING",
  QUALITY_GATE_NOT_AUTHORIZED: "QUALITY_GATE_NOT_AUTHORIZED",
  PROVIDER_DEFINITIVE_FAILURE: "PROVIDER_DEFINITIVE_FAILURE",
  PROVIDER_AMBIGUOUS: "PROVIDER_AMBIGUOUS",
  PUBLICATION_STATE_FAILURE: "PUBLICATION_STATE_FAILURE"
});

/**
 * Resolves provider family ('facebook' | 'instagram') and canonical destination identifier.
 * @param {string} target
 * @returns {{ family: "facebook" | "instagram", destination: string } | null}
 */
function resolveDestinationInfo(target) {
  if (typeof target !== "string") return null;
  if (target === "facebook" || target === "facebook_primary") {
    return { family: "facebook", destination: target };
  }
  if (target === "facebook_secondary") {
    return { family: "facebook", destination: "facebook_secondary" };
  }
  if (target === "instagram" || target === "instagram_primary") {
    return { family: "instagram", destination: target };
  }
  if (target === "instagram_secondary") {
    return { family: "instagram", destination: "instagram_secondary" };
  }
  return null;
}

/**
 * Custom error class for social publishing orchestration failures.
 */
class SocialPublishingError extends Error {
  constructor(message, { code, originalCode, cause } = {}) {
    super(message);
    this.name = "SocialPublishingError";
    this.code =
      code || PUBLISHING_ERROR_CODES.PUBLICATION_STATE_FAILURE;

    if (originalCode) {
      this.originalCode = originalCode;
    }

    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Validates orchestration inputs for publishing.
 */
function validatePublishInputs({
  publishDate,
  platform,
  destination,
  leaseId,
  redis,
  fetchImpl,
  facebookConfig,
  instagramConfig
}) {
  if (!isValidDateString(publishDate)) {
    throw new SocialPublishingError(
      `Invalid publishDate: expected strict YYYY-MM-DD format, received '${publishDate}'`,
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }

  const target = destination || platform;
  const destInfo = resolveDestinationInfo(target);

  if (!destInfo || !SUPPORTED_PUBLISH_DESTINATIONS.includes(target)) {
    throw new SocialPublishingError(
      `Invalid platform/destination: '${target}'. Must be one of: ${SUPPORTED_PUBLISH_DESTINATIONS.join(", ")}`,
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }

  if (
    typeof leaseId !== "string" ||
    leaseId.trim().length === 0
  ) {
    throw new SocialPublishingError(
      "Invalid leaseId: must be a non-empty string",
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }

  if (!redis || typeof redis !== "object") {
    throw new SocialPublishingError(
      "Invalid redis: must be an injected Redis client object",
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }

  if (typeof fetchImpl !== "function") {
    throw new SocialPublishingError(
      "Invalid fetchImpl: must be a fetch function",
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }

  if (
    destInfo.family === "facebook" &&
    (!facebookConfig || typeof facebookConfig !== "object")
  ) {
    throw new SocialPublishingError(
      "Invalid facebookConfig: must be an injected config object for Facebook publishing",
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }

  if (
    destInfo.family === "instagram" &&
    (!instagramConfig || typeof instagramConfig !== "object")
  ) {
    throw new SocialPublishingError(
      "Invalid instagramConfig: must be an injected config object for Instagram publishing",
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  }
}

/**
 * Publishes daily social carousel content for a single destination/platform.
 *
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string} [params.platform] "facebook" | "instagram" | destination identifier
 * @param {string} [params.destination] "facebook_primary" | "facebook_secondary" | "instagram_primary" | "instagram_secondary"
 * @param {string} params.leaseId Caller-provided lease identifier
 * @param {object} params.redis Injected Redis client
 * @param {Function} params.fetchImpl Injected fetch implementation
 * @param {object} [params.facebookConfig] Facebook configuration
 * @param {object} [params.instagramConfig] Instagram configuration
 * @param {Function} [params.sleepImpl] Optional sleep implementation for Instagram polling
 * @param {number} [params.instagramMaxPollAttempts] Optional max poll attempts for Instagram
 * @param {number} [params.instagramPollIntervalMs] Optional poll interval for Instagram
 * @returns {Promise<object>} Sanitized publication result
 */
async function publishSocialPlatform({
  publishDate,
  platform,
  destination,
  leaseId,
  redis,
  fetchImpl,
  facebookConfig,
  instagramConfig,
  sleepImpl,
  instagramMaxPollAttempts,
  instagramPollIntervalMs
} = {}) {
  validatePublishInputs({
    publishDate,
    platform,
    destination,
    leaseId,
    redis,
    fetchImpl,
    facebookConfig,
    instagramConfig
  });

  const targetKey = destination || platform;
  const destInfo = resolveDestinationInfo(targetKey);
  const family = destInfo.family;
  const contentId = `social-${publishDate}`;

  let prepState = null;

  try {
    prepState = await getPreparationState({
      redis,
      publishDate
    });
  } catch (_) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "PREPARATION_NOT_PREPARED"
    };
  }

  if (
    !prepState ||
    prepState.status !== PREPARATION_STATUS.PREPARED ||
    prepState.contentId !== contentId
  ) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "PREPARATION_NOT_PREPARED"
    };
  }

  let manifest = null;

  try {
    manifest = await getManifest({
      redis,
      publishDate
    });
  } catch (_) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "MANIFEST_INVALID_OR_MISSING"
    };
  }

  if (
    !manifest ||
    manifest.publishDate !== publishDate ||
    manifest.contentId !== contentId
  ) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "MANIFEST_INVALID_OR_MISSING"
    };
  }

  const manifestValidation = validateManifest(manifest);

  if (!manifestValidation.valid) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "MANIFEST_INVALID_OR_MISSING"
    };
  }

  let qualityState = null;

  try {
    qualityState = await getQualityGateState({
      redis,
      publishDate
    });
  } catch (_) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "QUALITY_GATE_NOT_AUTHORIZED"
    };
  }

  try {
    assertQualityGatePass({
      qualityState,
      manifest
    });
  } catch (_) {
    return {
      success: false,
      status: "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId,
      errorCode: "QUALITY_GATE_NOT_AUTHORIZED"
    };
  }

  let claimResult;

  try {
    claimResult = await claimPublication({
      redis,
      publishDate,
      contentId,
      platform: targetKey,
      leaseId
    });
  } catch (err) {
    throw new SocialPublishingError(
      `Failed to claim publication lease for date '${publishDate}', destination '${targetKey}': ${err.message}`,
      {
        code: PUBLISHING_ERROR_CODES.PUBLICATION_STATE_FAILURE,
        cause: err
      }
    );
  }

  if (!claimResult.acquired) {
    if (claimResult.reason === "ALREADY_PUBLISHED") {
      return {
        success: true,
        status: "ALREADY_PUBLISHED",
        platform: family,
        destination: targetKey,
        publishDate,
        contentId
      };
    }

    if (claimResult.reason === "RECONCILIATION_REQUIRED") {
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        platform: family,
        destination: targetKey,
        publishDate,
        contentId
      };
    }

    if (claimResult.reason === "LEASE_HELD") {
      return {
        success: false,
        status: "LEASE_HELD",
        platform: family,
        destination: targetKey,
        publishDate,
        contentId
      };
    }

    return {
      success: false,
      status: claimResult.reason || "BLOCKED",
      platform: family,
      destination: targetKey,
      publishDate,
      contentId
    };
  }

  let leaseAcquired = true;

  try {
    if (family === "facebook") {
      let fbResult;

      try {
        fbResult = await publishFacebookCarousel({
          manifest,
          fetchImpl,
          config: facebookConfig
        });
      } catch (providerErr) {
        if (
          providerErr.classification ===
          FB_ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH
        ) {
          await markPublicationReconciliationRequired({
            redis,
            publishDate,
            contentId,
            platform: targetKey,
            leaseId
          });

          leaseAcquired = false;

          return {
            success: false,
            status: "RECONCILIATION_REQUIRED",
            platform: "facebook",
            destination: targetKey,
            publishDate,
            contentId
          };
        }

        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform: targetKey,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform: "facebook",
          destination: targetKey,
          publishDate,
          contentId,
          errorCode: "PROVIDER_DEFINITIVE_FAILURE"
        };
      }

      if (
        !fbResult ||
        fbResult.success !== true ||
        fbResult.status !== "PUBLISHED" ||
        fbResult.platform !== "facebook" ||
        typeof fbResult.postId !== "string" ||
        fbResult.postId.trim().length === 0
      ) {
        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform: targetKey,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform: "facebook",
          destination: targetKey,
          publishDate,
          contentId,
          errorCode: "PROVIDER_DEFINITIVE_FAILURE"
        };
      }

      await markPublicationPublished({
        redis,
        publishDate,
        contentId,
        platform: targetKey,
        leaseId
      });

      leaseAcquired = false;

      return {
        success: true,
        status: "PUBLISHED",
        platform: "facebook",
        destination: targetKey,
        publishDate,
        contentId,
        providerId: fbResult.postId
      };
    }

    if (family === "instagram") {
      let igResult;

      try {
        igResult = await publishInstagramCarousel({
          manifest,
          fetchImpl,
          config: instagramConfig,
          sleepImpl,
          maxPollAttempts: instagramMaxPollAttempts,
          pollIntervalMs: instagramPollIntervalMs
        });
      } catch (providerErr) {
        if (
          providerErr.classification ===
          IG_ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH
        ) {
          await markPublicationReconciliationRequired({
            redis,
            publishDate,
            contentId,
            platform: targetKey,
            leaseId
          });

          leaseAcquired = false;

          return {
            success: false,
            status: "RECONCILIATION_REQUIRED",
            platform: "instagram",
            destination: targetKey,
            publishDate,
            contentId
          };
        }

        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform: targetKey,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform: "instagram",
          destination: targetKey,
          publishDate,
          contentId,
          errorCode: "PROVIDER_DEFINITIVE_FAILURE"
        };
      }

      if (
        !igResult ||
        igResult.success !== true ||
        igResult.status !== "PUBLISHED" ||
        igResult.platform !== "instagram" ||
        typeof igResult.mediaId !== "string" ||
        igResult.mediaId.trim().length === 0
      ) {
        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform: targetKey,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform: "instagram",
          destination: targetKey,
          publishDate,
          contentId,
          errorCode: "PROVIDER_DEFINITIVE_FAILURE"
        };
      }

      await markPublicationPublished({
        redis,
        publishDate,
        contentId,
        platform: targetKey,
        leaseId
      });

      leaseAcquired = false;

      return {
        success: true,
        status: "PUBLISHED",
        platform: "instagram",
        destination: targetKey,
        publishDate,
        contentId,
        providerId: igResult.mediaId
      };
    }

    throw new SocialPublishingError(
      `Unsupported platform/destination '${targetKey}'`,
      {
        code: PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT
      }
    );
  } catch (err) {
    if (leaseAcquired) {
      try {
        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform: targetKey,
          leaseId
        });
      } catch (_) {
        // Do not let secondary failure mask original error
      }
    }

    if (err instanceof SocialPublishingError) {
      throw err;
    }

    throw new SocialPublishingError(
      `Publication orchestration failed for destination '${targetKey}': ${err.message}`,
      {
        code: PUBLISHING_ERROR_CODES.PUBLICATION_STATE_FAILURE,
        cause: err
      }
    );
  }
}

module.exports = {
  SUPPORTED_PUBLISH_PLATFORMS,
  SUPPORTED_PUBLISH_DESTINATIONS,
  PUBLISHING_ERROR_CODES,
  SocialPublishingError,
  publishSocialPlatform
};