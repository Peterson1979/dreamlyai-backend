/**
 * DreamlyAI Daily Social Pipeline Serverless HTTP Endpoint
 *
 * Invoked daily by Vercel Cron or authenticated manual trigger.
 * Verifies CRON_SECRET authorization, derives UTC publishDate,
 * and delegates to runProductionSocialPipeline().
 */

const crypto = require("node:crypto");
const { runProductionSocialPipeline } = require("../social/productionRun");
const { isValidDateString } = require("../social/topics");

/**
 * Returns current UTC calendar date as strict YYYY-MM-DD.
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
function getUtcPublishDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Verifies Authorization header using timing-safe comparison against CRON_SECRET.
 * @param {object} req
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
function verifyCronAuthorization(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || typeof cronSecret !== "string" || cronSecret.trim().length === 0) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: CRON_SECRET is not configured."
    };
  }

  const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Missing Authorization header."
    };
  }

  const trimmedHeader = authHeader.trim();
  const expectedHeader = `Bearer ${cronSecret.trim()}`;

  const expectedBuf = Buffer.from(expectedHeader, "utf8");
  const actualBuf = Buffer.from(trimmedHeader, "utf8");

  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Invalid authorization token."
    };
  }

  return { ok: true };
}

/**
 * Vercel Serverless Handler for Daily Social Run
 * @param {object} req Incoming HTTP request
 * @param {object} res Outgoing HTTP response
 */
module.exports = async function socialRunHandler(req, res) {
  try {
    // 1. Method restriction (POST only)
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed. Only POST is accepted.`
      });
    }

    // 2. Authentication check
    const authResult = verifyCronAuthorization(req);
    if (!authResult.ok) {
      return res.status(authResult.status || 401).json({
        success: false,
        error: authResult.error || "Unauthorized"
      });
    }

    // 3. Date derivation
    let publishDate;
    if (req.body && typeof req.body.publishDate === "string" && req.body.publishDate.trim().length > 0) {
      const candidateDate = req.body.publishDate.trim();
      if (!isValidDateString(candidateDate)) {
        return res.status(400).json({
          success: false,
          error: "Invalid publishDate in request body: expected strict YYYY-MM-DD format."
        });
      }
      publishDate = candidateDate;
    } else {
      publishDate = getUtcPublishDate();
    }

    // 4. Execution via Production Entrypoint
    const result = await runProductionSocialPipeline({
      publishDate,
      leaseId: req._injectedLeaseId,
      redis: req._injectedRedis,
      generateText: req._injectedGenerateText,
      r2Client: req._injectedR2Client,
      r2Config: req._injectedR2Config,
      fetchImpl: req._injectedFetchImpl,
      facebookConfig: req._injectedFacebookConfig,
      instagramConfig: req._injectedInstagramConfig,
      sleepImpl: req._injectedSleepImpl
    });

    return res.status(200).json(result);
  } catch (err) {
    // Never serialize exception text: it may contain prompts, provider payloads,
    // credentials, or implementation details that are not reliably redactable.
    console.error("Unhandled error in social-run endpoint");
    return res.status(500).json({
      success: false,
      status: "SERVER_ERROR",
      error: "Internal server error during social pipeline execution."
    });
  }
};

module.exports.getUtcPublishDate = getUtcPublishDate;
module.exports.verifyCronAuthorization = verifyCronAuthorization;
