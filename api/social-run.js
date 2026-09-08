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
 * Vercel Serverless Handler for Daily Social Run
 * @param {object} req Incoming HTTP request
 * @param {object} res Outgoing HTTP response
 */
module.exports = async function socialRunHandler(req, res) {
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

    // 3. Date derivation
    let publishDate;
    const rawDate = (req.body && typeof req.body.publishDate === "string" && req.body.publishDate.trim().length > 0)
      ? req.body.publishDate.trim()
      : (req.query && typeof req.query.publishDate === "string" && req.query.publishDate.trim().length > 0)
        ? req.query.publishDate.trim()
        : null;

    if (rawDate) {
      if (!isValidDateString(rawDate)) {
        return res.status(400).json({
          success: false,
          error: "Invalid publishDate in request body: expected strict YYYY-MM-DD format."
        });
      }
      publishDate = rawDate;
    } else {
      publishDate = getUtcPublishDate();
    }

    if (req.body && req.body.diagnoseFacebook === true) {
      const { loadFacebookConfig } = require("../social/facebookConfig");
      const config = loadFacebookConfig();
      const results = {};

      try {
        const res1 = await fetch(`${config.graphBaseUrl}/me?fields=id,name`, {
          headers: { Authorization: `Bearer ${config.pageAccessToken}` }
        });
        results.me = { status: res1.status, data: await res1.json() };
      } catch (e) {
        results.me = { error: e.message };
      }

      try {
        const res2 = await fetch(`${config.graphBaseUrl}/${config.pageId}?fields=id,name,access_token`, {
          headers: { Authorization: `Bearer ${config.pageAccessToken}` }
        });
        const d2 = await res2.json();
        results.page = {
          status: res2.status,
          hasPageAccessToken: Boolean(d2.access_token),
          data: { id: d2.id, name: d2.name }
        };
        if (d2.access_token) {
          // Test photo upload with the Page Access Token
          const photoBody = new URLSearchParams({
            url: "https://pub-f7295eaef2044c31b84934859c031ef9.r2.dev/social/2026/09/08/slide-01.jpg",
            published: "false"
          });
          const resPhoto = await fetch(`${config.graphBaseUrl}/${config.pageId}/photos`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${d2.access_token}`,
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: photoBody.toString()
          });
          results.photoUploadWithPageToken = {
            status: resPhoto.status,
            data: await resPhoto.json()
          };
        }
      } catch (e) {
        results.page = { error: e.message };
      }

      try {
        const resAcc = await fetch(`${config.graphBaseUrl}/me/accounts?fields=id,name,access_token`, {
          headers: { Authorization: `Bearer ${config.pageAccessToken}` }
        });
        const accData = await resAcc.json();
        results.meAccounts = {
          status: resAcc.status,
          accountsCount: accData.data ? accData.data.length : 0,
          accounts: accData.data ? accData.data.map(a => ({ id: a.id, name: a.name, hasToken: Boolean(a.access_token) })) : accData
        };
      } catch (e) {
        results.meAccounts = { error: e.message };
      }

      return res.status(200).json({
        success: true,
        diagnostics: results
      });
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
