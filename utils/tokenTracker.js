// utils/tokenTracker.js

const fs = require("fs");
const path = require("path");

const TOKEN_FILE = path.resolve(__dirname, "../token_usage.json");
const DAILY_TOKEN_LIMIT = 1_000_000;

function readTokenData() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return { date: getTodayDate(), usedTokens: 0 };
    }
    const data = fs.readFileSync(TOKEN_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to read token file:", e);
    return { date: getTodayDate(), usedTokens: 0 };
  }
}

function writeTokenData(data) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write token file:", e);
  }
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0]; // "2025-08-05"
}

function canUseTokens(count) {
  const data = readTokenData();
  const today = getTodayDate();

  if (data.date !== today) {
    data.date = today;
    data.usedTokens = 0;
  }

  const remaining = DAILY_TOKEN_LIMIT - data.usedTokens;

  if (count > remaining) {
    return false;
  }

  data.usedTokens += count;
  writeTokenData(data);
  return true;
}

function getTokenStatus() {
  const data = readTokenData();
  const today = getTodayDate();

  if (data.date !== today) {
    return { used: 0, remaining: DAILY_TOKEN_LIMIT };
  }

  return {
    used: data.usedTokens,
    remaining: Math.max(0, DAILY_TOKEN_LIMIT - data.usedTokens),
  };
}

module.exports = { canUseTokens, getTokenStatus };
