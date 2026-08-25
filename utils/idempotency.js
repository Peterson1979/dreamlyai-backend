// utils/idempotency.js
const crypto = require("crypto");
const config = require("./config");
const { getRedisClient } = require("./redisClient");

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

function computeRequestHash({ dreamNarrative, symbols, emotions, language }) {
  const normalized = [
    (dreamNarrative || "").trim().toLowerCase(),
    (symbols || "").trim().toLowerCase(),
    (emotions || "").trim().toLowerCase(),
    (language || "en").trim().toLowerCase(),
  ].join("|");

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Attempts to acquire an in-flight lock for duplicate request suppression with an owner token.
 * Returns { acquired: boolean, release: Function }
 */
async function acquireInFlightLock({ dreamNarrative, symbols, emotions, language }) {
  const redis = getRedisClient();
  if (!redis) {
    // If Redis is unavailable, allow request to proceed without locking
    return { acquired: true, release: async () => {} };
  }

  const hash = computeRequestHash({ dreamNarrative, symbols, emotions, language });
  const lockKey = `lock:req:${hash}`;
  const ownerToken = crypto.randomUUID();
  const ttl = config.DUPLICATE_LOCK_TTL_SECONDS;

  try {
    const res = await redis.set(lockKey, ownerToken, "EX", ttl, "NX");
    const acquired = res === "OK";

    const release = async () => {
      try {
        await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, ownerToken);
      } catch (e) {
        // Silently ignore unlock errors
      }
    };

    return { acquired, release, ownerToken, lockKey };
  } catch (err) {
    console.error("Idempotency lock error:", err?.message || err);
    return { acquired: true, release: async () => {} };
  }
}

module.exports = {
  computeRequestHash,
  acquireInFlightLock,
  RELEASE_LOCK_LUA,
};
