/**
 * Dreamly AI Video Publishing Orchestrator and Platform Adapter Tests
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { getVideoManifestBySequence } = require("../social/video/videoRegistry");
const { VIDEO_TARGETS } = require("../social/video/videoTargets");
const { executeVideoPublishing } = require("../social/video/videoPublisher");
const { runDailyVideoPipeline } = require("../social/video/videoRun");
const {
  VIDEO_PUBLISH_STATUS,
  getVideoTargetState,
  buildVideoTargetStateKey,
  buildVideoTargetLeaseKey
} = require("../social/video/videoState");

// Mock in-memory Redis client
class MockRedis {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const val = this.store.get(key);
    return val !== undefined ? val : null;
  }

  async set(key, value, ...args) {
    // Handle EX and NX
    let isNx = false;
    if (args.includes("NX") || args.includes("nx") || (args[0] && args[0].nx)) {
      isNx = true;
    }
    if (isNx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    return "OK";
  }

  async del(key) {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async eval(script, numKeys, key, arg) {
    const current = this.store.get(key);
    if (current === arg) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

describe("Dreamly AI Video Publishing Pipeline", () => {
  const sampleManifest = getVideoManifestBySequence(1);

  it("1. Dry-run execution performs zero network writes and makes zero Redis state mutations", async () => {
    const redis = new MockRedis();
    const manifest = sampleManifest;

    const dryRunResult = await executeVideoPublishing({
      manifest,
      publishDate: "2026-09-28",
      redis,
      dryRun: true
    });

    assert.equal(dryRunResult.success, true);
    assert.equal(dryRunResult.dryRun, true);
    assert.equal(redis.store.size, 0, "Dry-run must not mutate Redis");

    // All 9 targets should be checked
    const targetKeys = Object.keys(dryRunResult.targets);
    assert.equal(targetKeys.length, 9);
  });

  it("2. Multi-target publishing succeeds across all 9 targets with isolated state", async () => {
    const redis = new MockRedis();
    const manifest = sampleManifest;

    const mockAdapters = {
      pinterest_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "pin_dreamly_101" })
      },
      youtube_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "yt_dreamly_202" })
      },
      instagram_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "ig_dreamly_203" })
      },
      facebook_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "fb_dreamly_204" })
      },
      threads_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "th_dreamly_205" })
      },
      instagram_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "ig_lifemode_303" })
      },
      facebook_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "fb_lifemode_404" })
      },
      youtube_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "yt_lifemode_505" })
      },
      pinterest_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "pin_lifemode_606" })
      }
    };

    const result = await executeVideoPublishing({
      manifest,
      publishDate: "2026-09-28",
      redis,
      adapters: mockAdapters
    });

    assert.equal(result.success, true);
    assert.equal(result.targets.pinterest_dreamly.status, "PUBLISHED");
    assert.equal(result.targets.pinterest_dreamly.postId, "pin_dreamly_101");
    assert.equal(result.targets.youtube_dreamly.status, "PUBLISHED");
    assert.equal(result.targets.youtube_dreamly.postId, "yt_dreamly_202");
    assert.equal(result.targets.instagram_dreamly.status, "PUBLISHED");
    assert.equal(result.targets.instagram_dreamly.postId, "ig_dreamly_203");
    assert.equal(result.targets.facebook_dreamly.status, "PUBLISHED");
    assert.equal(result.targets.facebook_dreamly.postId, "fb_dreamly_204");
    assert.equal(result.targets.threads_dreamly.status, "PUBLISHED");
    assert.equal(result.targets.threads_dreamly.postId, "th_dreamly_205");
    assert.equal(result.targets.instagram_lifemode.status, "PUBLISHED");
    assert.equal(result.targets.instagram_lifemode.postId, "ig_lifemode_303");
    assert.equal(result.targets.facebook_lifemode.status, "PUBLISHED");
    assert.equal(result.targets.facebook_lifemode.postId, "fb_lifemode_404");
    assert.equal(result.targets.youtube_lifemode.status, "PUBLISHED");
    assert.equal(result.targets.youtube_lifemode.postId, "yt_lifemode_505");
    assert.equal(result.targets.pinterest_lifemode.status, "PUBLISHED");
    assert.equal(result.targets.pinterest_lifemode.postId, "pin_lifemode_606");

    // Verify Redis persisted state is isolated under social:video:...
    const savedPinDreamly = await getVideoTargetState(redis, "2026-09-28", "pinterest_dreamly");
    assert.ok(savedPinDreamly);
    assert.equal(savedPinDreamly.status, "PUBLISHED");
    assert.equal(savedPinDreamly.postId, "pin_dreamly_101");

    const savedIgDreamly = await getVideoTargetState(redis, "2026-09-28", "instagram_dreamly");
    assert.ok(savedIgDreamly);
    assert.equal(savedIgDreamly.status, "PUBLISHED");
    assert.equal(savedIgDreamly.postId, "ig_dreamly_203");

    // Ensure carousel keys are NOT touched
    assert.equal(await redis.get("social:publish:2026-09-28:facebook_primary"), null);
    assert.equal(await redis.get("social:publish:2026-09-28:instagram_primary"), null);
  });

  it("3. Partial failure & retry idempotency: Retries only failed targets without republishing successful ones", async () => {
    const redis = new MockRedis();
    const manifest = sampleManifest;

    let pinCallCount = 0;
    let ytCallCount = 0;
    let igCallCount = 0;

    const mockAdapters = {
      pinterest_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => {
          pinCallCount++;
          return { success: true, status: "PUBLISHED", postId: "pin_ok_1" };
        }
      },
      youtube_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => {
          ytCallCount++;
          return { success: true, status: "PUBLISHED", postId: "yt_ok_1" };
        }
      },
      instagram_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "ig_dreamly_ok" })
      },
      facebook_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "fb_dreamly_ok" })
      },
      threads_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "th_dreamly_ok" })
      },
      instagram_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => {
          igCallCount++;
          if (igCallCount === 1) {
            // First run fails
            return { success: false, status: "FAILED", error: { message: "Instagram temporary rate limit" } };
          }
          // Retry succeeds
          return { success: true, status: "PUBLISHED", postId: "ig_ok_retry" };
        }
      },
      facebook_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "fb_ok_1" })
      },
      youtube_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "yt2_ok_1" })
      },
      pinterest_lifemode: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({ success: true, status: "PUBLISHED", postId: "pin2_ok_1" })
      }
    };

    // RUN 1: Instagram fails, others succeed
    const run1 = await executeVideoPublishing({
      manifest,
      publishDate: "2026-09-28",
      redis,
      adapters: mockAdapters
    });

    assert.equal(run1.success, false);
    assert.equal(run1.targets.pinterest_dreamly.status, "PUBLISHED");
    assert.equal(run1.targets.youtube_dreamly.status, "PUBLISHED");
    assert.equal(run1.targets.instagram_lifemode.status, "FAILED");
    assert.equal(pinCallCount, 1);
    assert.equal(ytCallCount, 1);
    assert.equal(igCallCount, 1);

    // RUN 2 (Retry): Should skip pinterest_dreamly and youtube_dreamly (already published), and only invoke instagram_lifemode!
    const run2 = await executeVideoPublishing({
      manifest,
      publishDate: "2026-09-28",
      redis,
      adapters: mockAdapters
    });

    assert.equal(run2.success, true);
    assert.equal(run2.targets.pinterest_dreamly.status, "ALREADY_PUBLISHED");
    assert.equal(run2.targets.youtube_dreamly.status, "ALREADY_PUBLISHED");
    assert.equal(run2.targets.instagram_lifemode.status, "PUBLISHED");
    assert.equal(run2.targets.instagram_lifemode.postId, "ig_ok_retry");

    // Verify adapter call counts: pin and yt were NOT called again!
    assert.equal(pinCallCount, 1, "Pinterest must not be republished during retry");
    assert.equal(ytCallCount, 1, "YouTube must not be republished during retry");
    assert.equal(igCallCount, 2, "Instagram should be retried");
  });

  it("4. Ambiguous transport failure sets RECONCILIATION_REQUIRED and prevents automatic re-dispatch", async () => {
    const redis = new MockRedis();
    const manifest = sampleManifest;

    const mockAdapters = {
      pinterest_dreamly: {
        validateConfig: () => ({ valid: true }),
        publish: async () => ({
          success: false,
          status: "RECONCILIATION_REQUIRED",
          error: { message: "Network timeout during upload PUT" }
        })
      },
      youtube_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "yt1" }) },
      instagram_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "ig_d" }) },
      facebook_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "fb_d" }) },
      threads_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "th_d" }) },
      instagram_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "ig1" }) },
      facebook_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "fb1" }) },
      youtube_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "yt2" }) },
      pinterest_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "pin2" }) }
    };

    const run1 = await executeVideoPublishing({
      manifest,
      publishDate: "2026-09-28",
      redis,
      adapters: mockAdapters
    });

    assert.equal(run1.targets.pinterest_dreamly.status, "RECONCILIATION_REQUIRED");

    // Second run should recognize RECONCILIATION_REQUIRED and skip re-calling adapter
    let pinCalls = 0;
    mockAdapters.pinterest_dreamly.publish = async () => { pinCalls++; return { success: true, status: "PUBLISHED", postId: "pin_recon" }; };

    const run2 = await executeVideoPublishing({
      manifest,
      publishDate: "2026-09-28",
      redis,
      adapters: mockAdapters
    });

    assert.equal(run2.targets.pinterest_dreamly.status, "RECONCILIATION_REQUIRED");
    assert.equal(pinCalls, 0, "Adapter must not be called when state is RECONCILIATION_REQUIRED");
  });

  it("5. End-to-end runDailyVideoPipeline integrates seamlessly with manifest selection", async () => {
    const redis = new MockRedis();

    const mockAdapters = {
      pinterest_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "p1" }) },
      youtube_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "y1" }) },
      instagram_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "igd1" }) },
      facebook_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "fbd1" }) },
      threads_dreamly: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "thd1" }) },
      instagram_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "i1" }) },
      facebook_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "f1" }) },
      youtube_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "y2" }) },
      pinterest_lifemode: { validateConfig: () => ({ valid: true }), publish: async () => ({ success: true, status: "PUBLISHED", postId: "p2" }) }
    };

    const result = await runDailyVideoPipeline({
      publishDate: "2026-09-29",
      redis,
      adapters: mockAdapters
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.publishDate, "2026-09-29");
    assert.equal(result.sequenceNumber, 2);
    assert.equal(result.videoFileName, "2.mp4");
  });

  it("6. PinterestVideoAdapter.publish() includes cover_image_key_frame_time in media_source payload", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_dreamly");

    let capturedPinPayload = null;
    const mockFetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ media_id: "m_12345", upload_url: "https://mock.upload.url", upload_parameters: {} })
        };
      }
      if (u.endsWith("/2.mp4") || u.endsWith(".mp4")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from("mock video data")
        };
      }
      if (u.includes("mock.upload.url")) {
        return { ok: true, status: 204 };
      }
      if (u.includes("/media/m_12345")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "succeeded" })
        };
      }
      if (u.endsWith("/pins")) {
        capturedPinPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "pin_test_9999" })
        };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    const manifest = getVideoManifestBySequence(2);
    const config = {
      boardId: "board_123",
      accessToken: "token_abc",
      accessTier: "standard"
    };

    const pubResult = await adapter.publish({
      manifest,
      config,
      fetchFn: mockFetch
    });

    assert.equal(pubResult.success, true);
    assert.equal(pubResult.status, "PUBLISHED");
    assert.equal(pubResult.postId, "pin_test_9999");
    assert.ok(capturedPinPayload, "Pin payload must be sent to /pins");
    assert.equal(capturedPinPayload.media_source.source_type, "video_id");
    assert.equal(capturedPinPayload.media_source.media_id, "m_12345");
    assert.equal(capturedPinPayload.media_source.cover_image_key_frame_time, 0);
  });

  it("7. PinterestVideoAdapter waits between polling attempts until media is succeeded", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_dreamly");

    let mediaPollCount = 0;
    const sleptIntervals = [];
    const mockSleep = async (ms) => {
      sleptIntervals.push(ms);
    };

    const mockFetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ media_id: "m_poll_1", upload_url: "https://mock.upload.url", upload_parameters: {} })
        };
      }
      if (u.endsWith("/2.mp4") || u.endsWith(".mp4")) {
        return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") };
      }
      if (u.includes("mock.upload.url")) {
        return { ok: true, status: 204 };
      }
      if (u.includes("/media/m_poll_1")) {
        mediaPollCount++;
        // Return processing on attempts 1 and 2, then succeeded on attempt 3
        if (mediaPollCount < 3) {
          return { ok: true, status: 200, json: async () => ({ status: "processing" }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: "succeeded" }) };
      }
      if (u.endsWith("/pins")) {
        return { ok: true, status: 201, json: async () => ({ id: "pin_polled_ok" }) };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    const manifest = getVideoManifestBySequence(2);
    const config = {
      boardId: "board_123",
      accessToken: "token_abc",
      accessTier: "standard",
      pollMaxAttempts: 5,
      pollIntervalMs: 2000
    };

    const result = await adapter.publish({
      manifest,
      config,
      fetchFn: mockFetch,
      sleepFn: mockSleep
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.postId, "pin_polled_ok");
    assert.equal(mediaPollCount, 3, "Should have polled 3 times before succeeding");
    assert.deepEqual(sleptIntervals, [2000, 2000], "Should have slept 2000ms after attempt 1 and 2");
  });

  it("8. PinterestVideoAdapter fails cleanly when media never reaches succeeded state without calling /pins", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_dreamly");

    let pinCalled = false;
    let mediaPollCount = 0;
    const sleptIntervals = [];
    const mockSleep = async (ms) => {
      sleptIntervals.push(ms);
    };

    const mockFetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ media_id: "m_timeout_1", upload_url: "https://mock.upload.url", upload_parameters: {} })
        };
      }
      if (u.endsWith("/2.mp4") || u.endsWith(".mp4")) {
        return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") };
      }
      if (u.includes("mock.upload.url")) {
        return { ok: true, status: 204 };
      }
      if (u.includes("/media/m_timeout_1")) {
        mediaPollCount++;
        return { ok: true, status: 200, json: async () => ({ status: "processing" }) };
      }
      if (u.endsWith("/pins")) {
        pinCalled = true;
        return { ok: true, status: 201, json: async () => ({ id: "pin_never_reached" }) };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    const manifest = getVideoManifestBySequence(2);
    const config = {
      boardId: "board_123",
      accessToken: "token_abc",
      accessTier: "standard",
      pollMaxAttempts: 3,
      pollIntervalMs: 1000
    };

    const result = await adapter.publish({
      manifest,
      config,
      fetchFn: mockFetch,
      sleepFn: mockSleep
    });

    assert.equal(result.success, false);
    assert.equal(result.status, "FAILED");
    assert.equal(pinCalled, false, "Must NOT attempt /pins when media never reaches succeeded state");
    assert.equal(mediaPollCount, 3, "Should have polled up to max attempts");
    assert.deepEqual(sleptIntervals, [1000, 1000], "Should sleep between attempts 1-2 and 2-3");
    assert.ok(result.error?.message.includes("timed out"), "Error message should mention timeout");
  });

  it("9. Dreamly Pinterest Pin payload strictly enforces the exact Google Play destination URL", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_dreamly");

    let capturedPinPayload = null;
    const mockFetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ media_id: "m_playstore_test", upload_url: "https://mock.upload.url", upload_parameters: {} })
        };
      }
      if (u.endsWith("/1.mp4") || u.endsWith(".mp4")) {
        return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") };
      }
      if (u.includes("mock.upload.url")) {
        return { ok: true, status: 204 };
      }
      if (u.includes("/media/m_playstore_test")) {
        return { ok: true, status: 200, json: async () => ({ status: "succeeded" }) };
      }
      if (u.endsWith("/pins")) {
        capturedPinPayload = JSON.parse(opts.body);
        return { ok: true, status: 201, json: async () => ({ id: "pin_dreamly_play_ok" }) };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    // Even if manifest destinationUrl is a generic website
    const customManifest = {
      ...sampleManifest,
      destinationUrl: "https://dreamly.life/",
      captions: {
        pinterest: {
          title: "Dream Meaning Test",
          description: "Explore dreams with Dreamly AI",
          link: "https://dreamly.life/" // Should be replaced with Google Play URL for pinterest_dreamly
        }
      }
    };

    const config = {
      boardId: "board_dreamly_abc",
      accessToken: "token_dreamly_xyz",
      accessTier: "standard"
    };

    const result = await adapter.publish({
      manifest: customManifest,
      config,
      fetchFn: mockFetch
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.postId, "pin_dreamly_play_ok");
    assert.ok(capturedPinPayload, "Pin payload must have been sent");
    assert.equal(
      capturedPinPayload.link,
      "https://play.google.com/store/apps/details?id=com.oberon.dreamlyai&pli=1",
      "Dreamly Pinterest Pin destination URL must be exact Google Play link"
    );
    assert.equal(capturedPinPayload.board_id, "board_dreamly_abc");
  });

  it("10. Dreamly Pinterest media processing polling tolerates >8 attempts without failing", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_dreamly");

    let mediaPollCount = 0;
    const sleptIntervals = [];
    const mockSleep = async (ms) => {
      sleptIntervals.push(ms);
    };

    const mockFetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ media_id: "m_long_poll", upload_url: "https://mock.upload.url", upload_parameters: {} })
        };
      }
      if (u.endsWith("/1.mp4") || u.endsWith(".mp4")) {
        return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") };
      }
      if (u.includes("mock.upload.url")) {
        return { ok: true, status: 204 };
      }
      if (u.includes("/media/m_long_poll")) {
        mediaPollCount++;
        // Keep in processing for 14 attempts, succeeds on attempt 15 (exceeding old limit of 8)
        if (mediaPollCount < 15) {
          return { ok: true, status: 200, json: async () => ({ status: "processing" }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: "succeeded" }) };
      }
      if (u.endsWith("/pins")) {
        return { ok: true, status: 201, json: async () => ({ id: "pin_long_poll_ok" }) };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    const config = {
      boardId: "board_dreamly_abc",
      accessToken: "token_dreamly_xyz",
      accessTier: "standard"
      // Default 25 attempts x 3000ms should be used automatically
    };

    const result = await adapter.publish({
      manifest: sampleManifest,
      config,
      fetchFn: mockFetch,
      sleepFn: mockSleep
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.postId, "pin_long_poll_ok");
    assert.equal(mediaPollCount, 15, "Should have successfully polled 15 times");
    assert.equal(sleptIntervals.length, 14, "Should have slept 14 times");
    assert.equal(sleptIntervals[0], 3000, "Default poll interval should be 3000ms");
  });

  it("11. LifeMode Pinterest publishes to LifeMode board and preserves LifeMode destination link", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_lifemode");

    let capturedPinPayload = null;
    const mockFetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ media_id: "m_lifemode_1", upload_url: "https://mock.upload.url", upload_parameters: {} })
        };
      }
      if (u.endsWith("/1.mp4") || u.endsWith(".mp4")) {
        return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") };
      }
      if (u.includes("mock.upload.url")) {
        return { ok: true, status: 204 };
      }
      if (u.includes("/media/m_lifemode_1")) {
        return { ok: true, status: 200, json: async () => ({ status: "succeeded" }) };
      }
      if (u.endsWith("/pins")) {
        capturedPinPayload = JSON.parse(opts.body);
        return { ok: true, status: 201, json: async () => ({ id: "pin_lifemode_888" }) };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    const config = {
      boardId: "board_lifemode_789",
      accessToken: "token_lifemode_with_boards_write",
      accessTier: "standard"
    };

    const result = await adapter.publish({
      manifest: sampleManifest,
      config,
      fetchFn: mockFetch
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.postId, "pin_lifemode_888");
    assert.ok(capturedPinPayload);
    assert.equal(capturedPinPayload.board_id, "board_lifemode_789");
    assert.equal(
      capturedPinPayload.link,
      sampleManifest.captions.pinterest_secondary.link,
      "LifeMode Pinterest should preserve its own destination link"
    );
  });

  it("12. LifeMode Pinterest surfaces OAuth permission 403 Forbidden error cleanly", async () => {
    const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
    const adapter = new PinterestVideoAdapter("pinterest_lifemode");

    const mockFetch = async (url) => {
      const u = String(url);
      if (u.endsWith("/media")) {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            code: 403,
            message: "Your token does not have sufficient permissions to perform this operation. Missing: ['boards:write']"
          })
        };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };

    const config = {
      boardId: "board_lifemode_789",
      accessToken: "token_missing_boards_write",
      accessTier: "standard"
    };

    const result = await adapter.publish({
      manifest: sampleManifest,
      config,
      fetchFn: mockFetch
    });

    assert.equal(result.success, false);
    assert.equal(result.status, "FAILED");
    assert.equal(result.targetId, "pinterest_lifemode");
    assert.ok(result.error?.message?.includes("boards:write") || result.error?.message?.includes("permissions"));
  });
});
