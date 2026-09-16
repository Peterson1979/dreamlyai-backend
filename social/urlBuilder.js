/**
 * Centralized Acquisition URL Builder for Dreamly AI
 *
 * Generates deterministic, properly-attributed Google Play Store URLs and Website URLs
 * with standardized UTM campaign and referrer parameters.
 */

const { GOOGLE_PLAY_URL } = require("./config");

const SUPPORTED_SOURCES = Object.freeze([
  "facebook",
  "instagram",
  "pinterest",
  "google",
  "direct",
  "website"
]);

const DEFAULT_MEDIUM = "social";
const DEFAULT_CAMPAIGN = "daily_social";

/**
 * Normalizes input string to lowercase alphanumeric with underscores/hyphens.
 */
function normalizeParam(val, defaultVal = "") {
  if (!val || typeof val !== "string") return defaultVal;
  return val.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64) || defaultVal;
}

/**
 * Builds an attributed Google Play Store URL with a normalized `referrer` query parameter.
 *
 * @param {object} params
 * @param {string} [params.platform="facebook"] Platform source (facebook, instagram, pinterest, etc.)
 * @param {string} [params.medium="social"] Marketing medium (social, referral, organic)
 * @param {string} [params.campaign="daily_social"] Campaign name or topic ID
 * @param {string} [params.contentId="general"] Content identifier (e.g. social-2026-09-16)
 * @returns {string} Fully qualified Play Store URL with attributed referrer query
 */
function buildAttributedPlayStoreUrl({
  platform = "facebook",
  medium = DEFAULT_MEDIUM,
  campaign = DEFAULT_CAMPAIGN,
  contentId = "general"
} = {}) {
  const normSource = normalizeParam(platform, "facebook");
  const normMedium = normalizeParam(medium, DEFAULT_MEDIUM);
  const normCampaign = normalizeParam(campaign, DEFAULT_CAMPAIGN);
  const normContent = normalizeParam(contentId, "general");

  // Construct standard raw referrer string
  const rawReferrer = `utm_source=${normSource}&utm_medium=${normMedium}&utm_campaign=${normCampaign}&utm_content=${normContent}`;
  const encodedReferrer = encodeURIComponent(rawReferrer);

  return `${GOOGLE_PLAY_URL}&referrer=${encodedReferrer}`;
}

/**
 * Builds an attributed Website URL with standard UTM query parameters.
 *
 * @param {object} params
 * @param {string} [params.baseUrl="https://dreamlyai-backend.vercel.app"] Website base URL
 * @param {string} [params.platform="facebook"] Platform source
 * @param {string} [params.medium="social"] Marketing medium
 * @param {string} [params.campaign="daily_social"] Campaign name or topic ID
 * @param {string} [params.contentId="general"] Content identifier
 * @returns {string} Fully qualified Website URL with UTM query parameters
 */
function buildAttributedWebUrl({
  baseUrl = "https://dreamlyai-backend.vercel.app",
  platform = "facebook",
  medium = DEFAULT_MEDIUM,
  campaign = DEFAULT_CAMPAIGN,
  contentId = "general"
} = {}) {
  const normSource = normalizeParam(platform, "facebook");
  const normMedium = normalizeParam(medium, DEFAULT_MEDIUM);
  const normCampaign = normalizeParam(campaign, DEFAULT_CAMPAIGN);
  const normContent = normalizeParam(contentId, "general");

  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/?utm_source=${encodeURIComponent(normSource)}&utm_medium=${encodeURIComponent(normMedium)}&utm_campaign=${encodeURIComponent(normCampaign)}&utm_content=${encodeURIComponent(normContent)}`;
}

module.exports = {
  SUPPORTED_SOURCES,
  buildAttributedPlayStoreUrl,
  buildAttributedWebUrl
};
