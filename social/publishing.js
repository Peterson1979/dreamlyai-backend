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

const SUPPORTED_PUBLISH_PLATFORMS = Object.freeze([
  "facebook",
  "instagram"
]);

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

  if (
    typeof platform !== "string" ||
    !SUPPORTED_PUBLISH_PLATFORMS.includes(platform)
  ) {
    throw new SocialPublishingError(
      `Invalid platform: '${platform}'. Must be one of: ${SUPPORTED_PUBLISH_PLATFORMS.join(", ")}`,
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
    platform === "facebook" &&
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
    platform === "instagram" &&
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
 * Publishes daily social carousel content for a single platform.
 *
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string} params.platform "facebook" | "instagram"
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
    leaseId,
    redis,
    fetchImpl,
    facebookConfig,
    instagramConfig
  });

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
      platform,
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
      platform,
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
      platform,
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
      platform,
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
      platform,
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
      platform,
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
      platform,
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
      platform,
      leaseId
    });
  } catch (err) {
    throw new SocialPublishingError(
      `Failed to claim publication lease for date '${publishDate}', platform '${platform}': ${err.message}`,
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
        platform,
        publishDate,
        contentId
      };
    }

    if (claimResult.reason === "RECONCILIATION_REQUIRED") {
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        platform,
        publishDate,
        contentId
      };
    }

    if (claimResult.reason === "LEASE_HELD") {
      return {
        success: false,
        status: "LEASE_HELD",
        platform,
        publishDate,
        contentId
      };
    }

    return {
      success: false,
      status: claimResult.reason || "BLOCKED",
      platform,
      publishDate,
      contentId
    };
  }

  let leaseAcquired = true;

  try {
    if (platform === "facebook") {
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
            platform,
            leaseId
          });

          leaseAcquired = false;

          return {
            success: false,
            status: "RECONCILIATION_REQUIRED",
            platform,
            publishDate,
            contentId
          };
        }

        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform,
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
          platform,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform,
          publishDate,
          contentId,
          errorCode: "PROVIDER_DEFINITIVE_FAILURE"
        };
      }

      await markPublicationPublished({
        redis,
        publishDate,
        contentId,
        platform,
        leaseId
      });

      leaseAcquired = false;

      return {
        success: true,
        status: "PUBLISHED",
        platform: "facebook",
        publishDate,
        contentId,
        providerId: fbResult.postId
      };
    }
	    if (platform === "instagram") {
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
            platform,
            leaseId
          });

          leaseAcquired = false;

          return {
            success: false,
            status: "RECONCILIATION_REQUIRED",
            platform,
            publishDate,
            contentId
          };
        }

        await markPublicationFailed({
          redis,
          publishDate,
          contentId,
          platform,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform,
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
          platform,
          leaseId
        });

        leaseAcquired = false;

        return {
          success: false,
          status: "FAILED",
          platform,
          publishDate,
          contentId,
          errorCode: "PROVIDER_DEFINITIVE_FAILURE"
        };
      }

      await markPublicationPublished({
        redis,
        publishDate,
        contentId,
        platform,
        leaseId
      });

      leaseAcquired = false;

      return {
        success: true,
        status: "PUBLISHED",
        platform: "instagram",
        publishDate,
        contentId,
        providerId: igResult.mediaId
      };
    }

    throw new SocialPublishingError(
      `Unsupported platform '${platform}'`,
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
          platform,
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
      `Publication orchestration failed for platform '${platform}': ${err.message}`,
      {
        code: PUBLISHING_ERROR_CODES.PUBLICATION_STATE_FAILURE,
        cause: err
      }
    );
  }
}

module.exports = {
  SUPPORTED_PUBLISH_PLATFORMS,
  PUBLISHING_ERROR_CODES,
  SocialPublishingError,
  publishSocialPlatform
};