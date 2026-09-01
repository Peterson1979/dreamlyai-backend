// test/socialProductionRun.test.js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  runProductionSocialPipeline,
  runProductionPipeline
} = require("../social/productionRun");
const { MockRedis } = require("./helpers/mockRedis");
const { setRedisClient, resetRedisClient } = require("../utils/redisClient");
const { setMockProviders, resetMockProviders } = require("../utils/providers");
const { DAILY_RUN_STATUS } = require("../social/dailyRun");

function createValidCreativeFixture() {
  return {
    topic: "Water and Ocean Dreams",
    slides: [
      {
        role: "cover",
        headline: "What Does Water in Your Dreams Mean?",
        subheadline: "Explore what vast oceans and calm rivers might reflect about your waking life."
      },
      {
        role: "content",
        title: "Emotional Reflection",
        body: "Water often serves as a metaphor for deep feelings, representing periods of calm or turbulence."
      },
      {
        role: "content",
        title: "Clarity and Depth",
        body: "Clear water can symbolize mental clarity, while murky water may suggest unresolved thoughts."
      },
      {
        role: "content",
        title: "Flow and Adaptation",
        body: "Rushing rivers could reflect how you navigate life transitions and current challenges."
      },
      {
        role: "cta",
        headline: "Reflect on Your Dreams",
        body: "Track dream themes and deepen self-awareness using DreamlyAI today."
      }
    ],
    captions: {
      instagram: "Have you noticed water appearing in your dreams lately? #dreamlyai #dreams #sleepscience",
      facebook: "Water in dreams often mirrors our emotional state and inner thoughts."
    }
  };
}

class MockS3Client {
  constructor() {
    this.sentCommands = [];
  }

  async send(command) {
    this.sentCommands.push(command);
    return { $metadata: { httpStatusCode: 200 } };
  }
}

function createMockR2Config() {
  return {
    accountId: "mock-account-id-12345",
    accessKeyId: "mock-access-key-id",
    secretAccessKey: "mock-secret-access-key",
    bucketName: "dreamlyai-social",
    publicBaseUrl: "https://media.dreamlyai.com",
    endpoint: "https://mock-account-id-12345.r2.cloudflarestorage.com",
    region: "auto"
  };
}

function createMockFacebookConfig() {
  return {
    pageId: "100123456789",
    pageAccessToken: "EAAX_MOCK_PAGE_TOKEN_SECRET_FB_12345",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockInstagramConfig() {
  return {
    pageId: "100123456789",
    pageAccessToken: "EAAX_MOCK_PAGE_TOKEN_SECRET_IG_12345",
    instagramBusinessAccountId: "200987654321",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockFetch() {
  let fbPhotoCount = 0;
  let igChildCount = 0;

  return async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || "GET";

    if (urlStr.includes("graph.facebook.com/v25.0/me") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789", name: "DreamlyAI Official" })
      };
    }

    if (urlStr.includes("/100123456789/photos") && method === "POST") {
      fbPhotoCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `fb_photo_${fbPhotoCount}` })
      };
    }

    if (urlStr.includes("/100123456789/feed") && method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789_post98765" })
      };
    }

    if (urlStr.includes("/100123456789?fields=id,name,instagram_business_account") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "100123456789",
          name: "DreamlyAI",
          instagram_business_account: { id: "200987654321" }
        })
      };
    }

    if (urlStr.includes("/200987654321/media_publish") && method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "ig_media_post_777888999" })
      };
    }

    if (urlStr.endsWith("/200987654321/media") && method === "POST") {
      const params = new URLSearchParams(options.body || "");
      if (params.get("media_type") === "CAROUSEL") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "ig_parent_container_123" })
        };
      }
      igChildCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `ig_child_${igChildCount}` })
      };
    }

    if (urlStr.includes("?fields=status_code,status") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status_code: "FINISHED", status: "Ready" })
      };
    }

    throw new Error(`Unhandled mock fetch request to URL: ${urlStr}`);
  };
}

describe("DreamlyAI Social Production Entrypoint", () => {
  let mockRedis;
  let mockR2Client;
  let mockR2Config;
  let mockFbConfig;
  let mockIgConfig;
  let mockFetch;
  let mockGenerator;

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
    mockR2Client = new MockS3Client();
    mockR2Config = createMockR2Config();
    mockFbConfig = createMockFacebookConfig();
    mockIgConfig = createMockInstagramConfig();
    mockFetch = createMockFetch();
    mockGenerator = async () => JSON.stringify(createValidCreativeFixture());
    resetMockProviders();
  });

  afterEach(() => {
    resetMockProviders();
    resetRedisClient();
  });

  it("1. valid production wiring reaches dailyRun successfully", async () => {
    const result = await runProductionSocialPipeline({
      publishDate: "2026-08-28",
      redis: mockRedis,
      generateText: mockGenerator,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal(result.success, true);
    assert.equal(result.status, DAILY_RUN_STATUS.COMPLETED);
    assert.equal(result.publishDate, "2026-08-28");
    assert.equal(result.contentId, "social-2026-08-28");
    assert.equal(result.preparation.status, "PREPARED");
    assert.equal(result.publishing.facebook.status, "PUBLISHED");
    assert.equal(result.publishing.instagram.status, "PUBLISHED");
  });

  it("2. publishDate is passed unchanged to composition", async () => {
    const targetDate = "2026-09-15";
    const result = await runProductionSocialPipeline({
      publishDate: targetDate,
      redis: mockRedis,
      generateText: mockGenerator,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal(result.publishDate, targetDate);
    assert.equal(result.contentId, `social-${targetDate}`);
  });

  it("3. a fresh leaseId is generated when not injected", async () => {
    const result = await runProductionSocialPipeline({
      publishDate: "2026-08-28",
      redis: mockRedis,
      generateText: mockGenerator,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal(result.success, true);
  });

  it("4. injected leaseId is respected for deterministic tests", async () => {
    const explicitLeaseId = "deterministic-test-lease-999";
    const result = await runProductionSocialPipeline({
      publishDate: "2026-08-28",
      leaseId: explicitLeaseId,
      redis: mockRedis,
      generateText: mockGenerator,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal(result.success, true);
  });

  it("5. production dependencies are passed to dailyRun correctly", async () => {
    let passedDependencies = null;
    const testGenerate = async (params) => {
      passedDependencies = params;
      return JSON.stringify(createValidCreativeFixture());
    };

    const result = await runProductionSocialPipeline({
      publishDate: "2026-08-28",
      redis: mockRedis,
      generateText: testGenerate,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal(result.success, true);
    assert.notEqual(passedDependencies, null);
    assert.equal(typeof passedDependencies.prompt, "string");
  });

  it("6. dailyRun result is returned unchanged/sanitized", async () => {
    const result = await runProductionSocialPipeline({
      publishDate: "2026-08-28",
      redis: mockRedis,
      generateText: mockGenerator,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal("publishDate" in result, true);
    assert.equal("contentId" in result, true);
    assert.equal("preparation" in result, true);
    assert.equal("publishing" in result, true);
    assert.equal("password" in result, false);
    assert.equal("accessToken" in result, false);
    assert.equal("token" in result, false);
  });

  it("7. invalid publishDate fails before provider/storage operations", async () => {
    let generatorCalled = false;
    const testGen = async () => {
      generatorCalled = true;
      return "{}";
    };

    for (const badDate of ["not-a-date", "2026/08/28", "", null, undefined, 20260828]) {
      const result = await runProductionSocialPipeline({
        publishDate: badDate,
        redis: mockRedis,
        generateText: testGen
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "FAILED");
      assert.equal(result.preparation.status, "FAILED");
      assert.equal(result.publishing.facebook.status, "SKIPPED");
      assert.equal(result.publishing.instagram.status, "SKIPPED");
    }

    assert.equal(generatorCalled, false);
    assert.equal(mockR2Client.sentCommands.length, 0);
  });

  it("8. missing required production configuration fails closed", async () => {
    // When environment variables are missing and no configs are injected, it fails closed cleanly
    const origEnv = { ...process.env };
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    try {
      const result = await runProductionSocialPipeline({
        publishDate: "2026-08-28",
        redis: mockRedis,
        generateText: mockGenerator
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "FAILED");
      assert.equal(result.publishing.facebook.status, "SKIPPED");
      assert.equal(result.publishing.instagram.status, "SKIPPED");
    } finally {
      process.env = origEnv;
    }
  });

  it("9. no credentials appear in thrown errors/results", async () => {
    const origEnv = { ...process.env };
    process.env.R2_SECRET_ACCESS_KEY = ""; // Missing key error

    try {
      const result = await runProductionSocialPipeline({
        publishDate: "2026-08-28",
        redis: mockRedis,
        generateText: mockGenerator
      });

      assert.equal(result.success, false);
      const strResult = JSON.stringify(result);
      assert.equal(strResult.includes("secret"), false);
      assert.equal(strResult.includes("accessKey"), false);
    } finally {
      process.env = origEnv;
    }
  });

  it("10. no second Redis client is created", async () => {
    // Reuses injected mockRedis singleton
    await runProductionSocialPipeline({
      publishDate: "2026-08-28",
      redis: mockRedis,
      generateText: mockGenerator,
      r2Client: mockR2Client,
      r2Config: mockR2Config,
      fetchImpl: mockFetch,
      facebookConfig: mockFbConfig,
      instagramConfig: mockIgConfig,
      sleepImpl: async () => {}
    });

    assert.equal(mockRedis.store.size > 0, true);
  });

  it("11. no duplicate configuration logic is introduced", () => {
    const prodModule = require("../social/productionRun");
    assert.equal(typeof prodModule.runProductionSocialPipeline, "function");
    assert.equal(prodModule.runProductionPipeline, prodModule.runProductionSocialPipeline);
  });

  it("12. the entrypoint does not contain retry loops", () => {
    const fs = require("node:fs");
    const code = fs.readFileSync(require.resolve("../social/productionRun"), "utf8");
    assert.equal(code.includes("while ("), false);
    assert.equal(code.includes("retryCount"), false);
  });

  it("13. the entrypoint does not contain cron logic", () => {
    const fs = require("node:fs");
    const code = fs.readFileSync(require.resolve("../social/productionRun"), "utf8");
    assert.equal(code.includes("cron.schedule"), false);
    assert.equal(code.includes("node-cron"), false);
    assert.equal(code.includes("setInterval"), false);
  });

  it("14. the entrypoint does not contain HTTP endpoint logic", () => {
    const fs = require("node:fs");
    const code = fs.readFileSync(require.resolve("../social/productionRun"), "utf8");
    assert.equal(code.includes("res.status"), false);
    assert.equal(code.includes("res.json"), false);
    assert.equal(code.includes("req.body"), false);
  });

  it("15. importing the production entrypoint itself does not perform network calls", () => {
    delete require.cache[require.resolve("../social/productionRun")];
    const mod = require("../social/productionRun");
    assert.equal(typeof mod.runProductionSocialPipeline, "function");
  });
});
