// test/socialThreads.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  loadThreadsConfig,
  validateThreadsConfig,
  isThreadsConfigured,
  redactSecrets,
  DEFAULT_THREADS_API_VERSION
} = require("../social/threadsConfig");
const {
  THREADS_WEB_CTA,
  THREADS_FINAL_CAPTION_MAX,
  formatThreadsCaption,
  buildPlatformCaptions
} = require("../social/captions");
const {
  ERROR_CLASSIFICATION,
  ThreadsProviderError,
  verifyThreadsIdentity,
  waitForContainerReady,
  publishThreadsCarousel,
  publishThreadsVideo,
  ThreadsAdapter
} = require("../social/threads");
const {
  VIDEO_TARGETS,
  ALL_TARGET_IDS,
  TARGET_ALIASES,
  canonicalizeTargetId,
  loadVideoTargetsConfig
} = require("../social/video/videoTargets");
const { ThreadsVideoAdapter } = require("../social/video/adapters/threadsVideoAdapter");
const { createDefaultVideoAdapters } = require("../social/video/videoPublisher");
const { publishSocialPlatform } = require("../social/publishing");
const { runDailySocialPipeline } = require("../social/dailyRun");
const { computeManifestDigest } = require("../social/qualityGate");

function createValidCarouselManifest() {
  return {
    schemaVersion: 1,
    publishDate: "2026-09-30",
    contentId: "social-2026-09-30",
    category: "dream_symbols",
    topic: "Water and Ocean Dreams",
    slideCount: 5,
    media: [
      {
        index: 1,
        role: "cover",
        key: "social/2026/09/30/slide-01.jpg",
        url: "https://pub-4169b32ebff84de78189ef9a010baa5c.r2.dev/social/2026/09/30/slide-01.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 25000
      },
      {
        index: 2,
        role: "content",
        key: "social/2026/09/30/slide-02.jpg",
        url: "https://pub-4169b32ebff84de78189ef9a010baa5c.r2.dev/social/2026/09/30/slide-02.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 26000
      },
      {
        index: 3,
        role: "content",
        key: "social/2026/09/30/slide-03.jpg",
        url: "https://pub-4169b32ebff84de78189ef9a010baa5c.r2.dev/social/2026/09/30/slide-03.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 27000
      },
      {
        index: 4,
        role: "content",
        key: "social/2026/09/30/slide-04.jpg",
        url: "https://pub-4169b32ebff84de78189ef9a010baa5c.r2.dev/social/2026/09/30/slide-04.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 28000
      },
      {
        index: 5,
        role: "cta",
        key: "social/2026/09/30/slide-05.jpg",
        url: "https://pub-4169b32ebff84de78189ef9a010baa5c.r2.dev/social/2026/09/30/slide-05.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 29000
      }
    ],
    captions: {
      instagram: "✨ What do water dreams mean? Decode your dreams with Dreamly AI.",
      facebook: "✨ What do water dreams mean? Decode your dreams with Dreamly AI.",
      threads: "✨ What do water dreams mean? Decode your dreams with Dreamly AI.\n\nExplore Dreamly AI → https://dreamlyai.life/"
    }
  };
}

function createValidVideoManifest() {
  return {
    date: "2026-09-30",
    id: "promo-video-2026-09-30",
    type: "video",
    media: [
      {
        url: "https://dreamlyai-backend.vercel.app/videos/promo/1.mp4",
        type: "video/mp4",
        duration: 10,
        aspectRatio: "9:16",
        altText: "Your dreams might be saying more than you think. | Dreamly AI",
        fileName: "1.mp4"
      }
    ],
    destinations: ["threads_dreamly", "pinterest_dreamly", "youtube_dreamly"],
    destinationUrl: "https://dreamlyai.life/dreams",
    captions: {
      instagram: "✨ Explore your dreams with Dreamly AI.",
      facebook: "✨ Explore your dreams with Dreamly AI.",
      threads: "✨ Your dreams say more than you think. Explore with Dreamly AI.\n\nExplore Dreamly AI → https://dreamlyai.life/"
    },
    metadata: {
      series: "dreamly_ai_promo_30",
      sequenceNumber: 1
    }
  };
}

// In-memory Redis Mock
class MockRedis {
  constructor() {
    this.store = new Map();
  }
  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  async set(key, val, options = {}) {
    if (options.nx && this.store.has(key)) return null;
    this.store.set(key, typeof val === "object" ? JSON.stringify(val) : String(val));
    return "OK";
  }
  async del(key) {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }
  async eval(script, keys = [], args = []) {
    const key = Array.isArray(keys) ? keys[0] : keys;
    const expected = Array.isArray(args) ? args[0] : args;
    if (this.store.get(key) === expected) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

describe("Threads Integration Test Suite", () => {
  describe("1. Configuration & Secret Redaction", () => {
    it("loads and validates Threads configuration correctly", () => {
      const config = loadThreadsConfig({
        THREADS_USER_ID: "123456789",
        THREADS_ACCESS_TOKEN: "THA_test_access_token_xyz",
        THREADS_API_VERSION: "v1.0"
      });

      assert.equal(config.userId, "123456789");
      assert.equal(config.accessToken, "THA_test_access_token_xyz");
      assert.equal(config.apiVersion, "v1.0");
      assert.equal(config.enabled, true);

      const val = validateThreadsConfig(config);
      assert.equal(val.valid, true);
      assert.equal(val.errors.length, 0);
    });

    it("fails validation when user ID or token is missing", () => {
      assert.throws(() => {
        loadThreadsConfig({
          THREADS_USER_ID: "",
          THREADS_ACCESS_TOKEN: ""
        });
      }, /Threads configuration invalid/);

      const invalidVal = validateThreadsConfig({ userId: "", accessToken: "" });
      assert.equal(invalidVal.valid, false);
      assert.ok(invalidVal.errors.length >= 2);
    });

    it("redacts access tokens and secrets from strings and objects", () => {
      const secretStr = "Threads error with access_token=THA_secret_token_12345 and THQ98765";
      const redactedStr = redactSecrets(secretStr);
      assert.ok(!redactedStr.includes("THA_secret_token_12345"));
      assert.ok(redactedStr.includes("[REDACTED]"));
      assert.ok(redactedStr.includes("[REDACTED_THREADS_TOKEN]"));

      const secretObj = {
        accessToken: "secret_val",
        platform: "threads",
        details: { token: "secret_token_val" }
      };
      const redactedObj = redactSecrets(secretObj);
      assert.equal(redactedObj.accessToken, "[REDACTED]");
      assert.equal(redactedObj.platform, "threads");
      assert.equal(redactedObj.details.token, "[REDACTED]");

      const secretStr2 = "User THA123456789 posted";
      const redactedStr2 = redactSecrets(secretStr2);
      assert.ok(redactedStr2.includes("[REDACTED_THREADS_TOKEN]"));
    });
  });

  describe("2. Caption Formatting & Character Limits", () => {
    it("formats Threads caption with Dreamly AI CTA and enforces <= 500 chars", () => {
      const caption = formatThreadsCaption({
        baseCaption: "✨ Decoding Water Dreams: Emotional surges and clarity.",
        websiteUrl: "https://dreamlyai.life/"
      });

      assert.ok(caption.includes("Decoding Water Dreams"));
      assert.ok(caption.includes("https://dreamlyai.life/"));
      assert.ok(caption.length <= THREADS_FINAL_CAPTION_MAX);
    });

    it("truncates extremely long text so that final length <= 500 characters", () => {
      const longText = "✨ " + "A".repeat(800) + "\n\n#dreamlyai #dreams";
      const caption = formatThreadsCaption({
        baseCaption: longText,
        websiteUrl: "https://dreamlyai.life/"
      });

      assert.ok(caption.length <= THREADS_FINAL_CAPTION_MAX);
      assert.ok(caption.includes("https://dreamlyai.life/"));
    });

    it("buildPlatformCaptions returns instagram, facebook, and threads captions", () => {
      const manifest = createValidCarouselManifest();
      const result = buildPlatformCaptions(manifest);

      assert.ok(result.instagram);
      assert.ok(result.facebook);
      assert.ok(result.threads);
      assert.ok(result.threads.length <= THREADS_FINAL_CAPTION_MAX);
    });
  });

  describe("3. Identity Verification & Health Check", () => {
    it("successfully verifies identity when Graph API returns user ID", async () => {
      const mockFetch = async (url) => {
        assert.ok(url.includes("/me") || url.includes("/12345"));
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "12345", username: "dreamlyai" })
        };
      };

      const identity = await verifyThreadsIdentity({
        fetchImpl: mockFetch,
        config: { userId: "12345", accessToken: "valid_token" }
      });

      assert.equal(identity.verified, true);
      assert.equal(identity.userId, "12345");
      assert.equal(identity.username, "dreamlyai");
    });

    it("throws ThreadsProviderError when Graph API returns error", async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid OAuth access token", code: 190 } })
      });

      await assert.rejects(
        () => verifyThreadsIdentity({
          fetchImpl: mockFetch,
          config: { userId: "12345", accessToken: "invalid_token" }
        }),
        (err) => {
          assert.equal(err.name, "ThreadsProviderError");
          assert.equal(err.status, 401);
          return true;
        }
      );
    });
  });

  describe("4. Carousel Publishing Flow", () => {
    it("executes full 5-child container creation, readiness polling, parent creation, and publishing", async () => {
      const calls = [];
      const mockFetch = async (url, options) => {
        calls.push({ url, method: options?.method || "GET" });

        if (url.endsWith("/threads") && options?.method === "POST") {
          const body = options.body;
          if (body.includes("media_type=IMAGE")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ id: `child_${calls.length}` })
            };
          }
          if (body.includes("media_type=CAROUSEL")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ id: "parent_carousel_999" })
            };
          }
        }

        if (url.includes("child_") || url.includes("parent_carousel_")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "container_id", status: "FINISHED" })
          };
        }

        if (url.endsWith("/threads_publish") && options?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "published_post_12345" })
          };
        }

        return { ok: false, status: 404, json: async () => ({}) };
      };

      const result = await publishThreadsCarousel({
        manifest: createValidCarouselManifest(),
        fetchImpl: mockFetch,
        config: { userId: "12345", accessToken: "token_abc" }
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
      assert.equal(result.platform, "threads");
      assert.equal(result.postId, "published_post_12345");
      assert.equal(result.containerId, "parent_carousel_999");
    });

    it("classifies network timeout during final publish as AMBIGUOUS_FINAL_PUBLISH", async () => {
      const mockFetch = async (url, options) => {
        if (url.endsWith("/threads_publish")) {
          throw new Error("ETIMEDOUT connecting to graph.threads.net");
        }
        if (url.endsWith("/threads") && options?.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ id: "c_id" }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: "FINISHED" }) };
      };

      await assert.rejects(
        () => publishThreadsCarousel({
          manifest: createValidCarouselManifest(),
          fetchImpl: mockFetch,
          config: { userId: "12345", accessToken: "token_abc" }
        }),
        (err) => {
          assert.equal(err.name, "ThreadsProviderError");
          assert.equal(err.classification, ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH);
          return true;
        }
      );
    });
  });

  describe("5. Video Publishing Flow", () => {
    it("executes single video container creation, readiness polling, and publishing", async () => {
      const calls = [];
      const mockFetch = async (url, options) => {
        calls.push({ url, method: options?.method || "GET" });

        if (url.endsWith("/threads") && options?.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ id: "video_container_777" }) };
        }

        if (url.includes("video_container_777")) {
          return { ok: true, status: 200, json: async () => ({ id: "video_container_777", status: "FINISHED" }) };
        }

        if (url.endsWith("/threads_publish") && options?.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ id: "published_video_post_888" }) };
        }

        return { ok: false, status: 404, json: async () => ({}) };
      };

      const result = await publishThreadsVideo({
        manifest: createValidVideoManifest(),
        fetchImpl: mockFetch,
        config: { userId: "12345", accessToken: "token_abc" }
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
      assert.equal(result.postId, "published_video_post_888");
      assert.equal(result.containerId, "video_container_777");
    });

    it("ThreadsVideoAdapter publishes video and handles checkHealth", async () => {
      const adapter = new ThreadsVideoAdapter("threads_dreamly");
      assert.equal(adapter.targetId, "threads_dreamly");

      const mockFetch = async (url, options) => {
        if (url.includes("?fields=id,username")) {
          return { ok: true, status: 200, json: async () => ({ id: "12345", username: "dreamlyai" }) };
        }
        if (url.endsWith("/threads") && options?.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ id: "vid_c_1" }) };
        }
        if (url.includes("vid_c_1")) {
          return { ok: true, status: 200, json: async () => ({ status: "FINISHED" }) };
        }
        if (url.endsWith("/threads_publish")) {
          return { ok: true, status: 200, json: async () => ({ id: "post_vid_1" }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };

      const health = await adapter.checkHealth({
        config: { userId: "12345", accessToken: "token_abc" },
        fetchFn: mockFetch
      });
      assert.equal(health.healthy, true);
      assert.equal(health.details.username, "dreamlyai");

      const pub = await adapter.publish({
        manifest: createValidVideoManifest(),
        config: { userId: "12345", accessToken: "token_abc" },
        fetchFn: mockFetch
      });
      assert.equal(pub.success, true);
      assert.equal(pub.status, "PUBLISHED");
      assert.equal(pub.postId, "post_vid_1");
    });
  });

  describe("6. Video Targets & Registry", () => {
    it("includes THREADS_DREAMLY in VIDEO_TARGETS and ALL_TARGET_IDS", () => {
      assert.equal(VIDEO_TARGETS.THREADS_DREAMLY, "threads_dreamly");
      assert.ok(ALL_TARGET_IDS.includes("threads_dreamly"));
      assert.equal(canonicalizeTargetId("threads"), "threads_dreamly");
      assert.equal(canonicalizeTargetId("threads_primary"), "threads_dreamly");
      assert.equal(canonicalizeTargetId("threads_dreamly"), "threads_dreamly");
    });

    it("registers ThreadsVideoAdapter in default adapters map", () => {
      const adapters = createDefaultVideoAdapters();
      assert.ok(adapters[VIDEO_TARGETS.THREADS_DREAMLY] instanceof ThreadsVideoAdapter);
    });

    it("loads Threads configuration in loadVideoTargetsConfig", () => {
      const configs = loadVideoTargetsConfig({
        THREADS_USER_ID: "999888",
        THREADS_ACCESS_TOKEN: "THA_token_123"
      });

      const threadsConfig = configs[VIDEO_TARGETS.THREADS_DREAMLY];
      assert.ok(threadsConfig);
      assert.equal(threadsConfig.platform, "threads");
      assert.equal(threadsConfig.userId, "999888");
      assert.equal(threadsConfig.accessToken, "THA_token_123");
    });
  });

  describe("7. Social Publishing Orchestrator with Threads", () => {
    it("claims lease and publishes Threads carousel", async () => {
      const redis = new MockRedis();
      const manifest = createValidCarouselManifest();
      const publishDate = "2026-09-30";

      // Seed prepared state, manifest, and quality gate PASS
      await redis.set(
        `social:prepare:${publishDate}`,
        JSON.stringify({
          stateVersion: 1,
          publishDate,
          contentId: `social-${publishDate}`,
          status: "PREPARED"
        })
      );
      await redis.set(`social:manifest:${publishDate}`, JSON.stringify(manifest));

      const digest = computeManifestDigest(manifest);
      await redis.set(
        `social:quality:${publishDate}`,
        JSON.stringify({
          stateVersion: 1,
          publishDate,
          contentId: `social-${publishDate}`,
          status: "PASS",
          manifestDigest: digest,
          creativeDigest: "a".repeat(64),
          finalCaptionsDigest: "b".repeat(64),
          errorCodes: []
        })
      );

      const mockFetch = async (url, options) => {
        if (url.endsWith("/threads") && options?.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ id: "cont_1" }) };
        }
        if (url.includes("cont_1")) {
          return { ok: true, status: 200, json: async () => ({ status: "FINISHED" }) };
        }
        if (url.endsWith("/threads_publish")) {
          return { ok: true, status: 200, json: async () => ({ id: "post_threads_999" }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };

      const result = await publishSocialPlatform({
        publishDate,
        destination: "threads",
        leaseId: "test-lease-123",
        redis,
        fetchImpl: mockFetch,
        threadsConfig: { userId: "12345", accessToken: "valid_token" }
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
      assert.equal(result.platform, "threads");
      assert.equal(result.providerId, "post_threads_999");

      // Verify second invocation is idempotent (ALREADY_PUBLISHED)
      const secondResult = await publishSocialPlatform({
        publishDate,
        destination: "threads",
        leaseId: "test-lease-456",
        redis,
        fetchImpl: mockFetch,
        threadsConfig: { userId: "12345", accessToken: "valid_token" }
      });

      assert.equal(secondResult.success, true);
      assert.equal(secondResult.status, "ALREADY_PUBLISHED");
    });
  });

  describe("8. Daily Run Integration with Threads", () => {
    it("includes Threads in publishing output and execution", async () => {
      const redis = new MockRedis();
      const publishDate = "2026-09-30";

      const mockFetch = async (url, options) => {
        if (url.includes("graph.threads.net") || url.includes("graph.facebook.com")) {
          if (options?.method === "POST") {
            return { ok: true, status: 200, json: async () => ({ id: "mock_created_id" }) };
          }
          return { ok: true, status: 200, json: async () => ({ id: "mock_status_id", status: "FINISHED", status_code: "FINISHED" }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const mockGenerateText = async () => JSON.stringify({
        topic: "Dream Meaning of Flying",
        slides: [
          { role: "cover", headline: "Why You Dream of Flying", subheadline: "Explore subconscious freedom" },
          { role: "content", title: "Emotional Lift", body: "Flying dreams reflect high energy and ambition." },
          { role: "content", title: "Lucid Control", body: "Gaining control of your night flight." },
          { role: "content", title: "Spiritual Perspective", body: "Releasing burdens and finding clarity." },
          { role: "cta", headline: "Decode Your Night Flight", body: "Discover what your mind is telling you." }
        ],
        captions: {
          instagram: "✨ What does flying in a dream mean?",
          facebook: "✨ What does flying in a dream mean?"
        }
      });

      const mockR2Client = {
        send: async () => ({ ETag: '"test-etag"' })
      };

      const result = await runDailySocialPipeline({
        publishDate,
        redis,
        generateText: mockGenerateText,
        r2Client: mockR2Client,
        r2Config: {
          accountId: "test",
          accessKeyId: "test",
          secretAccessKey: "test",
          bucketName: "test",
          publicBaseUrl: "https://pub-4169b32ebff84de78189ef9a010baa5c.r2.dev"
        },
        fetchImpl: mockFetch,
        facebookConfig: { pageId: "12345", pageAccessToken: "fb_token" },
        facebookSecondaryConfig: null,
        instagramConfig: { pageId: "12345", pageAccessToken: "fb_token", instagramBusinessAccountId: "54321" },
        instagramSecondaryConfig: null,
        threadsConfig: { userId: "999888", accessToken: "th_token" }
      });

      assert.equal(result.preparation.success, true);
      assert.ok(result.publishing.facebook_primary);
      assert.ok(result.publishing.instagram_primary);
      assert.ok(result.publishing.threads);
      assert.equal(result.publishing.threads.success, true);
      assert.equal(result.publishing.threads.status, "PUBLISHED");
    });
  });
});
