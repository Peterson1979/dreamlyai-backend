/**
 * Dreamly AI Video Social Multi-Target Publishing Coordinator
 *
 * Coordinates automated video publishing across all 6 configured targets:
 * 1. pinterest_dreamly (@dreamlyai, Board: Dreamly AI)
 * 2. youtube_dreamly (Dreamly AI YouTube channel)
 * 3. instagram_lifemode (@lifemodehq Reels)
 * 4. facebook_lifemode (LifeMode Facebook Page Video)
 * 5. youtube_lifemode (LifeMode YouTube channel)
 * 6. pinterest_lifemode (@lifemodehq, Board: Dream Meanings & Night Symbols)
 *
 * Guarantees:
 * - Deterministic idempotency & lease claiming per target
 * - Partial failure tolerance: Retrying only failed targets, never republishing completed targets
 * - Fail-closed error handling
 * - Isolated state from carousel publishing
 */

const crypto = require("node:crypto");
const { VIDEO_TARGETS, ALL_TARGET_IDS, canonicalizeTargetId, loadVideoTargetsConfig } = require("./videoTargets");
const {
  VIDEO_PUBLISH_STATUS,
  getVideoTargetState,
  claimVideoTargetLease,
  releaseVideoTargetLease,
  markVideoTargetPublished,
  markVideoTargetFailed,
  markVideoTargetReconciliationRequired
} = require("./videoState");

const { PinterestVideoAdapter } = require("./adapters/pinterestVideoAdapter");
const { YouTubeVideoAdapter } = require("./adapters/youtubeVideoAdapter");
const { InstagramReelsAdapter } = require("./adapters/instagramReelsAdapter");
const { FacebookVideoAdapter } = require("./adapters/facebookVideoAdapter");

/**
 * Creates default adapter instances for all 6 targets.
 * @returns {object} Map of canonical target ID to adapter instance
 */
function createDefaultVideoAdapters() {
  return {
    [VIDEO_TARGETS.PINTEREST_DREAMLY]: new PinterestVideoAdapter(VIDEO_TARGETS.PINTEREST_DREAMLY),
    [VIDEO_TARGETS.YOUTUBE_DREAMLY]: new YouTubeVideoAdapter(VIDEO_TARGETS.YOUTUBE_DREAMLY),
    [VIDEO_TARGETS.INSTAGRAM_LIFEMODE]: new InstagramReelsAdapter(VIDEO_TARGETS.INSTAGRAM_LIFEMODE),
    [VIDEO_TARGETS.FACEBOOK_LIFEMODE]: new FacebookVideoAdapter(VIDEO_TARGETS.FACEBOOK_LIFEMODE),
    [VIDEO_TARGETS.YOUTUBE_LIFEMODE]: new YouTubeVideoAdapter(VIDEO_TARGETS.YOUTUBE_LIFEMODE),
    [VIDEO_TARGETS.PINTEREST_LIFEMODE]: new PinterestVideoAdapter(VIDEO_TARGETS.PINTEREST_LIFEMODE)
  };
}

/**
 * Coordinates video publishing across all requested/enabled targets.
 *
 * @param {object} params
 * @param {object} params.manifest Full video manifest object
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {object} [params.redis] Injected Redis client
 * @param {object} [params.targetsConfig] Injected targets configuration
 * @param {object} [params.adapters] Injected custom adapters
 * @param {Array<string>} [params.requestedTargets] Optional subset of target IDs to publish
 * @param {Function} [params.fetchFn=fetch] Injected fetch implementation
 * @param {Function} [params.sleepFn] Injected sleep implementation
 * @param {string} [params.leaseId] Optional lease identifier
 * @param {boolean} [params.dryRun=false] If true, executes validation only without making external writes
 * @param {boolean} [params.isCanary=false] If true, marks as canary execution
 * @returns {Promise<object>}
 */
async function executeVideoPublishing({
  manifest,
  publishDate,
  redis,
  targetsConfig,
  adapters,
  requestedTargets,
  fetchFn = fetch,
  sleepFn,
  leaseId,
  dryRun = false,
  isCanary = false
} = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid manifest passed to executeVideoPublishing");
  }

  const effectiveDate = publishDate || manifest.date;
  const runnerLeaseId =
    typeof leaseId === "string" && leaseId.trim().length > 0
      ? leaseId.trim()
      : `video-runner-${effectiveDate}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const resolvedTargetsConfig = targetsConfig || loadVideoTargetsConfig();
  const resolvedAdapters = adapters || createDefaultVideoAdapters();

  // Resolve target list to execute
  const rawTargetList = Array.isArray(requestedTargets) && requestedTargets.length > 0
    ? requestedTargets
    : ALL_TARGET_IDS;

  const targetList = rawTargetList
    .map(canonicalizeTargetId)
    .filter((t) => Boolean(t) && ALL_TARGET_IDS.includes(t));

  const results = {};
  let overallSuccess = true;

  // DRY-RUN EXECUTION BRANCH (Read-only, 0 writes, returns success: true)
  if (dryRun) {
    const pinterestEnvKeys = Object.keys(process.env).filter(
      (k) => /PINTEREST|DREAMLY|PIN|BOARD/i.test(k)
    );
    for (const targetId of targetList) {
      const targetConfig = resolvedTargetsConfig[targetId];
      const adapter = resolvedAdapters[targetId];
      const validation = adapter && typeof adapter.validateConfig === "function"
        ? adapter.validateConfig(targetConfig)
        : { valid: Boolean(targetConfig) };

      results[targetId] = {
        configured: Boolean(targetConfig && validation.valid),
        enabled: Boolean(targetConfig?.enabled),
        status: !targetConfig ? "NOT_CONFIGURED" : (!targetConfig.enabled ? "DISABLED" : (validation.valid ? "DRY_RUN_READY" : "CONFIG_PENDING")),
        targetId,
        errors: validation.errors || []
      };
    }

    return {
      success: true,
      status: "DRY_RUN",
      publishDate: effectiveDate,
      manifestId: manifest.id,
      videoFileName: manifest.metadata?.videoFileName || manifest.media?.[0]?.fileName,
      sequenceNumber: manifest.metadata?.sequenceNumber,
      dryRun: true,
      isCanary,
      pinterestEnvKeys,
      targets: results
    };
  }

  // PRODUCTION / REAL PUBLISHING BRANCH
  for (const targetId of targetList) {
    const targetConfig = resolvedTargetsConfig[targetId];
    const adapter = resolvedAdapters[targetId];

    // Check if target is configured
    if (!targetConfig) {
      results[targetId] = {
        success: false,
        status: VIDEO_PUBLISH_STATUS.SKIPPED,
        targetId,
        reason: "NOT_CONFIGURED"
      };
      continue;
    }

    // Check if target is enabled
    if (!targetConfig.enabled) {
      results[targetId] = {
        success: false,
        status: VIDEO_PUBLISH_STATUS.SKIPPED,
        targetId,
        reason: "DISABLED_BY_CONFIG"
      };
      continue;
    }

    if (!adapter) {
      results[targetId] = {
        success: false,
        status: VIDEO_PUBLISH_STATUS.FAILED,
        targetId,
        error: `No adapter registered for target: ${targetId}`
      };
      overallSuccess = false;
      continue;
    }

    // 1. Check prior state in Redis
    if (redis) {
      try {
        const priorState = await getVideoTargetState(redis, effectiveDate, targetId);
        if (priorState && priorState.status === VIDEO_PUBLISH_STATUS.PUBLISHED) {
          // Idempotency: Already published successfully on this target
          results[targetId] = {
            success: true,
            status: "ALREADY_PUBLISHED",
            targetId,
            postId: priorState.postId,
            publishedAt: priorState.publishedAt
          };
          continue;
        }

        if (priorState && priorState.status === VIDEO_PUBLISH_STATUS.RECONCILIATION_REQUIRED) {
          results[targetId] = {
            success: false,
            status: VIDEO_PUBLISH_STATUS.RECONCILIATION_REQUIRED,
            targetId,
            reason: "AMBIGUOUS_STATE_RECONCILIATION_REQUIRED",
            error: priorState.error
          };
          overallSuccess = false;
          continue;
        }
      } catch (stateErr) {
        // State check failed, proceed with caution
      }
    }

    // 2. Claim atomic lease per target
    let leaseAcquired = false;
    if (redis) {
      try {
        const claimRes = await claimVideoTargetLease(redis, effectiveDate, targetId, runnerLeaseId, 120);
        if (!claimRes.acquired) {
          results[targetId] = {
            success: false,
            status: "LEASE_HELD",
            targetId,
            reason: `Target lease is held by another runner (${claimRes.holderLeaseId})`
          };
          overallSuccess = false;
          continue;
        }
        leaseAcquired = true;
      } catch (_) {
        // Continue if Redis lease fails or not available
      }
    }

    // 3. Execute adapter publish
    try {
      const pubResult = await adapter.publish({
        manifest,
        config: targetConfig,
        redis,
        fetchFn,
        sleepFn
      });

      if (pubResult && pubResult.success && pubResult.status === VIDEO_PUBLISH_STATUS.PUBLISHED) {
        // Mark PUBLISHED in Redis
        if (redis) {
          await markVideoTargetPublished(redis, effectiveDate, targetId, {
            postId: pubResult.postId,
            publishedAt: pubResult.publishedAt,
            details: { isCanary, runnerLeaseId }
          });
        }

        results[targetId] = {
          success: true,
          status: VIDEO_PUBLISH_STATUS.PUBLISHED,
          targetId,
          postId: pubResult.postId,
          publishedAt: pubResult.publishedAt
        };
      } else if (pubResult && pubResult.status === VIDEO_PUBLISH_STATUS.RECONCILIATION_REQUIRED) {
        if (redis) {
          await markVideoTargetReconciliationRequired(redis, effectiveDate, targetId, {
            error: pubResult.error,
            reconciliationData: pubResult.reconciliationData
          });
        }

        results[targetId] = {
          success: false,
          status: VIDEO_PUBLISH_STATUS.RECONCILIATION_REQUIRED,
          targetId,
          error: pubResult.error,
          reconciliationData: pubResult.reconciliationData
        };
        overallSuccess = false;
      } else if (pubResult && pubResult.status === VIDEO_PUBLISH_STATUS.SKIPPED) {
        results[targetId] = {
          success: false,
          status: VIDEO_PUBLISH_STATUS.SKIPPED,
          targetId,
          error: pubResult.error
        };
      } else {
        // Publication failed
        if (redis) {
          await markVideoTargetFailed(redis, effectiveDate, targetId, {
            error: pubResult?.error || "Publishing failed",
            errorCode: pubResult?.errorCode || "TARGET_PUBLISH_FAILED"
          });
        }

        results[targetId] = {
          success: false,
          status: VIDEO_PUBLISH_STATUS.FAILED,
          targetId,
          error: pubResult?.error || { message: "Target publication failed" }
        };
        overallSuccess = false;
      }
    } catch (targetErr) {
      if (redis) {
        await markVideoTargetFailed(redis, effectiveDate, targetId, {
          error: targetErr.message || "Unhandled target error",
          errorCode: "UNHANDLED_EXCEPTION"
        });
      }

      results[targetId] = {
        success: false,
        status: VIDEO_PUBLISH_STATUS.FAILED,
        targetId,
        error: { message: targetErr.message || "Unhandled error during target publish" }
      };
      overallSuccess = false;
    } finally {
      // 4. Safely release target lease
      if (redis && leaseAcquired) {
        try {
          await releaseVideoTargetLease(redis, effectiveDate, targetId, runnerLeaseId);
        } catch (_) {}
      }
    }
  }

  return {
    success: overallSuccess,
    publishDate: effectiveDate,
    manifestId: manifest.id,
    videoFileName: manifest.metadata?.videoFileName || manifest.media?.[0]?.fileName,
    sequenceNumber: manifest.metadata?.sequenceNumber,
    dryRun,
    isCanary,
    targets: results
  };
}

module.exports = {
  executeVideoPublishing,
  createDefaultVideoAdapters
};
