// utils/rateLimiter.js
const crypto = require("crypto");
const config = require("./config");
const { getRedisClient } = require("./redisClient");

function getClientIp(req) {
  if (!req) return "unknown_ip";
  const forwarded = req.headers ? req.headers["x-forwarded-for"] : null;
  if (forwarded) {
    // Return first IP if comma separated list
    return forwarded.split(",")[0].trim();
  }
  return req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown_ip";
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 16);
}

const CHECK_RATE_LIMIT_LUA = `
local ipKey = KEYS[1]
local globalKey = KEYS[2]
local maxIp = tonumber(ARGV[1])
local maxGlobal = tonumber(ARGV[2])

local globalReq = tonumber(redis.call("get", globalKey)) or 0
if globalReq >= maxGlobal then
  return {"ERR", "GLOBAL_RATE_LIMIT_EXCEEDED"}
end

local ipReq = tonumber(redis.call("get", ipKey)) or 0
if ipReq >= maxIp then
  return {"ERR", "IP_RATE_LIMIT_EXCEEDED"}
end

redis.call("incr", ipKey)
redis.call("expire", ipKey, 60)

redis.call("incr", globalKey)
redis.call("expire", globalKey, 60)

return {"OK", "ALLOWED"}
`;

/**
 * Checks per-IP and global rate limits atomically.
 * @param {string} clientIp
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
async function checkRateLimit(clientIp) {
  const redis = getRedisClient();
  if (!redis) {
    // Fail closed if Redis is down
    return { allowed: false, reason: "REDIS_UNAVAILABLE" };
  }

  const minute = Math.floor(Date.now() / 60000);
  const ipHash = hashIp(clientIp);

  const ipKey = `rate:ip:${ipHash}:${minute}`;
  const globalKey = `rate:global:${minute}`;

  try {
    const res = await redis.eval(
      CHECK_RATE_LIMIT_LUA,
      2,
      ipKey,
      globalKey,
      config.AI_PER_IP_RPM_LIMIT,
      config.AI_GLOBAL_RPM_LIMIT
    );

    if (res && res[0] === "OK") {
      return { allowed: true };
    }
    return { allowed: false, reason: res ? res[1] : "RATE_LIMIT_REJECTED" };
  } catch (err) {
    console.error("Rate limiter error:", err?.message || err);
    return { allowed: false, reason: "RATE_LIMIT_ERROR" };
  }
}

module.exports = {
  getClientIp,
  hashIp,
  checkRateLimit,
};
