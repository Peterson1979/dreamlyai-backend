/**
 * Cloudflare R2 Storage Configuration and Key Construction
 *
 * Defines deterministic R2 credentials contract, object key generator, and public URL builders.
 */

const { isValidDateString } = require("./topics");

const REQUIRED_R2_ENV_VARS = Object.freeze([
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL"
]);

/**
 * Loads and validates Cloudflare R2 configuration from environment or injected env object.
 * @param {object} [env=process.env]
 * @returns {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucketName: string, publicBaseUrl: string, endpoint: string, region: string }}
 */
function loadR2Config(env = process.env) {
  if (!env || typeof env !== "object") {
    throw new Error("Invalid environment: expected an environment object");
  }

  for (const varName of REQUIRED_R2_ENV_VARS) {
    const val = env[varName];
    if (typeof val !== "string" || val.trim().length === 0) {
      throw new Error(`Missing or empty required environment variable: ${varName}`);
    }
  }

  const accountId = env.R2_ACCOUNT_ID.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY.trim();
  const bucketName = env.R2_BUCKET_NAME.trim();
  const rawPublicBaseUrl = env.R2_PUBLIC_BASE_URL.trim();

  let parsedUrl;
  try {
    parsedUrl = new URL(rawPublicBaseUrl);
  } catch (err) {
    throw new Error(`Invalid R2_PUBLIC_BASE_URL: '${rawPublicBaseUrl}' is not a valid absolute URL`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`Invalid R2_PUBLIC_BASE_URL: must use HTTPS protocol, received '${parsedUrl.protocol}'`);
  }

  if (parsedUrl.search) {
    throw new Error("Invalid R2_PUBLIC_BASE_URL: must not contain query parameters");
  }

  if (parsedUrl.hash) {
    throw new Error("Invalid R2_PUBLIC_BASE_URL: must not contain URL fragments");
  }

  const publicBaseUrl = rawPublicBaseUrl.replace(/\/+$/, "");
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    endpoint,
    region
  };
}

/**
 * Builds deterministic storage key for a slide.
 * Format: social/YYYY/MM/DD/slide-NN.jpg
 * @param {string} publishDate Strict YYYY-MM-DD
 * @param {number} slideIndex Integer 1..5
 * @returns {string}
 */
function buildSlideStorageKey(publishDate, slideIndex) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: expected strict YYYY-MM-DD format, received '${publishDate}'`);
  }

  if (!Number.isInteger(slideIndex) || slideIndex < 1 || slideIndex > 5) {
    throw new Error(`Invalid slideIndex: expected integer between 1 and 5, received '${slideIndex}'`);
  }

  const parts = publishDate.split("-");
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const paddedIndex = String(slideIndex).padStart(2, "0");

  return `social/${year}/${month}/${day}/slide-${paddedIndex}.jpg`;
}

/**
 * Builds public media URL from base URL and storage key.
 * @param {string} publicBaseUrl
 * @param {string} storageKey
 * @returns {string}
 */
function buildPublicMediaUrl(publicBaseUrl, storageKey) {
  if (typeof publicBaseUrl !== "string" || publicBaseUrl.trim().length === 0) {
    throw new Error("Invalid publicBaseUrl: must be a non-empty string");
  }
  if (typeof storageKey !== "string" || storageKey.trim().length === 0) {
    throw new Error("Invalid storageKey: must be a non-empty string");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(publicBaseUrl);
  } catch (err) {
    throw new Error(`Invalid publicBaseUrl: '${publicBaseUrl}' is not a valid absolute URL`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`Invalid publicBaseUrl: must use HTTPS protocol, received '${parsedUrl.protocol}'`);
  }

  const cleanBase = publicBaseUrl.trim().replace(/\/+$/, "");
  const cleanKey = storageKey.trim().replace(/^\/+/, "");

  return `${cleanBase}/${cleanKey}`;
}

module.exports = {
  REQUIRED_R2_ENV_VARS,
  loadR2Config,
  buildSlideStorageKey,
  buildPublicMediaUrl
};
