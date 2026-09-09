/**
 * Facebook Graph API Configuration for DreamlyAI
 *
 * Defines deterministic configuration for Meta Graph API v25.0 and Page Access Token validation.
 */

const META_GRAPH_API_VERSION = "v25.0";

const REQUIRED_FACEBOOK_ENV_VARS = Object.freeze([
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN"
]);

/**
 * Loads and validates Facebook Page publishing configuration from environment.
 * @param {object} [env=process.env]
 * @returns {{ pageId: string, pageAccessToken: string, graphApiVersion: string, graphBaseUrl: string }}
 */
function loadFacebookConfig(env = process.env) {
  if (!env || typeof env !== "object") {
    throw new Error("Invalid environment: expected an environment object");
  }

  for (const varName of REQUIRED_FACEBOOK_ENV_VARS) {
    const val = env[varName];
    if (typeof val !== "string" || val.trim().length === 0) {
      throw new Error(`Missing or empty required environment variable: ${varName}`);
    }
  }

  const pageId = env.FACEBOOK_PAGE_ID.trim();
  const pageAccessToken = env.FACEBOOK_PAGE_ACCESS_TOKEN.trim();

  if (!/^\d+$/.test(pageId)) {
    throw new Error("Invalid FACEBOOK_PAGE_ID: must contain digits only");
  }

  const graphBaseUrl = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

  return {
    pageId,
    pageAccessToken,
    graphApiVersion: META_GRAPH_API_VERSION,
    graphBaseUrl
  };
}

/**
 * Builds request descriptor for Facebook Page identity check without placing token in URL.
 * @param {object} config
 * @returns {{ method: string, url: string, headers: { Authorization: string } }}
 */
function buildFacebookPageIdentityRequest(config) {
  if (!config || typeof config !== "object" || !config.graphBaseUrl || !config.pageAccessToken) {
    throw new Error("Invalid config passed to buildFacebookPageIdentityRequest");
  }

  const targetPath = config.pageId ? config.pageId.trim() : "me";

  return {
    method: "GET",
    url: `${config.graphBaseUrl}/${targetPath}?fields=id,name,access_token`,
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`
    }
  };
}

/**
 * Checks whether secondary Facebook Page publishing is configured in environment.
 * @param {object} [env=process.env]
 * @returns {boolean}
 */
function isFacebookSecondaryConfigured(env = process.env) {
  if (!env || typeof env !== "object") return false;
  const val = env.FACEBOOK_SECONDARY_PAGE_ID;
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Loads and validates secondary Facebook Page publishing configuration from environment.
 * If FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN is not provided, dynamically falls back to FACEBOOK_PAGE_ACCESS_TOKEN.
 * Returns null if secondary Facebook Page is not configured.
 * @param {object} [env=process.env]
 * @returns {{ pageId: string, pageAccessToken: string, graphApiVersion: string, graphBaseUrl: string } | null}
 */
function loadFacebookSecondaryConfig(env = process.env) {
  if (!env || typeof env !== "object") {
    throw new Error("Invalid environment: expected an environment object");
  }

  if (!isFacebookSecondaryConfigured(env)) {
    return null;
  }

  const pageId = env.FACEBOOK_SECONDARY_PAGE_ID.trim();
  if (!/^\d+$/.test(pageId)) {
    throw new Error("Invalid FACEBOOK_SECONDARY_PAGE_ID: must contain digits only");
  }

  const secondaryToken =
    typeof env.FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN === "string" &&
    env.FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN.trim().length > 0
      ? env.FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN.trim()
      : null;

  const primaryToken =
    typeof env.FACEBOOK_PAGE_ACCESS_TOKEN === "string" &&
    env.FACEBOOK_PAGE_ACCESS_TOKEN.trim().length > 0
      ? env.FACEBOOK_PAGE_ACCESS_TOKEN.trim()
      : null;

  const pageAccessToken = secondaryToken || primaryToken;
  if (!pageAccessToken) {
    throw new Error(
      "Missing secondary Facebook page access token: neither FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN nor FACEBOOK_PAGE_ACCESS_TOKEN is configured"
    );
  }

  const graphBaseUrl = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

  return {
    pageId,
    pageAccessToken,
    graphApiVersion: META_GRAPH_API_VERSION,
    graphBaseUrl
  };
}

module.exports = {
  META_GRAPH_API_VERSION,
  REQUIRED_FACEBOOK_ENV_VARS,
  loadFacebookConfig,
  isFacebookSecondaryConfigured,
  loadFacebookSecondaryConfig,
  buildFacebookPageIdentityRequest
};

