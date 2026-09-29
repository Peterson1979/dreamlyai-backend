/**
 * Dreamly AI Daily Video Pipeline Serverless HTTP Endpoint
 *
 * Invoked daily by Vercel Cron (schedule: "0 16 * * *") or authenticated manual trigger.
 * Verifies CRON_SECRET authorization, derives UTC publishDate, and delegates
 * to runDailyVideoPipeline().
 */

const crypto = require("node:crypto");
const { runDailyVideoPipeline, getUtcVideoPublishDate } = require("../social/video/videoRun");
const { isValidDateString } = require("../social/topics");

/**
 * Verifies Authorization header using timing-safe comparison against CRON_SECRET.
 * @param {object} req
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
function verifyCronAuthorization(req) {
  const cronSecret = process.env.CRON_SECRET;
  const tokenStatusSecret = process.env.TOKEN_STATUS_SECRET;

  if (
    (!cronSecret || typeof cronSecret !== "string" || cronSecret.trim().length === 0) &&
    (!tokenStatusSecret || typeof tokenStatusSecret !== "string" || tokenStatusSecret.trim().length === 0)
  ) {
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
  const actualBuf = Buffer.from(trimmedHeader, "utf8");

  let authorized = false;

  if (cronSecret && typeof cronSecret === "string" && cronSecret.trim().length > 0) {
    const expectedHeader = `Bearer ${cronSecret.trim()}`;
    const expectedBuf = Buffer.from(expectedHeader, "utf8");
    if (
      expectedBuf.length === actualBuf.length &&
      crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      authorized = true;
    }
  }

  if (!authorized && tokenStatusSecret && typeof tokenStatusSecret === "string" && tokenStatusSecret.trim().length > 0) {
    const expectedHeader = `Bearer ${tokenStatusSecret.trim()}`;
    const expectedBuf = Buffer.from(expectedHeader, "utf8");
    if (
      expectedBuf.length === actualBuf.length &&
      crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      authorized = true;
    }
  }

  if (!authorized) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Invalid authorization token."
    };
  }

  return { ok: true };
}

/**
 * Vercel Serverless Handler for Daily Video Social Run
 * @param {object} req Incoming HTTP request
 * @param {object} res Outgoing HTTP response
 */
module.exports = async function videoRunHandler(req, res) {
  try {
    // 1. Method restriction (POST and GET accepted for Vercel Cron compatibility)
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed. Only POST and GET are accepted.`
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

    // 3. Date derivation & parameter parsing
    let publishDate;
    const rawDate = (req.body && typeof req.body.publishDate === "string" && req.body.publishDate.trim().length > 0)
      ? req.body.publishDate.trim()
      : (req.body && typeof req.body.date === "string" && req.body.date.trim().length > 0)
        ? req.body.date.trim()
        : (req.query && typeof req.query.publishDate === "string" && req.query.publishDate.trim().length > 0)
          ? req.query.publishDate.trim()
          : (req.query && typeof req.query.date === "string" && req.query.date.trim().length > 0)
            ? req.query.date.trim()
            : null;

    if (rawDate) {
      if (!isValidDateString(rawDate)) {
        return res.status(400).json({
          success: false,
          error: "Invalid publishDate: expected strict YYYY-MM-DD format."
        });
      }
      publishDate = rawDate;
    } else {
      publishDate = getUtcVideoPublishDate();
    }

    const query = req.query || {};
    const dryRun = query.dryRun === "true" || query.dryRun === true || req.body?.dryRun === true;
    const isCanary = query.canary === "true" || query.canary === true || req.body?.isCanary === true;

    // 4. Execution via Video Pipeline Runner
    const result = await runDailyVideoPipeline({
      publishDate,
      leaseId: req._injectedLeaseId,
      redis: req._injectedRedis,
      targetsConfig: req._injectedTargetsConfig,
      adapters: req._injectedAdapters,
      requestedTargets: req.body?.targets || req.query?.targets?.split(","),
      fetchFn: req._injectedFetchFn,
      sleepFn: req._injectedSleepFn,
      dryRun,
      isCanary
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("Unhandled error in video-run endpoint:", err.message || err);
    return res.status(500).json({
      success: false,
      status: "SERVER_ERROR",
      error: "Internal server error during video pipeline execution."
    });
  }
};

module.exports.verifyCronAuthorization = verifyCronAuthorization;
