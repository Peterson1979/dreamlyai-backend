/**
 * Dreamly AI Video Social Publishing State & Lease Management
 *
 * Implements isolated Redis state keys for video publishing, atomic leases,
 * token persistence/rotation, and idempotency guarantees.
 * Video state is completely isolated from carousel social state keys.
 */

const { getRedisClient } = require("../../utils/redisClient");
const { isValidDateString } = require("../topics");
const { canonicalizeTargetId } = require("./videoTargets");

const VIDEO_PUBLISH_STATUS = Object.freeze({
  IDLE: "IDLE",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
  RECONCILIATION_REQUIRED: "RECONCILIATION_REQUIRED"
});

const RELEASE_LEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

function resolveRedis(injectedRedis) {
  if (injectedRedis) return injectedRedis;
  const client = getRedisClient();
  if (!client) {
    throw new Error("Redis client is unavailable");
  }
  return client;
}

function buildVideoManifestKey(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for video manifest key: '${publishDate}'`);
  }
  return `social:video:manifest:${publishDate}`;
}

function buildVideoTargetStateKey(publishDate, target) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for video target state key: '${publishDate}'`);
  }
  const canTarget = canonicalizeTargetId(target) || target;
  return `social:video:state:${publishDate}:${canTarget}`;
}

function buildVideoTargetLeaseKey(publishDate, target) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for video target lease key: '${publishDate}'`);
  }
  const canTarget = canonicalizeTargetId(target) || target;
  return `social:video:lease:${publishDate}:${canTarget}`;
}

function buildVideoTokenKey(provider, target = "default") {
  const normProv = String(provider).trim().toLowerCase();
  const canTarget = canonicalizeTargetId(target) || target;
  return `social:video:token:${normProv}:${canTarget}`;
}

/**
 * Retrieves the persisted state for a given video date and target.
 * @param {object} redis
 * @param {string} publishDate
 * @param {string} target
 * @returns {Promise<object | null>}
 */
async function getVideoTargetState(redis, publishDate, target) {
  const client = resolveRedis(redis);
  const key = buildVideoTargetStateKey(publishDate, target);
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Saves state for a given video date and target.
 * @param {object} redis
 * @param {string} publishDate
 * @param {string} target
 * @param {object} stateObj
 * @returns {Promise<boolean>}
 */
async function saveVideoTargetState(redis, publishDate, target, stateObj) {
  const client = resolveRedis(redis);
  const key = buildVideoTargetStateKey(publishDate, target);
  await client.set(key, JSON.stringify(stateObj));
  return true;
}

/**
 * Claims an atomic lease for publishing to a specific target.
 * @param {object} redis
 * @param {string} publishDate
 * @param {string} target
 * @param {string} leaseId
 * @param {number} [ttlSeconds=120]
 * @returns {Promise<{ acquired: boolean, holderLeaseId?: string }>}
 */
async function claimVideoTargetLease(redis, publishDate, target, leaseId, ttlSeconds = 120) {
  const client = resolveRedis(redis);
  const key = buildVideoTargetLeaseKey(publishDate, target);

  // Set with NX and EX
  let res;
  if (typeof client.set === "function") {
    // Check if ioredis or upstash/custom
    res = await client.set(key, leaseId, "EX", ttlSeconds, "NX");
  } else {
    res = await client.set(key, leaseId, { nx: true, ex: ttlSeconds });
  }

  if (res === "OK" || res === 1 || res === true) {
    return { acquired: true };
  }

  const holder = await client.get(key);
  return { acquired: false, holderLeaseId: holder || "(unknown)" };
}

/**
 * Releases an atomic lease safely using Lua script.
 * @param {object} redis
 * @param {string} publishDate
 * @param {string} target
 * @param {string} leaseId
 * @returns {Promise<boolean>}
 */
async function releaseVideoTargetLease(redis, publishDate, target, leaseId) {
  const client = resolveRedis(redis);
  const key = buildVideoTargetLeaseKey(publishDate, target);
  try {
    if (typeof client.eval === "function") {
      const res = await client.eval(RELEASE_LEASE_LUA, 1, key, leaseId);
      return res === 1;
    }
  } catch (_) {
    // Fallback if eval is not supported
    const val = await client.get(key);
    if (val === leaseId) {
      await client.del(key);
      return true;
    }
  }
  return false;
}

/**
 * Marks target as PUBLISHED.
 */
async function markVideoTargetPublished(redis, publishDate, target, { postId, publishedAt, details = {} } = {}) {
  const client = resolveRedis(redis);
  const stateObj = {
    status: VIDEO_PUBLISH_STATUS.PUBLISHED,
    publishDate,
    target: canonicalizeTargetId(target) || target,
    postId: String(postId),
    publishedAt: publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    details
  };
  await saveVideoTargetState(client, publishDate, target, stateObj);
  return stateObj;
}

/**
 * Marks target as FAILED.
 */
async function markVideoTargetFailed(redis, publishDate, target, { error, errorCode, details = {} } = {}) {
  const client = resolveRedis(redis);
  const stateObj = {
    status: VIDEO_PUBLISH_STATUS.FAILED,
    publishDate,
    target: canonicalizeTargetId(target) || target,
    error: typeof error === "string" ? error : (error?.message || "Publishing failed"),
    errorCode: errorCode || "VIDEO_PUBLISH_FAILED",
    failedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    details
  };
  await saveVideoTargetState(client, publishDate, target, stateObj);
  return stateObj;
}

/**
 * Marks target as RECONCILIATION_REQUIRED.
 */
async function markVideoTargetReconciliationRequired(redis, publishDate, target, { error, reconciliationData = {} } = {}) {
  const client = resolveRedis(redis);
  const stateObj = {
    status: VIDEO_PUBLISH_STATUS.RECONCILIATION_REQUIRED,
    publishDate,
    target: canonicalizeTargetId(target) || target,
    error: typeof error === "string" ? error : (error?.message || "Ambiguous transport error"),
    reconciliationData,
    failedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveVideoTargetState(client, publishDate, target, stateObj);
  return stateObj;
}

/**
 * Loads OAuth token state for YouTube / Pinterest.
 */
async function getVideoTokenState(redis, provider, target = "default") {
  const client = resolveRedis(redis);
  const key = buildVideoTokenKey(provider, target);
  const raw = await client.get(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

/**
 * Saves rotated OAuth token state for YouTube / Pinterest.
 */
async function saveVideoTokenState(redis, provider, target = "default", tokenState = {}) {
  const client = resolveRedis(redis);
  const key = buildVideoTokenKey(provider, target);
  await client.set(key, JSON.stringify(tokenState));
  return true;
}

module.exports = {
  VIDEO_PUBLISH_STATUS,
  buildVideoManifestKey,
  buildVideoTargetStateKey,
  buildVideoTargetLeaseKey,
  buildVideoTokenKey,
  getVideoTargetState,
  saveVideoTargetState,
  claimVideoTargetLease,
  releaseVideoTargetLease,
  markVideoTargetPublished,
  markVideoTargetFailed,
  markVideoTargetReconciliationRequired,
  getVideoTokenState,
  saveVideoTokenState
};
