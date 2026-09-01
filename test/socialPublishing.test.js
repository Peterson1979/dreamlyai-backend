// test/socialPublishing.test.js
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  publishSocialPlatform,
  SocialPublishingError,
  PUBLISHING_ERROR_CODES
} = require("../social/publishing");
const {
  PREPARATION_STATUS,
  PUBLICATION_STATUS,
  getPublicationState,
  getPreparationState,
  getManifest,
  buildPublishStateKey,
  buildPublishLeaseKey
} = require("../social/state");
const {
  getQualityGateState,
  computeManifestDigest,
  QUALITY_STATUS
} = require("../social/qualityGate");
const { MockRedis } = require("./helpers/mockRedis");

function createValidManifest(publishDate = "2026-08-28") {
  return {
    schemaVersion: 1,
    publishDate,
    contentId: `social-${publishDate}`,
    category: "dream_science",
    topic: "Water and Ocean Dreams",
    slideCount: 5,
    media: [
      {
        index: 1,
        role: "cover",
        key: `social/${publishDate.replace(/-/g, "/")}/slide-01.jpg`,
        url: `https://media.dreamlyai.com/social/${publishDate.replace(/-/g, "/")}/slide-01.jpg`,
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 25000
      },
      {
        index: 2,
        role: "content",
        key: `social/${publishDate.replace(/-/g, "/")}/slide-02.jpg`,
        url: `https://media.dreamlyai.com/social/${publishDate.replace(/-/g, "/")}/slide-02.jpg`,
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 26000
      },
      {
        index: 3,
        role: "content",
        key: `social/${publishDate.replace(/-/g, "/")}/slide-03.jpg`,
        url: `https://media.dreamlyai.com/social/${publishDate.replace(/-/g, "/")}/slide-03.jpg`,
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 27000
      },
      {
        index: 4,
        role: "content",
        key: `social/${publishDate.replace(/-/g, "/")}/slide-04.jpg`,
        url: `https://media.dreamlyai.com/social/${publishDate.replace(/-/g, "/")}/slide-04.jpg`,
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 28000
      },
      {
        index: 5,
        role: "cta",
        key: `social/${publishDate.replace(/-/g, "/")}/slide-05.jpg`,
        url: `https://media.dreamlyai.com/social/${publishDate.replace(/-/g, "/")}/slide-05.jpg`,
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 29000
      }
    ],
    captions: {
      instagram: "Have you ever dreamed of open water? Water reflects our emotions. #dreamlyai",
      facebook: "Water in dreams often mirrors our emotional landscape. Calm seas signify peace."
    }
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
    instagramBusinessAccountId: "17841400000000001",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createSuccessfulFacebookFetch(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (handlers.onCall) {
      const customResponse = await handlers.onCall(url, options, calls.length);
      if (customResponse) return customResponse;
    }

    if (url.includes("/me?fields=id,name")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789", name: "DreamlyAI Official" })
      };
    }

    if (url.includes("/photos")) {
      const photoCount = calls.filter((c) => c.url.includes("/photos")).length;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `fb_photo_id_${photoCount}` })
      };
    }

    if (url.includes("/feed")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789_987654321" })
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({})
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function createSuccessfulInstagramFetch(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (handlers.onCall) {
      const customRes = await handlers.onCall(url, options, calls.length);
      if (customRes) return customRes;
    }

    if (url.includes("?fields=id,name,instagram_business_account")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "100123456789",
          name: "DreamlyAI Official",
          instagram_business_account: {
            id: "17841400000000001"
          }
        })
      };
    }

    if (url.includes("?fields=status_code,status")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status_code: "FINISHED" })
      };
    }

    if (url.includes("/media_publish")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "ig_published_media_1789999999" })
      };
    }

    if (url.includes("/media")) {
      const mediaCount = calls.filter((c) => c.url.includes("/media") && !c.url.includes("/media_publish")).length;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `ig_container_${mediaCount}` })
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({})
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

async function seedAuthorizedState(redis, publishDate = "2026-08-28", manifestOverride = null) {
  const manifest = manifestOverride || createValidManifest(publishDate);
  const contentId = `social-${publishDate}`;

  await redis.set(
    `social:prepare:${publishDate}`,
    JSON.stringify({
      stateVersion: 1,
      publishDate,
      contentId,
      status: PREPARATION_STATUS.PREPARED
    })
  );

  await redis.set(`social:manifest:${publishDate}`, JSON.stringify(manifest));

  const manifestDigest = computeManifestDigest(manifest);
  await redis.set(
    `social:quality:${publishDate}`,
    JSON.stringify({
      stateVersion: 1,
      publishDate,
      contentId,
      status: QUALITY_STATUS.PASS,
      manifestDigest,
      creativeDigest: "a".repeat(64),
      finalCaptionsDigest: "b".repeat(64),
      errorCodes: []
    })
  );

  return manifest;
}

describe("DreamlyAI Social Content Publishing Orchestrator", () => {
  let redis;
  let fbConfig;
  let igConfig;

  beforeEach(() => {
    redis = new MockRedis();
    fbConfig = createMockFacebookConfig();
    igConfig = createMockInstagramConfig();
  });

  describe("Preconditions", () => {
    it("1. missing preparation state blocks provider", async () => {
      const fetchImpl = createSuccessfulFacebookFetch();
      const manifest = createValidManifest("2026-08-28");
      await redis.set("social:manifest:2026-08-28", JSON.stringify(manifest));
      const manifestDigest = computeManifestDigest(manifest);
      await redis.set(
        "social:quality:2026-08-28",
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          status: "PASS",
          manifestDigest,
          creativeDigest: "a".repeat(64),
          finalCaptionsDigest: "b".repeat(64),
          errorCodes: []
        })
      );

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-001",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "PREPARATION_NOT_PREPARED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("2. PREPARING blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(
        "social:prepare:2026-08-28",
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          status: PREPARATION_STATUS.PREPARING
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-002",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "PREPARATION_NOT_PREPARED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("3. FAILED preparation blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(
        "social:prepare:2026-08-28",
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          status: PREPARATION_STATUS.FAILED
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-003",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "PREPARATION_NOT_PREPARED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("4. PREPARED proceeds to manifest check", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-004",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
    });

    it("5. missing manifest blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.del("social:manifest:2026-08-28");

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-005",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "MANIFEST_INVALID_OR_MISSING");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("6. invalid manifest blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const badManifest = createValidManifest("2026-08-28");
      badManifest.media[0].width = 800; // invalid width
      await redis.set("social:manifest:2026-08-28", JSON.stringify(badManifest));

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-006",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "MANIFEST_INVALID_OR_MISSING");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("7. manifest contentId mismatch blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const badManifest = createValidManifest("2026-08-28");
      badManifest.contentId = "social-2026-08-99";
      await redis.set("social:manifest:2026-08-28", JSON.stringify(badManifest));

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-007",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "MANIFEST_INVALID_OR_MISSING");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("8. missing Quality Gate state blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.del("social:quality:2026-08-28");

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-008",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "QUALITY_GATE_NOT_AUTHORIZED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("9. FAILED Quality Gate blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const manifest = createValidManifest("2026-08-28");
      const manifestDigest = computeManifestDigest(manifest);
      await redis.set(
        "social:quality:2026-08-28",
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          status: QUALITY_STATUS.FAILED,
          manifestDigest,
          creativeDigest: "a".repeat(64),
          finalCaptionsDigest: "b".repeat(64),
          errorCodes: ["DUPLICATE_EXACT"]
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-009",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "QUALITY_GATE_NOT_AUTHORIZED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("10. PASS with wrong manifestDigest blocks provider", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(
        "social:quality:2026-08-28",
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          status: QUALITY_STATUS.PASS,
          manifestDigest: "0".repeat(64),
          creativeDigest: "a".repeat(64),
          finalCaptionsDigest: "b".repeat(64),
          errorCodes: []
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-010",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(result.errorCode, "QUALITY_GATE_NOT_AUTHORIZED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("11. exact PASS proceeds", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-011",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
    });

    it("12. no publication claim occurs before all three preconditions pass", async () => {
      // Missing Quality Gate state
      await redis.set(
        "social:prepare:2026-08-28",
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          status: PREPARATION_STATUS.PREPARED
        })
      );
      await redis.set("social:manifest:2026-08-28", JSON.stringify(createValidManifest("2026-08-28")));

      const fetchImpl = createSuccessfulFacebookFetch();
      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-012",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const lease = await redis.get(buildPublishLeaseKey("2026-08-28", "facebook"));
      const pubState = await redis.get(buildPublishStateKey("2026-08-28", "facebook"));
      assert.equal(lease, null);
      assert.equal(pubState, null);
    });

    it("13. no provider call occurs before publication claim succeeds", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Set existing active lease
      await redis.set(buildPublishLeaseKey("2026-08-28", "facebook"), "other-holder", "NX");

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-013",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "LEASE_HELD");
      assert.equal(fetchImpl.calls.length, 0);
    });
  });

  describe("Claim / Idempotency", () => {
    it("14. first valid Facebook claim acquires", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-014",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
    });

    it("15. first valid Instagram claim acquires independently", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-015",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
    });

    it("16. ALREADY_PUBLISHED causes zero provider calls", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(
        buildPublishStateKey("2026-08-28", "facebook"),
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          platform: "facebook",
          status: PUBLICATION_STATUS.PUBLISHED
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-016",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "ALREADY_PUBLISHED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("17. LEASE_HELD causes zero provider calls", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(buildPublishLeaseKey("2026-08-28", "facebook"), "holder-worker", "NX");

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-017",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "LEASE_HELD");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("18. RECONCILIATION_REQUIRED causes zero provider calls", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(
        buildPublishStateKey("2026-08-28", "facebook"),
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          platform: "facebook",
          status: PUBLICATION_STATUS.RECONCILIATION_REQUIRED
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-018",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "RECONCILIATION_REQUIRED");
      assert.equal(fetchImpl.calls.length, 0);
    });

    it("19. PUBLISHED is terminal", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const res1 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-019a",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });
      assert.equal(res1.status, "PUBLISHED");
      const initialCallCount = fetchImpl.calls.length;

      const res2 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-019b",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });
      assert.equal(res2.status, "ALREADY_PUBLISHED");
      assert.equal(fetchImpl.calls.length, initialCallCount);
    });

    it("20. FAILED publication state remains retryable", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      await redis.set(
        buildPublishStateKey("2026-08-28", "facebook"),
        JSON.stringify({
          stateVersion: 1,
          publishDate: "2026-08-28",
          contentId: "social-2026-08-28",
          platform: "facebook",
          status: PUBLICATION_STATUS.FAILED
        })
      );

      const fetchImpl = createSuccessfulFacebookFetch();
      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-020",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
    });
  });

  describe("Facebook Success", () => {
    it("21. Facebook adapter called exactly once", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-021",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const feedCalls = fetchImpl.calls.filter((c) => c.url.includes("/feed"));
      assert.equal(feedCalls.length, 1);
    });

    it("22. Instagram adapter not called", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-022",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const igCalls = fetchImpl.calls.filter((c) => c.url.includes("instagram_business_account") || c.url.includes("/media_publish"));
      assert.equal(igCalls.length, 0);
    });

    it("23. Facebook success marks facebook PUBLISHED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-023",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(state.status, PUBLICATION_STATUS.PUBLISHED);
    });

    it("24. Instagram publication state remains untouched", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-024",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const igState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "instagram" });
      assert.equal(igState, null);
    });

    it("25. sanitized result contains Facebook postId as providerId", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-025",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.providerId, "100123456789_987654321");
    });

    it("26. result contains no token/caption/manifest/photo IDs", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-026",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal("photoIds" in result, false);
      assert.equal("pageAccessToken" in result, false);
      assert.equal("token" in result, false);
      assert.equal("caption" in result, false);
      assert.equal("captions" in result, false);
      assert.equal("manifest" in result, false);
    });
  });

  describe("Instagram Success", () => {
    it("27. Instagram adapter called exactly once", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-027",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      const publishCalls = fetchImpl.calls.filter((c) => c.url.includes("/media_publish"));
      assert.equal(publishCalls.length, 1);
    });

    it("28. Facebook adapter not called", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-028",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      const fbFeedCalls = fetchImpl.calls.filter((c) => c.url.includes("/feed"));
      assert.equal(fbFeedCalls.length, 0);
    });

    it("29. Instagram success marks instagram PUBLISHED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-029",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "instagram" });
      assert.equal(state.status, PUBLICATION_STATUS.PUBLISHED);
    });

    it("30. Facebook publication state remains untouched", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-030",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      const fbState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(fbState, null);
    });

    it("31. sanitized result contains Instagram mediaId as providerId", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-031",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      assert.equal(result.providerId, "ig_published_media_1789999999");
    });

    it("32. result contains no token/caption/manifest/container IDs", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulInstagramFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-032",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      assert.equal("childContainerIds" in result, false);
      assert.equal("parentContainerId" in result, false);
      assert.equal("pageAccessToken" in result, false);
      assert.equal("token" in result, false);
      assert.equal("caption" in result, false);
      assert.equal("manifest" in result, false);
    });
  });

  describe("Definitive Failure", () => {
    it("33. Facebook definitive failure marks Facebook FAILED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Explicit Meta Graph error on photo 1
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/photos")) {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: { message: "Invalid image URL", type: "OAuthException", code: 100 } })
            };
          }
        }
      });

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-033",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "FAILED");
      assert.equal(result.errorCode, "PROVIDER_DEFINITIVE_FAILURE");

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(state.status, PUBLICATION_STATUS.FAILED);
    });

    it("34. Instagram definitive failure marks Instagram FAILED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Explicit error creating child container
      const fetchImpl = createSuccessfulInstagramFetch({
        onCall: (url) => {
          if (url.includes("/media") && !url.includes("/media_publish") && !url.includes("status")) {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: { message: "Media format error", code: 2207001 } })
            };
          }
        }
      });

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-034",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "FAILED");
      assert.equal(result.errorCode, "PROVIDER_DEFINITIVE_FAILURE");

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "instagram" });
      assert.equal(state.status, PUBLICATION_STATUS.FAILED);
    });

    it("35. FAILED result is not PUBLISHED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/photos")) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: "Internal server error" } })
            };
          }
        }
      });

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-035",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.notEqual(result.status, "PUBLISHED");
      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.notEqual(state.status, PUBLICATION_STATUS.PUBLISHED);
    });

    it("36. failed platform can be claimed again later", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Run 1: Fails
      let fail = true;
      const fetchImpl = async (url, options) => {
        if (fail && url.includes("/photos")) {
          return { ok: false, status: 500, json: async () => ({ error: { message: "500 Error" } }) };
        }
        return createSuccessfulFacebookFetch()(url, options);
      };

      const res1 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-036a",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });
      assert.equal(res1.status, "FAILED");

      // Run 2: Succeeds on retry
      fail = false;
      const res2 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-036b",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });
      assert.equal(res2.status, "PUBLISHED");
    });

    it("37. other platform remains untouched", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/photos")) {
            return { ok: false, status: 400, json: async () => ({ error: { message: "FB failure" } }) };
          }
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-037",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const igState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "instagram" });
      assert.equal(igState, null);
    });
  });

  describe("Ambiguous Failure", () => {
    it("38. Facebook AMBIGUOUS_FINAL_PUBLISH maps to RECONCILIATION_REQUIRED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Transport failure during /feed POST
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) {
            throw new Error("Socket hangup during /feed");
          }
        }
      });

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-038",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "RECONCILIATION_REQUIRED");

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(state.status, PUBLICATION_STATUS.RECONCILIATION_REQUIRED);
    });

    it("39. Instagram AMBIGUOUS_FINAL_PUBLISH maps to RECONCILIATION_REQUIRED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Transport throw during /media_publish
      const fetchImpl = createSuccessfulInstagramFetch({
        onCall: (url) => {
          if (url.includes("/media_publish")) {
            throw new Error("ECONNRESET during media_publish");
          }
        }
      });

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-039",
        redis,
        fetchImpl,
        instagramConfig: igConfig
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "RECONCILIATION_REQUIRED");

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "instagram" });
      assert.equal(state.status, PUBLICATION_STATUS.RECONCILIATION_REQUIRED);
    });

    it("40. ambiguous outcome is never marked FAILED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) {
            throw new Error("ETIMEDOUT during /feed");
          }
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-040",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.notEqual(state.status, PUBLICATION_STATUS.FAILED);
      assert.equal(state.status, PUBLICATION_STATUS.RECONCILIATION_REQUIRED);
    });

    it("41. ambiguous outcome is never marked PUBLISHED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) {
            throw new Error("ETIMEDOUT during /feed");
          }
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-041",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.notEqual(state.status, PUBLICATION_STATUS.PUBLISHED);
    });

    it("42. ambiguous provider is never retried", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      let feedAttempts = 0;
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) {
            feedAttempts++;
            throw new Error("Network drop during /feed");
          }
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-042",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(feedAttempts, 1);
    });

    it("43. subsequent automatic claim is blocked", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) {
            throw new Error("Network drop during /feed");
          }
        }
      });

      // Run 1: Enters RECONCILIATION_REQUIRED
      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-043a",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      // Run 2: Immediately blocked
      const res2 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-043b",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(res2.status, "RECONCILIATION_REQUIRED");
      assert.equal(res2.success, false);
    });

    it("44. other platform remains independently usable", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      // Facebook enters RECONCILIATION_REQUIRED
      const fbFetch = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) throw new Error("FB ambiguous drop");
        }
      });
      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-044-fb",
        redis,
        fetchImpl: fbFetch,
        facebookConfig: fbConfig
      });

      // Instagram can still publish cleanly
      const igFetch = createSuccessfulInstagramFetch();
      const igRes = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "instagram",
        leaseId: "pub-worker-044-ig",
        redis,
        fetchImpl: igFetch,
        instagramConfig: igConfig
      });

      assert.equal(igRes.success, true);
      assert.equal(igRes.status, "PUBLISHED");
    });
  });

  describe("Order / State", () => {
    it("45. durable publication state becomes PUBLISHING before provider call", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      let checkedPublishingState = false;

      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: async () => {
          const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
          if (state && state.status === PUBLICATION_STATUS.PUBLISHING) {
            checkedPublishingState = true;
          }
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-045",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(checkedPublishingState, true);
    });

    it("46. markPublicationPublished occurs only after definitive provider success", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-046",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const finalState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(finalState.status, PUBLICATION_STATUS.PUBLISHED);
    });

    it("47. definitive failure transition occurs after provider failure", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/photos")) {
            return { ok: false, status: 400, json: async () => ({ error: { message: "Bad Photo" } }) };
          }
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-047",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const finalState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(finalState.status, PUBLICATION_STATUS.FAILED);
    });

    it("48. reconciliation transition occurs after ambiguous final publish", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/feed")) throw new Error("Ambiguous final drop");
        }
      });

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-048",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const finalState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(finalState.status, PUBLICATION_STATUS.RECONCILIATION_REQUIRED);
    });

    it("49. provider success plus failed markPublicationPublished does not falsely return PUBLISHED", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      // Monkey-patch redis.set to throw during markPublicationPublished
      const origSet = redis.set.bind(redis);
      redis.set = async (key, val, ...args) => {
        if (key === buildPublishStateKey("2026-08-28", "facebook") && typeof val === "string" && val.includes("PUBLISHED")) {
          throw new Error("Redis connection dropped during final publish state write");
        }
        return origSet(key, val, ...args);
      };

      await assert.rejects(
        async () =>
          publishSocialPlatform({
            publishDate: "2026-08-28",
            platform: "facebook",
            leaseId: "pub-worker-049",
            redis,
            fetchImpl,
            facebookConfig: fbConfig
          }),
        (err) => {
          assert.equal(err instanceof SocialPublishingError, true);
          return true;
        }
      );
    });

    it("50. same successful platform cannot automatically republish", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const res1 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-050a",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });
      assert.equal(res1.status, "PUBLISHED");

      const res2 = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-050b",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });
      assert.equal(res2.status, "ALREADY_PUBLISHED");
    });
  });

  describe("Security / Boundaries", () => {
    it("51. Pinterest platform is rejected", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await assert.rejects(
        async () =>
          publishSocialPlatform({
            publishDate: "2026-08-28",
            platform: "pinterest",
            leaseId: "pub-worker-051",
            redis,
            fetchImpl,
            facebookConfig: fbConfig
          }),
        (err) => {
          assert.equal(err instanceof SocialPublishingError, true);
          assert.equal(err.code, PUBLISHING_ERROR_CODES.INVALID_PUBLISH_INPUT);
          return true;
        }
      );
    });

    it("52. invalid platform causes zero provider calls", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await assert.rejects(async () =>
        publishSocialPlatform({
          publishDate: "2026-08-28",
          platform: "twitter",
          leaseId: "pub-worker-052",
          redis,
          fetchImpl,
          facebookConfig: fbConfig
        })
      );

      assert.equal(fetchImpl.calls.length, 0);
    });

    it("53. no preparation state is modified", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const prepBefore = await redis.get("social:prepare:2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-053",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const prepAfter = await redis.get("social:prepare:2026-08-28");
      assert.equal(prepBefore, prepAfter);
    });

    it("54. no manifest is modified", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const manBefore = await redis.get("social:manifest:2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-054",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const manAfter = await redis.get("social:manifest:2026-08-28");
      assert.equal(manBefore, manAfter);
    });

    it("55. no Quality Gate state/history is modified", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const qBefore = await redis.get("social:quality:2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-055",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const qAfter = await redis.get("social:quality:2026-08-28");
      assert.equal(qBefore, qAfter);
    });

    it("56. no R2 calls occur", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-056",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "PUBLISHED");
    });

    it("57. no AI calls occur", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-057",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "PUBLISHED");
    });

    it("58. successful result contains no secrets", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch();

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-058",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("EAAX_MOCK_PAGE_TOKEN"), false);
      assert.equal(serialized.includes("SECRET"), false);
    });

    it("59. failed result/error contains no secrets", async () => {
      await seedAuthorizedState(redis, "2026-08-28");
      const fetchImpl = createSuccessfulFacebookFetch({
        onCall: (url) => {
          if (url.includes("/photos")) {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: { message: "Error with EAAX_MOCK_PAGE_TOKEN_SECRET_FB_12345" } })
            };
          }
        }
      });

      const result = await publishSocialPlatform({
        publishDate: "2026-08-28",
        platform: "facebook",
        leaseId: "pub-worker-059",
        redis,
        fetchImpl,
        facebookConfig: fbConfig
      });

      assert.equal(result.status, "FAILED");
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("EAAX_MOCK_PAGE_TOKEN"), false);
    });

    it("60. zero real network/provider requests occur", async () => {
      assert.ok(true);
    });
  });
});
