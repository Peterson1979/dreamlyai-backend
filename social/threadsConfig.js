/**
 * Threads Graph API Configuration for DreamlyAI
 *
 * Defines deterministic configuration for Threads Graph API publishing via
 * User ID and Threads User Access Token.
 */

const DEFAULT_THREADS_API_VERSION = "v1.0";
const THREADS_GRAPH_BASE_URL = "https://graph.threads.net";

const REQUIRED_THREADS_ENV_VARS = Object.freeze([
  "THREADS_USER_ID",
  "THREADS_ACCESS_TOKEN"
]);

/**
 * Checks boolean flag from environment (defaults to true unless explicitly 'false' or '0').
 * @param {string | undefined} val
 * @param {boolean} [defaultVal=true]
 * @returns {boolean}
 */
function parseBoolEnv(val, defaultVal = true) {
  if (val === undefined || val === null || val === "") return defaultVal;
  const s = String(val).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/**
 * Checks whether Threads publishing is configured in environment.
 * @param {object} [env=process.env]
 * @returns {boolean}
 */
function isThreadsConfigured(env = process.env) {
  if (!env || typeof env !== "object") return false;
  const token = env.THREADS_ACCESS_TOKEN || env.DREAMLY_THREADS_ACCESS_TOKEN;
  const userId = env.THREADS_USER_ID || env.DREAMLY_THREADS_USER_ID;
  return Boolean(
    typeof token === "string" &&
    token.trim().length > 0 &&
    typeof userId === "string" &&
    userId.trim().length > 0
  );
}

/**
 * Loads and validates Threads publishing configuration from environment.
 * @param {object} [env=process.env]
 * @returns {{ userId: string, accessToken: string, apiVersion: string, baseUrl: string, enabled: boolean, httpTimeoutMs: number, pollMaxAttempts: number, pollIntervalMs: number }}
 */
function loadThreadsConfig(env = process.env) {
  if (!env || typeof env !== "object") {
    throw new Error("Invalid environment: expected an environment object");
  }

  const userId = (env.THREADS_USER_ID || env.DREAMLY_THREADS_USER_ID || "").trim();
  const accessToken = (env.THREADS_ACCESS_TOKEN || env.DREAMLY_THREADS_ACCESS_TOKEN || "").trim();
  const apiVersion = (env.THREADS_API_VERSION || env.DREAMLY_THREADS_API_VERSION || DEFAULT_THREADS_API_VERSION).trim();

  const enabled = parseBoolEnv(
    env.THREADS_ENABLED ?? env.DREAMLY_THREADS_ENABLED,
    true
  );

  const errors = [];
  if (!userId) {
    errors.push("Missing required environment variable: THREADS_USER_ID");
  }
  if (!accessToken) {
    errors.push("Missing required environment variable: THREADS_ACCESS_TOKEN");
  }

  if (errors.length > 0) {
    throw new Error(`Threads configuration invalid: ${errors.join("; ")}`);
  }

  const baseUrl = `${THREADS_GRAPH_BASE_URL}/${apiVersion}`;

  return {
    userId,
    accessToken,
    apiVersion,
    baseUrl,
    enabled,
    httpTimeoutMs: Number(env.THREADS_HTTP_TIMEOUT_MS) || 30000,
    pollMaxAttempts: Number(env.THREADS_POLL_MAX_ATTEMPTS) || 15,
    pollIntervalMs: Number(env.THREADS_POLL_INTERVAL_MS) || 2000
  };
}

/**
 * Validates a Threads config object.
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateThreadsConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Missing or non-object Threads config"] };
  }
  if (!config.userId || typeof config.userId !== "string" || config.userId.trim().length === 0) {
    errors.push("Missing or invalid userId in Threads config");
  }
  if (!config.accessToken || typeof config.accessToken !== "string" || config.accessToken.trim().length === 0) {
    errors.push("Missing or invalid accessToken in Threads config");
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Redacts secrets from string or object for safe diagnostic logging.
 * @param {*} val
 * @returns {*}
 */
function redactSecrets(val) {
  if (typeof val === "string") {
    return val
      .replace(/(access_token|token|bearer|secret)=([^&,\s]+)/gi, "$1=[REDACTED]")
      .replace(/(THA|THQ)[a-zA-Z0-9_\-\.]+/g, "[REDACTED_THREADS_TOKEN]")
      .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]+/gi, "$1[REDACTED]");
  }
  if (typeof val === "object" && val !== null) {
    const copy = Array.isArray(val) ? [] : {};
    for (const [k, v] of Object.entries(val)) {
      if (/token|secret|password|auth|key/i.test(k) && typeof v === "string") {
        copy[k] = "[REDACTED]";
      } else {
        copy[k] = redactSecrets(v);
      }
    }
    return copy;
  }
  return val;
}

module.exports = {
  DEFAULT_THREADS_API_VERSION,
  THREADS_GRAPH_BASE_URL,
  REQUIRED_THREADS_ENV_VARS,
  isThreadsConfigured,
  loadThreadsConfig,
  validateThreadsConfig,
  redactSecrets,
  parseBoolEnv
};
