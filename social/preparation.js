/**
 * Social Content Preparation Orchestrator for DreamlyAI
 *
 * Coordinates daily carousel preparation across LLM creative generation,
 * SVG rendering, Cloudflare R2 storage, publication manifest generation,
 * cryptographic Quality Gate evaluation, and Redis state lifecycle.
 */

const { isValidDateString, getTopicCategoryForDate } = require("./topics");
const { generateSocialCreative } = require("./contentGenerator");
const { buildPreparedContent } = require("./contentSchema");
const { renderCarousel } = require("./renderer");
const { uploadRenderedCarousel } = require("./storage");
const { buildManifest, validateManifest } = require("./manifest");
const {
  claimPreparation,
  completePreparation,
  failPreparation,
  getManifest,
  saveManifest
} = require("./state");
const {
  loadRecentHistory,
  evaluateQualityGate,
  saveQualityGateResult,
  getQualityGateState,
  assertQualityGatePass,
  QUALITY_STATUS
} = require("./qualityGate");

const PREPARATION_ERROR_CODES = Object.freeze({
  INVALID_PREPARATION_INPUT: "INVALID_PREPARATION_INPUT",
  CREATIVE_GENERATION_FAILED: "CREATIVE_GENERATION_FAILED",
  RENDER_FAILED: "RENDER_FAILED",
  STORAGE_FAILED: "STORAGE_FAILED",
  MANIFEST_FAILED: "MANIFEST_FAILED",
  QUALITY_GATE_FAILED: "QUALITY_GATE_FAILED",
  FINALIZATION_FAILED: "FINALIZATION_FAILED",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED"
});

/**
 * Custom error class for social preparation orchestration failures.
 */
class SocialPreparationError extends Error {
  constructor(message, { code, originalCode, cause } = {}) {
    super(message);
    this.name = "SocialPreparationError";
    this.code = code || PREPARATION_ERROR_CODES.FINALIZATION_FAILED;
    if (originalCode) {
      this.originalCode = originalCode;
    }
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Validates orchestration inputs.
 */
function validatePreparationInputs({
  publishDate,
  leaseId,
  redis,
  generateText,
  r2Client,
  r2Config
}) {
  if (!isValidDateString(publishDate)) {
    throw new SocialPreparationError(
      `Invalid publishDate: expected strict YYYY-MM-DD format, received '${publishDate}'`,
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT }
    );
  }

  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new SocialPreparationError(
      "Invalid leaseId: must be a non-empty string",
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT }
    );
  }

  if (!redis || typeof redis !== "object") {
    throw new SocialPreparationError(
      "Invalid redis: must be an injected Redis client object",
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT }
    );
  }

  if (typeof generateText !== "function") {
    throw new SocialPreparationError(
      "Invalid generateText: must be a function",
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT }
    );
  }

  if (!r2Client || typeof r2Client !== "object") {
    throw new SocialPreparationError(
      "Invalid r2Client: must be an injected R2 storage client object",
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT }
    );
  }

  if (!r2Config || typeof r2Config !== "object") {
    throw new SocialPreparationError(
      "Invalid r2Config: must be an injected R2 config object",
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT }
    );
  }
}

/**
 * Prepares daily social carousel content end-to-end.
 *
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string} params.leaseId Caller-provided lease identifier
 * @param {object} params.redis Injected Redis client
 * @param {Function} params.generateText Injected LLM generator function
 * @param {object} params.r2Client Injected Cloudflare R2 / S3 client
 * @param {object} params.r2Config Injected R2 configuration
 * @param {Array<string>} [params.recentTopicHints=[]] Optional topic hints
 * @returns {Promise<object>} Sanitized orchestration result
 */
async function prepareDailySocialContent({
  publishDate,
  leaseId,
  redis,
  generateText,
  r2Client,
  r2Config,
  recentTopicHints = []
} = {}) {
  // 1. Validate orchestration inputs
  validatePreparationInputs({
    publishDate,
    leaseId,
    redis,
    generateText,
    r2Client,
    r2Config
  });

  const contentId = `social-${publishDate}`;

  // 2. Deterministically derive topic category from publishDate
  let category;
  try {
    category = getTopicCategoryForDate(publishDate);
  } catch (catErr) {
    throw new SocialPreparationError(
      `Failed to resolve topic category for date '${publishDate}': ${catErr.message}`,
      { code: PREPARATION_ERROR_CODES.INVALID_PREPARATION_INPUT, cause: catErr }
    );
  }

  // 3. Claim preparation lease before performing any provider work
  let claimResult;
  try {
    claimResult = await claimPreparation({
      redis,
      publishDate,
      contentId,
      leaseId
    });
  } catch (claimErr) {
    throw new SocialPreparationError(
      `Failed to claim preparation lease: ${claimErr.message}`,
      { code: PREPARATION_ERROR_CODES.FINALIZATION_FAILED, cause: claimErr }
    );
  }

  if (!claimResult.acquired) {
    if (claimResult.reason === "ALREADY_PREPARED") {
      return {
        success: true,
        status: "ALREADY_PREPARED",
        publishDate,
        contentId
      };
    }

    if (claimResult.reason === "LEASE_HELD") {
      return {
        success: false,
        status: "LEASE_HELD",
        publishDate,
        contentId
      };
    }

    return {
      success: false,
      status: claimResult.reason || "CLAIM_REJECTED",
      publishDate,
      contentId
    };
  }

  let leaseAcquired = true;

  try {
    // 4. Durable Recovery Check (inspect existing manifest + Quality Gate state)
    let existingManifest = null;
    let qualityState = null;

    try {
      existingManifest = await getManifest({ redis, publishDate });
    } catch (manErr) {
      throw new SocialPreparationError(
        `Corrupt or invalid stored manifest for date '${publishDate}': ${manErr.message}`,
        { code: PREPARATION_ERROR_CODES.RECOVERY_REQUIRED, cause: manErr }
      );
    }

    try {
      qualityState = await getQualityGateState({ redis, publishDate });
    } catch (qErr) {
      throw new SocialPreparationError(
        `Corrupt or invalid stored quality state for date '${publishDate}': ${qErr.message}`,
        { code: PREPARATION_ERROR_CODES.RECOVERY_REQUIRED, cause: qErr }
      );
    }

    // Case A: No manifest exists
    if (!existingManifest) {
      if (qualityState && qualityState.status === QUALITY_STATUS.PASS) {
        // Case D: PASS exists but manifest is missing -> Fail closed
        await failPreparation({ redis, publishDate, contentId, leaseId });
        leaseAcquired = false;
        return {
          success: false,
          status: "RECOVERY_REQUIRED",
          publishDate,
          contentId,
          errorCode: "PASS_WITHOUT_MANIFEST"
        };
      }
      // If qualityState is null or FAILED, normal preparation may proceed
    } else {
      // Manifest exists
      if (qualityState && qualityState.status === QUALITY_STATUS.PASS) {
        let isMatchingPass = false;
        try {
          if (
            existingManifest.contentId === contentId &&
            assertQualityGatePass({ qualityState, manifest: existingManifest })
          ) {
            isMatchingPass = true;
          }
        } catch (_) {
          isMatchingPass = false;
        }

        if (isMatchingPass) {
          // Case B: Recoverable interrupted finalization
          await completePreparation({ redis, publishDate, contentId, leaseId });
          leaseAcquired = false;
          return {
            success: true,
            status: "PREPARED_RECOVERED",
            publishDate,
            contentId
          };
        }
      }

      // Case C: Manifest exists without matching PASS -> Fail closed
      await failPreparation({ redis, publishDate, contentId, leaseId });
      leaseAcquired = false;
      return {
        success: false,
        status: "RECOVERY_REQUIRED",
        publishDate,
        contentId,
        errorCode: "MANIFEST_WITHOUT_MATCHING_PASS"
      };
    }

    // 5. Generate AI creative
    let creative;
    try {
      creative = await generateSocialCreative({
        publishDate,
        category,
        recentTopicHints,
        generateText
      });
    } catch (genErr) {
      throw new SocialPreparationError(
        `Creative generation failed: ${genErr.message}`,
        {
          code: PREPARATION_ERROR_CODES.CREATIVE_GENERATION_FAILED,
          originalCode: genErr.code,
          cause: genErr
        }
      );
    }

    // 6. Build prepared content envelope
    let preparedContent;
    try {
      preparedContent = buildPreparedContent({
        publishDate,
        category: category.id,
        creative
      });
    } catch (prepErr) {
      throw new SocialPreparationError(
        `Prepared content construction failed: ${prepErr.message}`,
        { code: PREPARATION_ERROR_CODES.CREATIVE_GENERATION_FAILED, cause: prepErr }
      );
    }

    // 7. Render carousel slides to 1080x1350 JPEG buffers
    let renderedCarousel;
    try {
      renderedCarousel = await renderCarousel(preparedContent);
    } catch (renderErr) {
      throw new SocialPreparationError(
        `Carousel rendering failed: ${renderErr.message}`,
        { code: PREPARATION_ERROR_CODES.RENDER_FAILED, cause: renderErr }
      );
    }

    // 8. Upload rendered carousel slides to Cloudflare R2
    let storageResult;
    try {
      storageResult = await uploadRenderedCarousel({
        preparedContent,
        renderedCarousel,
        client: r2Client,
        config: r2Config
      });
    } catch (storeErr) {
      throw new SocialPreparationError(
        `R2 storage upload failed: ${storeErr.message}`,
        { code: PREPARATION_ERROR_CODES.STORAGE_FAILED, cause: storeErr }
      );
    }

    // 9. Build and validate publication manifest
    let manifest;
    try {
      manifest = buildManifest({
        preparedContent,
        storageResult
      });
      const manVal = validateManifest(manifest);
      if (!manVal.valid) {
        throw new Error(manVal.errors.join("; "));
      }
    } catch (manErr) {
      throw new SocialPreparationError(
        `Manifest construction or validation failed: ${manErr.message}`,
        { code: PREPARATION_ERROR_CODES.MANIFEST_FAILED, cause: manErr }
      );
    }

    // 10. Load recent Quality Gate history and evaluate
    let recentHistory = [];
    try {
      recentHistory = await loadRecentHistory({
        redis,
        publishDate,
        days: 30
      });
    } catch (histErr) {
      throw new SocialPreparationError(
        `Failed to load recent Quality Gate history: ${histErr.message}`,
        { code: PREPARATION_ERROR_CODES.QUALITY_GATE_FAILED, cause: histErr }
      );
    }

    let evaluation;
    try {
      evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory
      });
    } catch (evalErr) {
      throw new SocialPreparationError(
        `Quality Gate evaluation failed: ${evalErr.message}`,
        { code: PREPARATION_ERROR_CODES.QUALITY_GATE_FAILED, cause: evalErr }
      );
    }

    // 11. Handle Quality Gate FAILED
    if (evaluation.status === QUALITY_STATUS.FAILED || !evaluation.pass) {
      try {
        await saveQualityGateResult({
          redis,
          evaluation
        });
      } catch (saveQErr) {
        // Log or capture if needed
      }

      await failPreparation({
        redis,
        publishDate,
        contentId,
        leaseId
      });
      leaseAcquired = false;

      return {
        success: false,
        status: "QUALITY_FAILED",
        publishDate,
        contentId,
        category: category.id,
        errorCodes: evaluation.errorCodes
      };
    }

    // 12. Handle Quality Gate PASS Finalization
    // A. First save manifest
    let saveManifestRes;
    try {
      saveManifestRes = await saveManifest({
        redis,
        manifest
      });
      if (
        saveManifestRes.status !== "CREATED" &&
        saveManifestRes.status !== "EXISTS_IDENTICAL"
      ) {
        throw new Error(`Unexpected manifest save status '${saveManifestRes.status}'`);
      }
    } catch (saveManErr) {
      throw new SocialPreparationError(
        `Manifest persistence failed: ${saveManErr.message}`,
        { code: PREPARATION_ERROR_CODES.FINALIZATION_FAILED, cause: saveManErr }
      );
    }

    // B. Save PASS Quality Gate result and content history
    try {
      await saveQualityGateResult({
        redis,
        evaluation
      });
    } catch (savePassErr) {
      throw new SocialPreparationError(
        `Quality Gate PASS persistence failed: ${savePassErr.message}`,
        { code: PREPARATION_ERROR_CODES.FINALIZATION_FAILED, cause: savePassErr }
      );
    }

    // C. Verify persisted Quality Gate state matches exact manifest
    try {
      const persistedQualityState = await getQualityGateState({
        redis,
        publishDate
      });
      assertQualityGatePass({
        qualityState: persistedQualityState,
        manifest
      });
    } catch (verifyPassErr) {
      throw new SocialPreparationError(
        `Persisted Quality Gate verification failed: ${verifyPassErr.message}`,
        { code: PREPARATION_ERROR_CODES.FINALIZATION_FAILED, cause: verifyPassErr }
      );
    }

    // D. Complete preparation and release lease
    try {
      await completePreparation({
        redis,
        publishDate,
        contentId,
        leaseId
      });
      leaseAcquired = false;
    } catch (compErr) {
      throw new SocialPreparationError(
        `Preparation completion transition failed: ${compErr.message}`,
        { code: PREPARATION_ERROR_CODES.FINALIZATION_FAILED, cause: compErr }
      );
    }

    // 13. Return sanitized PREPARED result
    return {
      success: true,
      status: "PREPARED",
      publishDate,
      contentId,
      category: category.id,
      slideCount: 5
    };
  } catch (err) {
    if (leaseAcquired) {
      try {
        await failPreparation({
          redis,
          publishDate,
          contentId,
          leaseId
        });
      } catch (_) {
        // Do not let secondary failure mask original error
      }
    }

    if (err instanceof SocialPreparationError) {
      throw err;
    }

    throw new SocialPreparationError(
      `Preparation orchestration failed: ${err.message}`,
      {
        code: PREPARATION_ERROR_CODES.FINALIZATION_FAILED,
        cause: err
      }
    );
  }
}

module.exports = {
  PREPARATION_ERROR_CODES,
  SocialPreparationError,
  prepareDailySocialContent
};
