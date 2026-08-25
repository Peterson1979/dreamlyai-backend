// utils/budget.js
const config = require("./config");
const { getRedisClient } = require("./redisClient");

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMinute() {
  return Math.floor(Date.now() / 60000);
}

const RESERVE_TOKENS_LUA = `
local provider = ARGV[1]
local reserve = tonumber(ARGV[2])
local maxProvider = tonumber(ARGV[3])
local maxTotal = tonumber(ARGV[4])
local maxRpm = tonumber(ARGV[5])
local maxRpd = tonumber(ARGV[6])
local maxTpm = tonumber(ARGV[7])

local groqDailyKey = KEYS[1]
local geminiDailyKey = KEYS[2]
local totalDailyKey = KEYS[3]
local groqRpmKey = KEYS[4]
local groqRpdKey = KEYS[5]
local groqTpmKey = KEYS[6]

if provider == "groq" then
  local rpm = tonumber(redis.call("get", groqRpmKey)) or 0
  if rpm >= maxRpm then
    return {"ERR", "GROQ_RPM_EXCEEDED"}
  end

  local rpd = tonumber(redis.call("get", groqRpdKey)) or 0
  if rpd >= maxRpd then
    return {"ERR", "GROQ_RPD_EXCEEDED"}
  end

  local tpm = tonumber(redis.call("get", groqTpmKey)) or 0
  if tpm + reserve > maxTpm then
    return {"ERR", "GROQ_TPM_EXCEEDED"}
  end

  local groqDaily = tonumber(redis.call("get", groqDailyKey)) or 0
  if groqDaily + reserve > maxProvider then
    return {"ERR", "GROQ_DAILY_BUDGET_EXCEEDED"}
  end

  local totalDaily = tonumber(redis.call("get", totalDailyKey)) or 0
  if totalDaily + reserve > maxTotal then
    return {"ERR", "TOTAL_DAILY_BUDGET_EXCEEDED"}
  end

  redis.call("incrby", groqDailyKey, reserve)
  redis.call("expire", groqDailyKey, 86400)

  redis.call("incrby", totalDailyKey, reserve)
  redis.call("expire", totalDailyKey, 86400)

  redis.call("incr", groqRpmKey)
  redis.call("expire", groqRpmKey, 60)

  redis.call("incr", groqRpdKey)
  redis.call("expire", groqRpdKey, 86400)

  redis.call("incrby", groqTpmKey, reserve)
  redis.call("expire", groqTpmKey, 60)

  return {"OK", "RESERVED"}

elseif provider == "gemini" then
  local geminiDaily = tonumber(redis.call("get", geminiDailyKey)) or 0
  if geminiDaily + reserve > maxProvider then
    return {"ERR", "GEMINI_DAILY_BUDGET_EXCEEDED"}
  end

  local totalDaily = tonumber(redis.call("get", totalDailyKey)) or 0
  if totalDaily + reserve > maxTotal then
    return {"ERR", "TOTAL_DAILY_BUDGET_EXCEEDED"}
  end

  redis.call("incrby", geminiDailyKey, reserve)
  redis.call("expire", geminiDailyKey, 86400)

  redis.call("incrby", totalDailyKey, reserve)
  redis.call("expire", totalDailyKey, 86400)

  return {"OK", "RESERVED"}
else
  return {"ERR", "INVALID_PROVIDER"}
end
`;

const RECONCILE_TOKENS_LUA = `
local provider = ARGV[1]
local delta = tonumber(ARGV[2])
local providerDailyKey = KEYS[1]
local totalDailyKey = KEYS[2]
local groqTpmKey = KEYS[3]

local curProv = tonumber(redis.call("get", providerDailyKey)) or 0
local newProv = math.max(0, curProv + delta)
redis.call("set", providerDailyKey, newProv, "KEEPTTL")

local curTotal = tonumber(redis.call("get", totalDailyKey)) or 0
local newTotal = math.max(0, curTotal + delta)
redis.call("set", totalDailyKey, newTotal, "KEEPTTL")

if provider == "groq" and groqTpmKey ~= "" then
  local curTpm = tonumber(redis.call("get", groqTpmKey)) or 0
  local newTpm = math.max(0, curTpm + delta)
  redis.call("set", groqTpmKey, newTpm, "KEEPTTL")
end

return {"OK", "RECONCILED"}
`;

/**
 * Atomically reserves tokens for a given provider.
 * @param {'groq' | 'gemini'} provider
 * @param {number} reserveTokens
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
async function reserveTokens(provider, reserveTokens = config.DEFAULT_RESERVE_TOKENS) {
  const redis = getRedisClient();
  if (!redis) {
    // Fail closed if Redis is unavailable
    return { allowed: false, reason: "REDIS_UNAVAILABLE" };
  }

  const today = getTodayDate();
  const minute = getCurrentMinute();

  const keys = [
    `budget:groq:tokens:${today}`,
    `budget:gemini:tokens:${today}`,
    `budget:total:tokens:${today}`,
    `guard:groq:rpm:${minute}`,
    `guard:groq:rpd:${today}`,
    `guard:groq:tpm:${minute}`,
  ];

  const maxProvider =
    provider === "groq" ? config.GROQ_DAILY_TOKEN_LIMIT : config.GEMINI_DAILY_TOKEN_LIMIT;
  const maxTotal = config.AI_TOTAL_DAILY_TOKEN_LIMIT;

  const args = [
    provider,
    reserveTokens,
    maxProvider,
    maxTotal,
    config.GROQ_RPM_LIMIT,
    config.GROQ_RPD_LIMIT,
    config.GROQ_TPM_LIMIT,
  ];

  try {
    const res = await redis.eval(RESERVE_TOKENS_LUA, keys.length, ...keys, ...args);
    if (res && res[0] === "OK") {
      return { allowed: true };
    }
    return { allowed: false, reason: res ? res[1] : "BUDGET_REJECTED" };
  } catch (err) {
    console.error("Token reservation error:", err?.message || err);
    return { allowed: false, reason: "RESERVATION_ERROR" };
  }
}

/**
 * Reconciles the reserved amount with the actual tokens reported by the provider.
 * If delta < 0, refunds unused tokens. If delta > 0, accounts for additional tokens.
 */
async function reconcileReservation(provider, reservedTokens, actualTokens) {
  const redis = getRedisClient();
  if (!redis) return;

  const delta = (actualTokens || 0) - reservedTokens;
  if (delta === 0) return;

  const today = getTodayDate();
  const minute = getCurrentMinute();

  const keys = [
    `budget:${provider}:tokens:${today}`,
    `budget:total:tokens:${today}`,
    provider === "groq" ? `guard:groq:tpm:${minute}` : "",
  ];

  try {
    await redis.eval(RECONCILE_TOKENS_LUA, keys.length, ...keys, provider, delta);
  } catch (err) {
    console.error("Token reconciliation error:", err?.message || err);
  }
}

/**
 * Full refund when a provider call was never dispatched.
 */
async function refundReservation(provider, reservedTokens) {
  await reconcileReservation(provider, reservedTokens, 0);
}

/**
 * Retrieves current daily budget and guard status for admin/monitoring.
 */
async function getBudgetStatus() {
  const redis = getRedisClient();
  const today = getTodayDate();
  const minute = getCurrentMinute();

  if (!redis) {
    return {
      status: "redis_unavailable",
      date: today,
      limits: {
        groqDaily: config.GROQ_DAILY_TOKEN_LIMIT,
        geminiDaily: config.GEMINI_DAILY_TOKEN_LIMIT,
        totalDaily: config.AI_TOTAL_DAILY_TOKEN_LIMIT,
      },
    };
  }

  const keys = [
    `budget:groq:tokens:${today}`,
    `budget:gemini:tokens:${today}`,
    `budget:total:tokens:${today}`,
    `guard:groq:rpm:${minute}`,
    `guard:groq:rpd:${today}`,
    `guard:groq:tpm:${minute}`,
  ];

  try {
    const values = await redis.mget(keys);
    const groqUsed = parseInt(values[0], 10) || 0;
    const geminiUsed = parseInt(values[1], 10) || 0;
    const totalUsed = parseInt(values[2], 10) || 0;
    const groqRpm = parseInt(values[3], 10) || 0;
    const groqRpd = parseInt(values[4], 10) || 0;
    const groqTpm = parseInt(values[5], 10) || 0;

    return {
      date: today,
      groq: {
        usedTokens: groqUsed,
        dailyLimit: config.GROQ_DAILY_TOKEN_LIMIT,
        remainingTokens: Math.max(0, config.GROQ_DAILY_TOKEN_LIMIT - groqUsed),
        currentRpm: groqRpm,
        rpmLimit: config.GROQ_RPM_LIMIT,
        currentRpd: groqRpd,
        rpdLimit: config.GROQ_RPD_LIMIT,
        currentTpm: groqTpm,
        tpmLimit: config.GROQ_TPM_LIMIT,
      },
      gemini: {
        usedTokens: geminiUsed,
        dailyLimit: config.GEMINI_DAILY_TOKEN_LIMIT,
        remainingTokens: Math.max(0, config.GEMINI_DAILY_TOKEN_LIMIT - geminiUsed),
      },
      total: {
        usedTokens: totalUsed,
        dailyLimit: config.AI_TOTAL_DAILY_TOKEN_LIMIT,
        remainingTokens: Math.max(0, config.AI_TOTAL_DAILY_TOKEN_LIMIT - totalUsed),
      },
    };
  } catch (err) {
    console.error("Get budget status error:", err?.message || err);
    return { status: "error", message: err?.message };
  }
}

module.exports = {
  getTodayDate,
  getCurrentMinute,
  reserveTokens,
  reconcileReservation,
  refundReservation,
  getBudgetStatus,
};
