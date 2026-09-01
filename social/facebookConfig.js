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

  return {
    method: "GET",
    url: `${config.graphBaseUrl}/me?fields=id,name`,
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`
    }
  };
}

module.exports = {
  META_GRAPH_API_VERSION,
  REQUIRED_FACEBOOK_ENV_VARS,
  loadFacebookConfig,
  buildFacebookPageIdentityRequest
};
