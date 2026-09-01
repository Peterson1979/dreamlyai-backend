/**
 * Social Pipeline Preparation and Publication State Management
 *
 * Implements deterministic Redis-backed state tracking, atomic lease acquisition,
 * compare-and-delete lease release, and fail-closed state machines for DreamlyAI.
 */

const { getRedisClient } = require("../utils/redisClient");
const { isValidDateString } = require("./topics");
const { validateManifest } = require("./manifest");

const SOCIAL_STATE_VERSION = 1;

const PREPARATION_STATUS = Object.freeze({
  PREPARING: "PREPARING",
  PREPARED: "PREPARED",
  FAILED: "FAILED"
});

const PUBLICATION_STATUS = Object.freeze({
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  RECONCILIATION_REQUIRED: "RECONCILIATION_REQUIRED"
});

const SUPPORTED_PLATFORMS = Object.freeze(["facebook", "instagram"]);

const RELEASE_LEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Checks if a value is a plain object.
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Validates a platform name against supported social platforms.
 * @param {string} platform
 */
function validatePlatform(platform) {
  if (typeof platform !== "string" || !SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `Unsupported publication platform: '${platform}'. Must be one of: ${SUPPORTED_PLATFORMS.join(", ")}`
    );
  }
}

/**
 * Resolves Redis client (injected instance or default).
 * @param {object} [injectedRedis]
 * @returns {object}
 */
function resolveRedis(injectedRedis) {
  if (injectedRedis) return injectedRedis;
  const client = getRedisClient();
  if (!client) {
    throw new Error("Redis client is unavailable");
  }
  return client;
}

/**
 * Builds deterministic Redis key for a manifest.
 * @param {string} publishDate
 * @returns {string}
 */
function buildManifestKey(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for manifest key: '${publishDate}'`);
  }
  return `social:manifest:${publishDate}`;
}

/**
 * Builds deterministic Redis key for preparation state.
 * @param {string} publishDate
 * @returns {string}
 */
function buildPrepareStateKey(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for preparation state key: '${publishDate}'`);
  }
  return `social:prepare:${publishDate}`;
}

/**
 * Builds deterministic Redis key for preparation lease.
 * @param {string} publishDate
 * @returns {string}
 */
function buildPrepareLeaseKey(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for preparation lease key: '${publishDate}'`);
  }
  return `social:lease:prepare:${publishDate}`;
}

/**
 * Builds deterministic Redis key for publication state.
 * @param {string} publishDate
 * @param {string} platform
 * @returns {string}
 */
function buildPublishStateKey(publishDate, platform) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for publication state key: '${publishDate}'`);
  }
  validatePlatform(platform);
  return `social:publish:${publishDate}:${platform}`;
}

/**
 * Builds deterministic Redis key for publication lease.
 * @param {string} publishDate
 * @param {string} platform
 * @returns {string}
 */
function buildPublishLeaseKey(publishDate, platform) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate for publication lease key: '${publishDate}'`);
  }
  validatePlatform(platform);
  return `social:lease:publish:${publishDate}:${platform}`;
}

/**
 * Safely releases a lease key using compare-and-delete Lua script.
 * @param {object} redis
 * @param {string} leaseKey
 * @param {string} leaseId
 * @returns {Promise<number>}
 */
async function safeReleaseLease(redis, leaseKey, leaseId) {
  return await redis.eval(RELEASE_LEASE_LUA, 1, leaseKey, leaseId);
}

/**
 * Saves a publication manifest to Redis with idempotent conflict checking.
 * @param {object} params
 * @param {object} [params.redis] Injected Redis client
 * @param {object} params.manifest Valid publication manifest
 * @returns {Promise<{ status: "CREATED" | "EXISTS_IDENTICAL" }>}
 */
async function saveManifest({ redis, manifest } = {}) {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Cannot save manifest: validation failed: ${validation.errors.join("; ")}`
    );
  }

  const r = resolveRedis(redis);
  const key = buildManifestKey(manifest.publishDate);
  const serialized = JSON.stringify(manifest);

  const setRes = await r.set(key, serialized, "NX");
  if (setRes === "OK" || setRes === 1) {
    return { status: "CREATED" };
  }

  const existingRaw = await r.get(key);
  if (!existingRaw) {
    throw new Error(`Manifest write collision for date '${manifest.publishDate}'`);
  }

  let existing;
  try {
    existing = JSON.parse(existingRaw);
  } catch (err) {
    throw new Error(`Corrupt existing manifest in Redis for date '${manifest.publishDate}'`);
  }

  const existingValidation = validateManifest(existing);
  if (!existingValidation.valid) {
    throw new Error(
      `Corrupt existing manifest in Redis for date '${manifest.publishDate}': ${existingValidation.errors.join("; ")}`
    );
  }

  if (JSON.stringify(manifest) === JSON.stringify(existing)) {
    return { status: "EXISTS_IDENTICAL" };
  }

  throw new Error(
    `Manifest conflict for date '${manifest.publishDate}': a different valid manifest is already stored`
  );
}

/**
 * Retrieves a validated publication manifest from Redis.
 * @param {object} params
 * @param {object} [params.redis] Injected Redis client
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
async function getManifest({ redis, publishDate } = {}) {
  const r = resolveRedis(redis);
  const key = buildManifestKey(publishDate);
  const raw = await r.get(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Corrupt stored manifest JSON for date '${publishDate}': ${err.message}`);
  }

  const validation = validateManifest(parsed);
  if (!validation.valid) {
    throw new Error(
      `Invalid stored manifest in Redis for date '${publishDate}': ${validation.errors.join("; ")}`
    );
  }

  return parsed;
}

/**
 * Retrieves preparation state for a given publishDate.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @returns {Promise<object|null>}
 */
async function getPreparationState({ redis, publishDate } = {}) {
  const r = resolveRedis(redis);
  const key = buildPrepareStateKey(publishDate);
  const raw = await r.get(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Corrupt stored preparation state JSON for date '${publishDate}': ${err.message}`);
  }

  if (
    !isPlainObject(parsed) ||
    parsed.stateVersion !== SOCIAL_STATE_VERSION ||
    parsed.publishDate !== publishDate ||
    parsed.contentId !== `social-${publishDate}` ||
    !Object.values(PREPARATION_STATUS).includes(parsed.status)
  ) {
    throw new Error(`Invalid stored preparation state for date '${publishDate}'`);
  }

  return parsed;
}

/**
 * Atomically claims preparation lease for a given date.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.leaseId
 * @param {number} [params.leaseTtlSeconds=900]
 * @returns {Promise<{ acquired: boolean, reason?: string }>}
 */
async function claimPreparation({
  redis,
  publishDate,
  contentId,
  leaseId,
  leaseTtlSeconds = 900
} = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }

  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }

  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds < 10 || leaseTtlSeconds > 86400) {
    throw new Error(`Invalid leaseTtlSeconds: must be integer between 10 and 86400`);
  }

  const r = resolveRedis(redis);

  // 1. Read existing state
  const existing = await getPreparationState({ redis: r, publishDate });
  if (existing && existing.status === PREPARATION_STATUS.PREPARED) {
    return { acquired: false, reason: "ALREADY_PREPARED" };
  }

  // 2. Acquire lease atomically
  const leaseKey = buildPrepareLeaseKey(publishDate);
  const setRes = await r.set(leaseKey, leaseId, "NX", "EX", leaseTtlSeconds);
  if (setRes !== "OK" && setRes !== 1) {
    return { acquired: false, reason: "LEASE_HELD" };
  }

  // 3. Re-check state after lease acquisition
  const stateAfter = await getPreparationState({ redis: r, publishDate });
  if (stateAfter && stateAfter.status === PREPARATION_STATUS.PREPARED) {
    await safeReleaseLease(r, leaseKey, leaseId);
    return { acquired: false, reason: "ALREADY_PREPARED" };
  }

  // 4. Record PREPARING state
  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    status: PREPARATION_STATUS.PREPARING
  };

  await r.set(buildPrepareStateKey(publishDate), JSON.stringify(stateObj));
  return { acquired: true };
}

/**
 * Marks preparation as complete (PREPARED) and releases caller's lease.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.leaseId
 * @returns {Promise<object>}
 */
async function completePreparation({ redis, publishDate, contentId, leaseId } = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }
  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  const r = resolveRedis(redis);
  const leaseKey = buildPrepareLeaseKey(publishDate);
  const currentLease = await r.get(leaseKey);

  if (currentLease !== leaseId) {
    throw new Error(`Cannot complete preparation: caller does not own active lease for date '${publishDate}'`);
  }

  const state = await getPreparationState({ redis: r, publishDate });
  if (!state || state.status !== PREPARATION_STATUS.PREPARING || state.contentId !== contentId) {
    throw new Error(
      `Cannot complete preparation: current state must be PREPARING with matching contentId, found '${state?.status}'`
    );
  }

  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    status: PREPARATION_STATUS.PREPARED
  };

  await r.set(buildPrepareStateKey(publishDate), JSON.stringify(stateObj));
  await safeReleaseLease(r, leaseKey, leaseId);

  return stateObj;
}

/**
 * Marks preparation as FAILED and releases caller's lease.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.leaseId
 * @returns {Promise<object>}
 */
async function failPreparation({ redis, publishDate, contentId, leaseId } = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }
  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  const r = resolveRedis(redis);
  const leaseKey = buildPrepareLeaseKey(publishDate);
  const currentLease = await r.get(leaseKey);

  if (currentLease !== leaseId) {
    throw new Error(`Cannot fail preparation: caller does not own active lease for date '${publishDate}'`);
  }

  const state = await getPreparationState({ redis: r, publishDate });
  if (!state || state.status !== PREPARATION_STATUS.PREPARING || state.contentId !== contentId) {
    throw new Error(
      `Cannot fail preparation: current state must be PREPARING with matching contentId, found '${state?.status}'`
    );
  }

  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    status: PREPARATION_STATUS.FAILED
  };

  await r.set(buildPrepareStateKey(publishDate), JSON.stringify(stateObj));
  await safeReleaseLease(r, leaseKey, leaseId);

  return stateObj;
}

/**
 * Retrieves publication state for a given date and platform.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.platform
 * @returns {Promise<object|null>}
 */
async function getPublicationState({ redis, publishDate, platform } = {}) {
  const r = resolveRedis(redis);
  const key = buildPublishStateKey(publishDate, platform);
  const raw = await r.get(key);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Corrupt stored publication state JSON for date '${publishDate}', platform '${platform}': ${err.message}`
    );
  }

  if (
    !isPlainObject(parsed) ||
    parsed.stateVersion !== SOCIAL_STATE_VERSION ||
    parsed.publishDate !== publishDate ||
    parsed.contentId !== `social-${publishDate}` ||
    parsed.platform !== platform ||
    !Object.values(PUBLICATION_STATUS).includes(parsed.status)
  ) {
    throw new Error(`Invalid stored publication state for date '${publishDate}', platform '${platform}'`);
  }

  return parsed;
}

/**
 * Atomically claims publication lease for a given date and platform.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.platform
 * @param {string} params.leaseId
 * @param {number} [params.leaseTtlSeconds=900]
 * @returns {Promise<{ acquired: boolean, reason?: string }>}
 */
async function claimPublication({
  redis,
  publishDate,
  contentId,
  platform,
  leaseId,
  leaseTtlSeconds = 900
} = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }
  validatePlatform(platform);

  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds < 10 || leaseTtlSeconds > 86400) {
    throw new Error(`Invalid leaseTtlSeconds: must be integer between 10 and 86400`);
  }

  const r = resolveRedis(redis);

  // 1. Check existing publication status
  const existing = await getPublicationState({ redis: r, publishDate, platform });
  if (existing) {
    if (existing.status === PUBLICATION_STATUS.PUBLISHED) {
      return { acquired: false, reason: "ALREADY_PUBLISHED" };
    }
    if (existing.status === PUBLICATION_STATUS.RECONCILIATION_REQUIRED) {
      return { acquired: false, reason: "RECONCILIATION_REQUIRED" };
    }
  }

  // 2. Acquire lease atomically
  const leaseKey = buildPublishLeaseKey(publishDate, platform);
  const setRes = await r.set(leaseKey, leaseId, "NX", "EX", leaseTtlSeconds);
  if (setRes !== "OK" && setRes !== 1) {
    return { acquired: false, reason: "LEASE_HELD" };
  }

  // 3. Re-read publication state after lease acquisition
  const stateAfter = await getPublicationState({ redis: r, publishDate, platform });
  if (stateAfter) {
    if (stateAfter.status === PUBLICATION_STATUS.PUBLISHED) {
      await safeReleaseLease(r, leaseKey, leaseId);
      return { acquired: false, reason: "ALREADY_PUBLISHED" };
    }
    if (stateAfter.status === PUBLICATION_STATUS.RECONCILIATION_REQUIRED) {
      await safeReleaseLease(r, leaseKey, leaseId);
      return { acquired: false, reason: "RECONCILIATION_REQUIRED" };
    }
  }

  // 4. Record PUBLISHING state
  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    platform,
    status: PUBLICATION_STATUS.PUBLISHING
  };

  await r.set(buildPublishStateKey(publishDate, platform), JSON.stringify(stateObj));
  return { acquired: true };
}

/**
 * Marks publication as PUBLISHED and releases caller's lease.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.platform
 * @param {string} params.leaseId
 * @returns {Promise<object>}
 */
async function markPublicationPublished({
  redis,
  publishDate,
  contentId,
  platform,
  leaseId
} = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }
  validatePlatform(platform);

  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  const r = resolveRedis(redis);
  const leaseKey = buildPublishLeaseKey(publishDate, platform);
  const currentLease = await r.get(leaseKey);

  if (currentLease !== leaseId) {
    throw new Error(
      `Cannot mark publication published: caller does not own active lease for date '${publishDate}', platform '${platform}'`
    );
  }

  const state = await getPublicationState({ redis: r, publishDate, platform });
  if (
    !state ||
    state.status !== PUBLICATION_STATUS.PUBLISHING ||
    state.contentId !== contentId ||
    state.platform !== platform
  ) {
    throw new Error(
      `Cannot mark published: current state must be PUBLISHING with matching contentId and platform, found '${state?.status}'`
    );
  }

  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    platform,
    status: PUBLICATION_STATUS.PUBLISHED
  };

  await r.set(buildPublishStateKey(publishDate, platform), JSON.stringify(stateObj));
  await safeReleaseLease(r, leaseKey, leaseId);

  return stateObj;
}

/**
 * Marks publication as FAILED and releases caller's lease.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.platform
 * @param {string} params.leaseId
 * @returns {Promise<object>}
 */
async function markPublicationFailed({
  redis,
  publishDate,
  contentId,
  platform,
  leaseId
} = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }
  validatePlatform(platform);

  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  const r = resolveRedis(redis);
  const leaseKey = buildPublishLeaseKey(publishDate, platform);
  const currentLease = await r.get(leaseKey);

  if (currentLease !== leaseId) {
    throw new Error(
      `Cannot mark publication failed: caller does not own active lease for date '${publishDate}', platform '${platform}'`
    );
  }

  const state = await getPublicationState({ redis: r, publishDate, platform });
  if (
    !state ||
    state.status !== PUBLICATION_STATUS.PUBLISHING ||
    state.contentId !== contentId ||
    state.platform !== platform
  ) {
    throw new Error(
      `Cannot mark failed: current state must be PUBLISHING with matching contentId and platform, found '${state?.status}'`
    );
  }

  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    platform,
    status: PUBLICATION_STATUS.FAILED
  };

  await r.set(buildPublishStateKey(publishDate, platform), JSON.stringify(stateObj));
  await safeReleaseLease(r, leaseKey, leaseId);

  return stateObj;
}

/**
 * Marks publication as RECONCILIATION_REQUIRED and releases caller's lease.
 * @param {object} params
 * @param {object} [params.redis]
 * @param {string} params.publishDate
 * @param {string} params.contentId
 * @param {string} params.platform
 * @param {string} params.leaseId
 * @returns {Promise<object>}
 */
async function markPublicationReconciliationRequired({
  redis,
  publishDate,
  contentId,
  platform,
  leaseId
} = {}) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: '${publishDate}'`);
  }
  if (contentId !== `social-${publishDate}`) {
    throw new Error(`Invalid contentId: expected 'social-${publishDate}', received '${contentId}'`);
  }
  validatePlatform(platform);

  if (typeof leaseId !== "string" || leaseId.trim().length === 0) {
    throw new Error("Invalid leaseId: must be a non-empty string");
  }

  const r = resolveRedis(redis);
  const leaseKey = buildPublishLeaseKey(publishDate, platform);
  const currentLease = await r.get(leaseKey);

  if (currentLease !== leaseId) {
    throw new Error(
      `Cannot mark publication reconciliation required: caller does not own active lease for date '${publishDate}', platform '${platform}'`
    );
  }

  const state = await getPublicationState({ redis: r, publishDate, platform });
  if (
    !state ||
    state.status !== PUBLICATION_STATUS.PUBLISHING ||
    state.contentId !== contentId ||
    state.platform !== platform
  ) {
    throw new Error(
      `Cannot mark reconciliation required: current state must be PUBLISHING with matching contentId and platform, found '${state?.status}'`
    );
  }

  const stateObj = {
    stateVersion: SOCIAL_STATE_VERSION,
    publishDate,
    contentId,
    platform,
    status: PUBLICATION_STATUS.RECONCILIATION_REQUIRED
  };

  await r.set(buildPublishStateKey(publishDate, platform), JSON.stringify(stateObj));
  await safeReleaseLease(r, leaseKey, leaseId);

  return stateObj;
}

module.exports = {
  SOCIAL_STATE_VERSION,
  PREPARATION_STATUS,
  PUBLICATION_STATUS,
  SUPPORTED_PLATFORMS,
  buildManifestKey,
  buildPrepareStateKey,
  buildPrepareLeaseKey,
  buildPublishStateKey,
  buildPublishLeaseKey,
  safeReleaseLease,
  saveManifest,
  getManifest,
  getPreparationState,
  claimPreparation,
  completePreparation,
  failPreparation,
  getPublicationState,
  claimPublication,
  markPublicationPublished,
  markPublicationFailed,
  markPublicationReconciliationRequired
};
