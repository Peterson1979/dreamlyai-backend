// test/socialMultiDestination.test.js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  DAILY_RUN_STATUS,
  runDailySocialPipeline
} = require("../social/dailyRun");
const {
  runProductionSocialPipeline
} = require("../social/productionRun");
const {
  publishSocialPlatform
} = require("../social/publishing");
const {
  loadFacebookConfig,
  loadFacebookSecondaryConfig,
  isFacebookSecondaryConfigured
} = require("../social/facebookConfig");
const {
  loadInstagramConfig,
  loadInstagramSecondaryConfig,
  isInstagramSecondaryConfigured
} = require("../social/instagramConfig");
const {
  getPublicationState,
  getManifest,
  PUBLICATION_STATUS,
  SUPPORTED_PUBLISH_DESTINATIONS
} = require("../social/state");
const { MockRedis } = require("./helpers/mockRedis");
const { setRedisClient, resetRedisClient } = require("../utils/redisClient");
const { setMockProviders, resetMockProviders } = require("../utils/providers");

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
    this.uploadCount = 0;
  }

  async send(command) {
    this.sentCommands.push(command);
    this.uploadCount++;
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

function createMockFacebookPrimaryConfig() {
  return {
    pageId: "100111111111",
    pageAccessToken: "EAAX_PRIMARY_FB_PAGE_TOKEN_12345",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockFacebookSecondaryConfig() {
  return {
    pageId: "200222222222",
    pageAccessToken: "EAAX_SECONDARY_FB_PAGE_TOKEN_67890",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockInstagramPrimaryConfig() {
  return {
    pageId: "100111111111",
    pageAccessToken: "EAAX_PRIMARY_FB_PAGE_TOKEN_12345",
    instagramBusinessAccountId: "17841400000000001",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockInstagramSecondaryConfig() {
  return {
    pageId: "200222222222",
    pageAccessToken: "EAAX_SECONDARY_FB_PAGE_TOKEN_67890",
    instagramBusinessAccountId: "17841400000000002",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMultiDestinationFetch({
  fbPrimaryFail = false,
  fbSecondaryFail = false,
  igPrimaryFail = false,
  igSecondaryFail = false
} = {}) {
  const recordedCalls = [];

  const fetchImpl = async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || "GET";
    recordedCalls.push({ url: urlStr, options });

    // 1. Facebook Primary identity verification
    if (urlStr.includes("100111111111?fields=id,name") && !urlStr.includes("instagram_business_account")) {
      if (fbPrimaryFail) {
        return { ok: false, status: 400, json: async () => ({ error: { message: "Primary FB Page error" } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100111111111", name: "DreamlyAI Official Primary Page", access_token: "resolved_fb_primary_token" })
      };
    }

    // 2. Facebook Secondary identity verification
    if (urlStr.includes("200222222222?fields=id,name") && !urlStr.includes("instagram_business_account")) {
      if (fbSecondaryFail) {
        return { ok: false, status: 400, json: async () => ({ error: { message: "Secondary FB Page error" } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "200222222222", name: "DreamlyAI Brand Secondary Page", access_token: "resolved_fb_secondary_token" })
      };
    }

    // 3. Instagram Primary identity verification
    if (urlStr.includes("100111111111?fields=id,name,instagram_business_account")) {
      if (igPrimaryFail) {
        return { ok: false, status: 400, json: async () => ({ error: { message: "Primary IG error" } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "100111111111",
          name: "DreamlyAI Official Primary Page",
          instagram_business_account: { id: "17841400000000001" }
        })
      };
    }

    // 4. Instagram Secondary identity verification
    if (urlStr.includes("200222222222?fields=id,name,instagram_business_account")) {
      if (igSecondaryFail) {
        return { ok: false, status: 400, json: async () => ({ error: { message: "Secondary IG error" } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "200222222222",
          name: "DreamlyAI Brand Secondary Page",
          instagram_business_account: { id: "17841400000000002" }
        })
      };
    }

    // 5. Facebook photo uploads
    if (urlStr.includes("/photos") && method === "POST") {
      const page = urlStr.includes("100111111111") ? "primary" : "secondary";
      return { ok: true, status: 200, json: async () => ({ id: `fb_photo_${page}_${Date.now()}_${Math.random()}` }) };
    }

    // 6. Facebook feed posts
    if (urlStr.includes("/feed") && method === "POST") {
      const page = urlStr.includes("100111111111") ? "primary" : "secondary";
      return { ok: true, status: 200, json: async () => ({ id: `fb_post_${page}_987654` }) };
    }

    // 7. Instagram media container creation
    if (urlStr.includes("/media") && method === "POST" && !urlStr.includes("/media_publish")) {
      return { ok: true, status: 200, json: async () => ({ id: `ig_container_${Math.random()}` }) };
    }

    // 8. Instagram container status check
    if (urlStr.includes("fields=status_code,status") && method === "GET") {
      return { ok: true, status: 200, json: async () => ({ status_code: "FINISHED", status: "Ready" }) };
    }

    // 9. Instagram final media publish
    if (urlStr.includes("/media_publish") && method === "POST") {
      const account = urlStr.includes("17841400000000001") ? "primary" : "secondary";
      return { ok: true, status: 200, json: async () => ({ id: `ig_media_${account}_12345` }) };
    }

    return { ok: true, status: 200, json: async () => ({}) };
  };

  fetchImpl.getCalls = () => recordedCalls;
  return fetchImpl;
}

describe("DreamlyAI Multi-Destination Social Publishing Pipeline", () => {
  let mockRedis;
  const publishDate = "2026-09-09";

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
  });

  afterEach(() => {
    resetRedisClient();
    resetMockProviders();
  });

  it("1. One preparation produces only one manifest and one set of media URLs across 4 destinations", async () => {
    let aiCallCount = 0;
    const generateText = async () => {
      aiCallCount++;
      return { text: JSON.stringify(createValidCreativeFixture()), rawResponse: {} };
    };

    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch();

    const result = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(result.success, true);
    assert.equal(result.status, DAILY_RUN_STATUS.COMPLETED);
    assert.equal(aiCallCount, 1, "Exactly 1 AI call should occur");
    assert.equal(s3Client.uploadCount, 5, "Exactly 5 R2 image uploads should occur");

    const manifest = await getManifest({ redis: mockRedis, publishDate });
    assert.ok(manifest);
    assert.equal(manifest.media.length, 5);
  });

  it("2. Both Facebook destinations reuse the exact same five R2 URLs", async () => {
    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch();

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    const calls = fetchImpl.getCalls();
    const primaryFbPhotoCalls = calls.filter(
      (c) => c.url.includes("100111111111/photos") && c.options.method === "POST"
    );
    const secondaryFbPhotoCalls = calls.filter(
      (c) => c.url.includes("200222222222/photos") && c.options.method === "POST"
    );

    assert.equal(primaryFbPhotoCalls.length, 5);
    assert.equal(secondaryFbPhotoCalls.length, 5);

    const primaryUrls = primaryFbPhotoCalls.map((c) => new URLSearchParams(c.options.body).get("url"));
    const secondaryUrls = secondaryFbPhotoCalls.map((c) => new URLSearchParams(c.options.body).get("url"));

    assert.deepEqual(primaryUrls, secondaryUrls, "Both Facebook Pages must receive identical 5 R2 URLs");
  });

  it("3. Both Instagram destinations reuse the exact same five R2 URLs", async () => {
    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch();

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    const calls = fetchImpl.getCalls();
    const primaryIgChildCalls = calls.filter(
      (c) =>
        c.url.includes("17841400000000001/media") &&
        c.options.method === "POST" &&
        c.options.body.includes("is_carousel_item=true")
    );
    const secondaryIgChildCalls = calls.filter(
      (c) =>
        c.url.includes("17841400000000002/media") &&
        c.options.method === "POST" &&
        c.options.body.includes("is_carousel_item=true")
    );

    assert.equal(primaryIgChildCalls.length, 5);
    assert.equal(secondaryIgChildCalls.length, 5);

    const primaryUrls = primaryIgChildCalls.map((c) => new URLSearchParams(c.options.body).get("image_url"));
    const secondaryUrls = secondaryIgChildCalls.map((c) => new URLSearchParams(c.options.body).get("image_url"));

    assert.deepEqual(primaryUrls, secondaryUrls, "Both Instagram Business Accounts must receive identical 5 R2 URLs");
  });

  it("4. Primary destination publishes successfully while secondary destination fails", async () => {
    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch({ fbSecondaryFail: true, igSecondaryFail: true });

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    const result = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(result.success, false);
    assert.equal(result.status, DAILY_RUN_STATUS.PARTIAL_SUCCESS);

    assert.equal(result.publishing.facebook_primary.status, "PUBLISHED");
    assert.equal(result.publishing.instagram_primary.status, "PUBLISHED");
    assert.equal(result.publishing.facebook_secondary.status, "FAILED");
    assert.equal(result.publishing.instagram_secondary.status, "FAILED");

    // Backward-compatible aliases
    assert.equal(result.publishing.facebook.status, "PUBLISHED");
    assert.equal(result.publishing.instagram.status, "PUBLISHED");

    // State verification
    const fbPrimState = await getPublicationState({ redis: mockRedis, publishDate, platform: "facebook_primary" });
    const fbSecState = await getPublicationState({ redis: mockRedis, publishDate, platform: "facebook_secondary" });
    assert.equal(fbPrimState.status, PUBLICATION_STATUS.PUBLISHED);
    assert.equal(fbSecState.status, PUBLICATION_STATUS.FAILED);
  });

  it("5. Secondary destination publishes successfully while primary destination fails", async () => {
    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch({ fbPrimaryFail: true, igPrimaryFail: true });

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    const result = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(result.success, false);
    assert.equal(result.status, DAILY_RUN_STATUS.PARTIAL_SUCCESS);

    assert.equal(result.publishing.facebook_primary.status, "FAILED");
    assert.equal(result.publishing.instagram_primary.status, "FAILED");
    assert.equal(result.publishing.facebook_secondary.status, "PUBLISHED");
    assert.equal(result.publishing.instagram_secondary.status, "PUBLISHED");

    const fbPrimState = await getPublicationState({ redis: mockRedis, publishDate, platform: "facebook_primary" });
    const fbSecState = await getPublicationState({ redis: mockRedis, publishDate, platform: "facebook_secondary" });
    assert.equal(fbPrimState.status, PUBLICATION_STATUS.FAILED);
    assert.equal(fbSecState.status, PUBLICATION_STATUS.PUBLISHED);
  });

  it("6. One Facebook destination can be retried without republishing the other", async () => {
    const s3Client = new MockS3Client();
    // Run 1: Primary succeeds, secondary fails
    const fetch1 = createMultiDestinationFetch({ fbSecondaryFail: true });

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    const res1 = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl: fetch1,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(res1.publishing.facebook_primary.status, "PUBLISHED");
    assert.equal(res1.publishing.facebook_secondary.status, "FAILED");

    // Run 2: Retry with working secondary
    const fetch2 = createMultiDestinationFetch();
    const res2 = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl: fetch2,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(res2.publishing.facebook_primary.status, "ALREADY_PUBLISHED");
    assert.equal(res2.publishing.facebook_secondary.status, "PUBLISHED");
    assert.equal(res2.status, DAILY_RUN_STATUS.COMPLETED);

    // Verify fetch2 never called primary Facebook /photos or /feed
    const fetch2Calls = fetch2.getCalls();
    const primaryFbPostWrites = fetch2Calls.filter(
      (c) => c.url.includes("100111111111/photos") || c.url.includes("100111111111/feed")
    );
    assert.equal(primaryFbPostWrites.length, 0, "Primary Facebook must not be republished on retry");

    // Verify secondary Facebook DID execute photos & feed
    const secondaryFbPhotos = fetch2Calls.filter((c) => c.url.includes("200222222222/photos"));
    assert.equal(secondaryFbPhotos.length, 5);
  });

  it("7. One Instagram destination can be retried without republishing the other", async () => {
    const s3Client = new MockS3Client();
    // Run 1: Primary succeeds, secondary fails
    const fetch1 = createMultiDestinationFetch({ igSecondaryFail: true });

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    const res1 = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl: fetch1,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(res1.publishing.instagram_primary.status, "PUBLISHED");
    assert.equal(res1.publishing.instagram_secondary.status, "FAILED");

    // Run 2: Retry with working secondary
    const fetch2 = createMultiDestinationFetch();
    const res2 = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl: fetch2,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(res2.publishing.instagram_primary.status, "ALREADY_PUBLISHED");
    assert.equal(res2.publishing.instagram_secondary.status, "PUBLISHED");

    // Verify fetch2 never called primary Instagram container creation or media publish
    const fetch2Calls = fetch2.getCalls();
    const primaryIgWrites = fetch2Calls.filter(
      (c) => c.url.includes("17841400000000001/media") || c.url.includes("17841400000000001/media_publish")
    );
    assert.equal(primaryIgWrites.length, 0, "Primary Instagram must not be republished on retry");

    // Verify secondary Instagram DID execute
    const secondaryIgPublishes = fetch2Calls.filter((c) => c.url.includes("17841400000000002/media_publish"));
    assert.equal(secondaryIgPublishes.length, 1);
  });

  it("8. Missing secondary configuration results in a safe skip without affecting primary publishing", async () => {
    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch();

    const generateText = async () => ({
      text: JSON.stringify(createValidCreativeFixture()),
      rawResponse: {}
    });

    const result = await runDailySocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: null, // explicitly unconfigured
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: null // explicitly unconfigured
    });

    assert.equal(result.success, true);
    assert.equal(result.status, DAILY_RUN_STATUS.COMPLETED);

    assert.equal(result.publishing.facebook_primary.status, "PUBLISHED");
    assert.equal(result.publishing.instagram_primary.status, "PUBLISHED");
    assert.equal(result.publishing.facebook_secondary.status, "SKIPPED");
    assert.equal(result.publishing.facebook_secondary.reason, "NOT_CONFIGURED");
    assert.equal(result.publishing.instagram_secondary.status, "SKIPPED");
    assert.equal(result.publishing.instagram_secondary.reason, "NOT_CONFIGURED");
  });

  it("9. Environment config loading: shared Meta token fallback for secondary Facebook and Instagram", () => {
    const mockEnv = {
      FACEBOOK_PAGE_ID: "100111111111",
      FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_SHARED_SYSTEM_TOKEN_12345",
      INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000001",
      FACEBOOK_SECONDARY_PAGE_ID: "200222222222",
      INSTAGRAM_SECONDARY_BUSINESS_ACCOUNT_ID: "17841400000000002"
    };

    assert.equal(isFacebookSecondaryConfigured(mockEnv), true);
    assert.equal(isInstagramSecondaryConfigured(mockEnv), true);

    const fbSecConfig = loadFacebookSecondaryConfig(mockEnv);
    assert.ok(fbSecConfig);
    assert.equal(fbSecConfig.pageId, "200222222222");
    assert.equal(fbSecConfig.pageAccessToken, "EAAX_SHARED_SYSTEM_TOKEN_12345", "Fallback to shared token");

    const igSecConfig = loadInstagramSecondaryConfig(mockEnv);
    assert.ok(igSecConfig);
    assert.equal(igSecConfig.instagramBusinessAccountId, "17841400000000002");
    assert.equal(igSecConfig.pageId, "200222222222", "Derived from secondary Facebook Page ID");
    assert.equal(igSecConfig.pageAccessToken, "EAAX_SHARED_SYSTEM_TOKEN_12345", "Fallback to shared token");

    // When secondary env vars are missing:
    const emptyEnv = {
      FACEBOOK_PAGE_ID: "100111111111",
      FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_PRIMARY_TOKEN",
      INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000001"
    };
    assert.equal(isFacebookSecondaryConfigured(emptyEnv), false);
    assert.equal(isInstagramSecondaryConfigured(emptyEnv), false);
    assert.equal(loadFacebookSecondaryConfig(emptyEnv), null);
    assert.equal(loadInstagramSecondaryConfig(emptyEnv), null);
  });

  it("10. No duplicate carousel generation or R2 upload occurs when 4 destinations exist", async () => {
    let aiCallCount = 0;
    const generateText = async () => {
      aiCallCount++;
      return { text: JSON.stringify(createValidCreativeFixture()), rawResponse: {} };
    };

    const s3Client = new MockS3Client();
    const fetchImpl = createMultiDestinationFetch();

    await runProductionSocialPipeline({
      publishDate,
      redis: mockRedis,
      generateText,
      r2Client: s3Client,
      r2Config: createMockR2Config(),
      fetchImpl,
      facebookConfig: createMockFacebookPrimaryConfig(),
      facebookSecondaryConfig: createMockFacebookSecondaryConfig(),
      instagramConfig: createMockInstagramPrimaryConfig(),
      instagramSecondaryConfig: createMockInstagramSecondaryConfig()
    });

    assert.equal(aiCallCount, 1, "Exactly 1 content generation for all 4 destinations");
    assert.equal(s3Client.uploadCount, 5, "Exactly 5 R2 image uploads for all 4 destinations");
  });
});
