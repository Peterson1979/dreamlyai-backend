// test/socialDailyRun.test.js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  DAILY_RUN_STATUS,
  runDailySocialPipeline,
  runDailySocialRun,
  executeDailySocialRun
} = require("../social/dailyRun");
const { MockRedis } = require("./helpers/mockRedis");
const { setRedisClient, resetRedisClient } = require("../utils/redisClient");
const { setMockProviders, resetMockProviders } = require("../utils/providers");
const {
  getPreparationState,
  getPublicationState,
  getManifest,
  PREPARATION_STATUS,
  PUBLICATION_STATUS
} = require("../social/state");
const { getQualityGateState, QUALITY_STATUS } = require("../social/qualityGate");

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
    this.shouldFail = false;
  }

  async send(command) {
    if (this.shouldFail) {
      throw new Error("S3 simulated upload failure");
    }
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

function createMockFetch({
  facebookBehavior = "success",
  instagramBehavior = "success"
} = {}) {
  let fbPhotoCount = 0;
  let igChildCount = 0;

  return async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || "GET";

    // Facebook /me identity check
    if (urlStr.includes("graph.facebook.com/v25.0/me") && method === "GET") {
      if (facebookBehavior === "identity_error") {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "Invalid OAuth access token" } })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789", name: "DreamlyAI Official" })
      };
    }

    // Facebook photo uploads (/photos)
    if (urlStr.includes("/100123456789/photos") && method === "POST") {
      fbPhotoCount++;
      if (facebookBehavior === "photo_error" && fbPhotoCount === 2) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "Error uploading photo" } })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `fb_photo_${fbPhotoCount}` })
      };
    }

    // Facebook final feed post (/feed)
    if (urlStr.includes("/100123456789/feed") && method === "POST") {
      if (facebookBehavior === "feed_error") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: "Feed publication failed" } })
        };
      }
      if (facebookBehavior === "ambiguous_feed") {
        const netErr = new Error("ECONNRESET during Facebook final publish");
        netErr.code = "ECONNRESET";
        throw netErr;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789_post98765" })
      };
    }

    // Instagram identity check
    if (urlStr.includes("/100123456789?fields=id,name,instagram_business_account") && method === "GET") {
      if (instagramBehavior === "identity_error") {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "Invalid Instagram Page token" } })
        };
      }
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

    // Instagram final media_publish (Must precede /media endpoint check!)
    if (urlStr.includes("/200987654321/media_publish") && method === "POST") {
      if (instagramBehavior === "publish_error") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: "Instagram media publish failed" } })
        };
      }
      if (instagramBehavior === "ambiguous_publish") {
        const netErr = new Error("ETIMEDOUT during Instagram final media_publish");
        netErr.code = "ETIMEDOUT";
        throw netErr;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "ig_media_post_777888999" })
      };
    }

    // Instagram child items / carousel container creation (/media)
    if (urlStr.endsWith("/200987654321/media") && method === "POST") {
      const params = new URLSearchParams(options.body || "");
      if (params.get("media_type") === "CAROUSEL") {
        if (instagramBehavior === "parent_error") {
          return {
            ok: false,
            status: 400,
            json: async () => ({ error: { message: "Parent container creation failed" } })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "ig_parent_container_123" })
        };
      }

      // Single child item
      igChildCount++;
      if (instagramBehavior === "child_error" && igChildCount === 2) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "Child container creation failed" } })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `ig_child_${igChildCount}` })
      };
    }

    // Instagram container status polling
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

describe("DreamlyAI Daily Social Pipeline Runner", () => {
  let mockRedis;
  let mockR2Client;
  let mockR2Config;
  let mockFbConfig;
  let mockIgConfig;
  let aiCallCount;

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
    mockR2Client = new MockS3Client();
    mockR2Config = createMockR2Config();
    mockFbConfig = createMockFacebookConfig();
    mockIgConfig = createMockInstagramConfig();
    aiCallCount = 0;
    resetMockProviders();
  });

  afterEach(() => {
    resetMockProviders();
    resetRedisClient();
  });

  function createMockGenerator(fixture = createValidCreativeFixture()) {
    return async () => {
      aiCallCount++;
      return JSON.stringify(fixture);
    };
  }

  describe("End-to-End Pipeline Execution", () => {
    it("1. Normal run: preparation -> Facebook -> Instagram all succeed", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();
      const fetchImpl = createMockFetch();

      const result = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(result.success, true);
      assert.equal(result.status, DAILY_RUN_STATUS.COMPLETED);
      assert.equal(result.publishDate, publishDate);
      assert.equal(result.contentId, "social-2026-08-28");

      assert.equal(result.preparation.success, true);
      assert.equal(result.preparation.status, "PREPARED");

      assert.equal(result.publishing.facebook.success, true);
      assert.equal(result.publishing.facebook.status, "PUBLISHED");
      assert.equal(result.publishing.facebook.providerId, "100123456789_post98765");

      assert.equal(result.publishing.instagram.success, true);
      assert.equal(result.publishing.instagram.status, "PUBLISHED");
      assert.equal(result.publishing.instagram.providerId, "ig_media_post_777888999");

      assert.equal(aiCallCount, 1);
      assert.equal(mockR2Client.sentCommands.length, 5);

      // Verify durable Redis states
      const prepState = await getPreparationState({ redis: mockRedis, publishDate });
      assert.equal(prepState.status, PREPARATION_STATUS.PREPARED);

      const fbState = await getPublicationState({ redis: mockRedis, publishDate, platform: "facebook" });
      assert.equal(fbState.status, PUBLICATION_STATUS.PUBLISHED);

      const igState = await getPublicationState({ redis: mockRedis, publishDate, platform: "instagram" });
      assert.equal(igState.status, PUBLICATION_STATUS.PUBLISHED);
    });

    it("2. Preparation failure: no Facebook or Instagram provider calls", async () => {
      const publishDate = "2026-08-28";
      const failingGenerator = async () => {
        aiCallCount++;
        throw new Error("AI provider quota exhausted");
      };
      let fetchCalled = false;
      const fetchImpl = async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({}) };
      };

      const result = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText: failingGenerator,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, DAILY_RUN_STATUS.PREPARATION_FAILED);
      assert.equal(result.preparation.success, false);
      assert.equal(result.publishing.facebook.status, "SKIPPED");
      assert.equal(result.publishing.instagram.status, "SKIPPED");
      assert.equal(fetchCalled, false);
    });

    it("3. ALREADY_PREPARED: no AI generation and no R2 preparation work", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();
      const fetchImpl = createMockFetch();

      // First run: completes preparation & publishing
      await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(aiCallCount, 1);
      assert.equal(mockR2Client.sentCommands.length, 5);

      // Second run for same date
      const result2 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(result2.success, true);
      assert.equal(result2.preparation.status, "ALREADY_PREPARED");
      assert.equal(aiCallCount, 1); // No new AI call!
      assert.equal(mockR2Client.sentCommands.length, 5); // No new R2 upload!
    });
  });

  describe("Platform Isolation & Failures", () => {
    it("4. Facebook failure: Instagram can still execute independently", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();
      const fetchImpl = createMockFetch({ facebookBehavior: "feed_error" });

      const result = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(result.success, false);
      assert.equal(result.status, DAILY_RUN_STATUS.PARTIAL_SUCCESS);

      assert.equal(result.publishing.facebook.success, false);
      assert.equal(result.publishing.facebook.status, "FAILED");

      assert.equal(result.publishing.instagram.success, true);
      assert.equal(result.publishing.instagram.status, "PUBLISHED");
      assert.equal(result.publishing.instagram.providerId, "ig_media_post_777888999");
    });

    it("5. Instagram failure: Facebook remains successful/published", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();
      const fetchImpl = createMockFetch({ instagramBehavior: "publish_error" });

      const result = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(result.success, false);
      assert.equal(result.status, DAILY_RUN_STATUS.PARTIAL_SUCCESS);

      assert.equal(result.publishing.facebook.success, true);
      assert.equal(result.publishing.facebook.status, "PUBLISHED");

      assert.equal(result.publishing.instagram.success, false);
      assert.equal(result.publishing.instagram.status, "FAILED");
    });

    it("6. Second invocation after both platforms PUBLISHED: no provider calls", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();
      let fetchCallCount = 0;
      const baseFetch = createMockFetch();
      const fetchImpl = async (url, opts) => {
        fetchCallCount++;
        return baseFetch(url, opts);
      };

      // Run 1: everything succeeds
      await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      const initialFetchCalls = fetchCallCount;

      // Run 2: both ALREADY_PUBLISHED
      const result2 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(result2.success, true);
      assert.equal(result2.publishing.facebook.status, "ALREADY_PUBLISHED");
      assert.equal(result2.publishing.instagram.status, "ALREADY_PUBLISHED");
      assert.equal(fetchCallCount, initialFetchCalls); // Zero new network calls!
    });

    it("7. Facebook PUBLISHED + Instagram FAILED: second invocation does not republish Facebook but retries Instagram", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();

      // Run 1: Instagram fails
      const fetch1 = createMockFetch({ instagramBehavior: "publish_error" });
      const res1 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: fetch1,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(res1.publishing.facebook.status, "PUBLISHED");
      assert.equal(res1.publishing.instagram.status, "FAILED");

      // Run 2: Instagram issue resolved
      const fetch2 = createMockFetch({ instagramBehavior: "success" });
      const res2 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: fetch2,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(res2.success, true);
      assert.equal(res2.status, DAILY_RUN_STATUS.COMPLETED);
      assert.equal(res2.publishing.facebook.status, "ALREADY_PUBLISHED");
      assert.equal(res2.publishing.instagram.status, "PUBLISHED");
      assert.equal(aiCallCount, 1); // Content NOT regenerated!
    });

    it("8. RECONCILIATION_REQUIRED: platform is never automatically retried", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();

      // Run 1: ambiguous final publish on Facebook
      const fetch1 = createMockFetch({ facebookBehavior: "ambiguous_feed" });
      const res1 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: fetch1,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(res1.publishing.facebook.status, "RECONCILIATION_REQUIRED");

      // Run 2: Facebook remains blocked under RECONCILIATION_REQUIRED
      const fetch2 = createMockFetch({ facebookBehavior: "success" });
      const res2 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: fetch2,
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(res2.publishing.facebook.status, "RECONCILIATION_REQUIRED");
    });
  });

  describe("Security, Immutability & Boundaries", () => {
    it("9. No content regeneration on publication retry", async () => {
      const publishDate = "2026-08-28";
      const generateText = createMockGenerator();

      // First run with storage upload failure in preparation
      mockR2Client.shouldFail = true;
      const res1 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: createMockFetch(),
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });
      assert.equal(res1.preparation.status, "FAILED");

      // Second run succeeds preparation and publishing
      mockR2Client.shouldFail = false;
      const res2 = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: createMockFetch(),
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });
      assert.equal(res2.preparation.status, "PREPARED");
      assert.equal(res2.status, DAILY_RUN_STATUS.COMPLETED);
    });

    it("10. Unexpected internal failure returns sanitized result without credential/buffer leakage", async () => {
      const publishDate = "2026-08-28";
      const leakingGenerator = async () => {
        throw new Error("Failure with sensitive Bearer sk-secret-ai-token-12345");
      };

      const res = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText: leakingGenerator,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: createMockFetch(),
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig
      });

      assert.equal(res.success, false);
      const resStr = JSON.stringify(res);
      assert.equal(resStr.includes("sk-secret-ai-token-12345"), false);
      assert.equal(resStr.includes("mock-secret-access-key"), false);
      assert.equal(resStr.includes("EAAX_MOCK_PAGE_TOKEN"), false);
    });

    it("11. Exact publishDate and contentId propagation across all phases", async () => {
      const publishDate = "2026-08-28";
      const res = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText: createMockGenerator(),
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: createMockFetch(),
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(res.publishDate, "2026-08-28");
      assert.equal(res.contentId, "social-2026-08-28");

      const manifest = await getManifest({ redis: mockRedis, publishDate });
      assert.equal(manifest.publishDate, "2026-08-28");
      assert.equal(manifest.contentId, "social-2026-08-28");
    });

    it("12. Invalid publishDate input is rejected cleanly", async () => {
      for (const badDate of ["invalid-date", "2026/08/28", "", null, undefined, 12345]) {
        const res = await runDailySocialPipeline({
          publishDate: badDate,
          redis: mockRedis
        });
        assert.equal(res.success, false);
        assert.equal(res.preparation.status, "FAILED");
        assert.equal(res.publishing.facebook.status, "SKIPPED");
        assert.equal(res.publishing.instagram.status, "SKIPPED");
      }
    });

    it("13. Quality Gate failure stops pipeline before publishing", async () => {
      const publishDate = "2026-08-28";
      // Return creative with duplicate cover headline from history to force Quality Gate rejection
      const fixture = createValidCreativeFixture();
      const generateText = async () => JSON.stringify(fixture);

      // Pre-populate history with identical creativeDigest to trigger duplicate failure
      const { saveQualityGateResult, evaluateQualityGate } = require("../social/qualityGate");
      const { buildPreparedContent } = require("../social/contentSchema");
      const { renderCarousel } = require("../social/renderer");
      const { uploadRenderedCarousel } = require("../social/storage");
      const { buildManifest } = require("../social/manifest");

      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-01",
        category: "dream_science",
        creative: fixture
      });
      const rendered = await renderCarousel(preparedContent);
      const storageRes = await uploadRenderedCarousel({
        preparedContent,
        renderedCarousel: rendered,
        client: mockR2Client,
        config: mockR2Config
      });
      const manifest = buildManifest({ preparedContent, storageResult: storageRes });
      const evalPass = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: rendered,
        manifest,
        recentHistory: []
      });
      await saveQualityGateResult({ redis: mockRedis, evaluation: evalPass });

      // Run daily pipeline for 2026-08-28 with duplicate content
      const res = await runDailySocialPipeline({
        publishDate,
        redis: mockRedis,
        generateText,
        r2Client: mockR2Client,
        r2Config: mockR2Config,
        fetchImpl: createMockFetch(),
        facebookConfig: mockFbConfig,
        instagramConfig: mockIgConfig,
        sleepImpl: async () => {}
      });

      assert.equal(res.success, false);
      assert.equal(res.status, DAILY_RUN_STATUS.QUALITY_FAILED);
      assert.equal(res.preparation.status, "QUALITY_FAILED");
      assert.equal(res.publishing.facebook.status, "SKIPPED");
      assert.equal(res.publishing.instagram.status, "SKIPPED");
    });

    it("14. Export aliases work identically", async () => {
      assert.equal(typeof runDailySocialPipeline, "function");
      assert.equal(runDailySocialRun, runDailySocialPipeline);
      assert.equal(executeDailySocialRun, runDailySocialPipeline);
    });
  });
});
