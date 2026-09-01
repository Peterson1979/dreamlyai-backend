/**
 * Public read-only proxy for generated DreamlyAI social JPEGs.
 *
 * R2 remains private. This endpoint exposes only the deterministic social slide
 * key space through the Vercel production URL used by Meta media fetches.
 */

const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { loadR2Config } = require("../../social/storageConfig");
const { createR2Client } = require("../../social/storage");
const { isValidDateString } = require("../../social/topics");

const MEDIA_PREFIX = "/api/social-media/";
const SOCIAL_SLIDE_PATH = /^social\/\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/slide-0[1-5]\.jpg$/;

function invalidMediaPath(res) {
  return res.status(404).json({
    success: false,
    error: "media_not_found"
  });
}

function getRawRequestPath(req) {
  const requestUrl = typeof req?.url === "string" ? req.url : "";
  if (!requestUrl) return null;

  const rawPath = requestUrl.split("?")[0].split("#")[0];
  const prefixIndex = rawPath.indexOf(MEDIA_PREFIX);
  if (prefixIndex < 0) return null;
  return rawPath.slice(prefixIndex + MEDIA_PREFIX.length);
}

function getRequestedKey(req) {
  const rawPath = getRawRequestPath(req);
  const queryPath = req?.query?.path;

  // Vercel supplies catch-all segments through req.query.path. Prefer the raw
  // URL as well so encoded traversal attempts cannot be normalized silently.
  const candidate = rawPath !== null
    ? rawPath
    : Array.isArray(queryPath)
      ? queryPath.join("/")
      : typeof queryPath === "string"
        ? queryPath
        : null;

  if (typeof candidate !== "string" || candidate.length === 0) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }

  // Reject encoded separators, backslashes, NULs, traversal markers, and any
  // non-canonical representation before applying the exact key allow-list.
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("..") ||
    candidate.includes("%")
  ) {
    return null;
  }

  if (!SOCIAL_SLIDE_PATH.test(decoded)) return null;

  const pathParts = decoded.split("/");
  const date = pathParts.slice(1, 4).join("-");
  if (!isValidDateString(date)) return null;

  return decoded;
}

function isMissingObjectError(err) {
  return Boolean(
    err && (
      err.name === "NoSuchKey" ||
      err.Code === "NoSuchKey" ||
      err.code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404 ||
      err.statusCode === 404
    )
  );
}

async function bodyToBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);

  if (body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  if (body && typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  throw new Error("R2 object body is unavailable");
}

module.exports = async function socialMediaHandler(req, res) {
  if (req?.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "method_not_allowed"
    });
  }

  const key = getRequestedKey(req);
  if (!key) return invalidMediaPath(res);

  let config;
  let client;
  try {
    config = req._injectedR2Config || loadR2Config();
    client = req._injectedR2Client || createR2Client(config);

    const result = await client.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key
    }));
    const body = await bodyToBuffer(result?.Body);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(body.length));
    return res.status(200).send(body);
  } catch (err) {
    if (isMissingObjectError(err)) return invalidMediaPath(res);

    return res.status(500).json({
      success: false,
      error: "media_unavailable"
    });
  }
};

module.exports.getRequestedKey = getRequestedKey;
module.exports.isMissingObjectError = isMissingObjectError;
