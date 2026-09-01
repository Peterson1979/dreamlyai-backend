/**
 * Instagram Graph API Configuration for DreamlyAI
 *
 * Defines deterministic configuration for Instagram Graph publishing via Page Access Token
 * and Instagram Business Account ID.
 */

const { META_GRAPH_API_VERSION } = require("./facebookConfig");

const REQUIRED_INSTAGRAM_ENV_VARS = Object.freeze([
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID"
]);

/**
 * Loads and validates Instagram publishing configuration from environment.
 * @param {object} [env=process.env]
 * @returns {{ pageId: string, pageAccessToken: string, instagramBusinessAccountId: string, graphApiVersion: string, graphBaseUrl: string }}
 */
function loadInstagramConfig(env = process.env) {
  if (!env || typeof env !== "object") {
    throw new Error("Invalid environment: expected an environment object");
  }

  for (const varName of REQUIRED_INSTAGRAM_ENV_VARS) {
    const val = env[varName];
    if (typeof val !== "string" || val.trim().length === 0) {
      throw new Error(`Missing or empty required environment variable: ${varName}`);
    }
  }

  const pageId = env.FACEBOOK_PAGE_ID.trim();
  const pageAccessToken = env.FACEBOOK_PAGE_ACCESS_TOKEN.trim();
  const instagramBusinessAccountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID.trim();

  if (!/^\d+$/.test(pageId)) {
    throw new Error("Invalid FACEBOOK_PAGE_ID: must contain digits only");
  }

  if (!/^\d+$/.test(instagramBusinessAccountId)) {
    throw new Error("Invalid INSTAGRAM_BUSINESS_ACCOUNT_ID: must contain digits only");
  }

  const graphBaseUrl = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

  return {
    pageId,
    pageAccessToken,
    instagramBusinessAccountId,
    graphApiVersion: META_GRAPH_API_VERSION,
    graphBaseUrl
  };
}

/**
 * Builds request descriptor for Page + Instagram Business identity verification.
 * @param {object} config
 * @returns {{ method: string, url: string, headers: { Authorization: string } }}
 */
function buildInstagramIdentityRequest(config) {
  if (!config || typeof config !== "object" || !config.graphBaseUrl || !config.pageAccessToken || !config.pageId) {
    throw new Error("Invalid config passed to buildInstagramIdentityRequest");
  }

  return {
    method: "GET",
    url: `${config.graphBaseUrl}/${config.pageId}?fields=id,name,instagram_business_account`,
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`
    }
  };
}

/**
 * Builds request descriptor for Instagram container readiness status check.
 * @param {object} params
 * @param {object} params.config
 * @param {string} params.containerId
 * @returns {{ method: string, url: string, headers: { Authorization: string } }}
 */
function buildContainerStatusRequest({ config, containerId } = {}) {
  if (!config || typeof config !== "object" || !config.graphBaseUrl || !config.pageAccessToken) {
    throw new Error("Invalid config passed to buildContainerStatusRequest");
  }
  if (typeof containerId !== "string" || containerId.trim().length === 0) {
    throw new Error("Invalid containerId passed to buildContainerStatusRequest: must be a non-empty string");
  }

  return {
    method: "GET",
    url: `${config.graphBaseUrl}/${containerId.trim()}?fields=status_code,status`,
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`
    }
  };
}

module.exports = {
  META_GRAPH_API_VERSION,
  REQUIRED_INSTAGRAM_ENV_VARS,
  loadInstagramConfig,
  buildInstagramIdentityRequest,
  buildContainerStatusRequest
};
