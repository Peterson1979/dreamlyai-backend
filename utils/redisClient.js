// utils/redisClient.js
const Redis = require("ioredis");

let customClient = null;

function getRedisClient() {
  if (customClient) {
    return customClient;
  }

  if (global.redisClient) {
    return global.redisClient;
  }

  if (process.env.UPSTASH_REDIS_URL) {
    const client = new Redis(process.env.UPSTASH_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      tls: {},
    });

    client.on("error", (err) => {
      console.error("Redis connection error:", err?.message || err);
    });

    global.redisClient = client;
    return client;
  }

  return null;
}

function setRedisClient(mockClient) {
  customClient = mockClient;
}

function resetRedisClient() {
  customClient = null;
}

module.exports = {
  getRedisClient,
  setRedisClient,
  resetRedisClient,
};
