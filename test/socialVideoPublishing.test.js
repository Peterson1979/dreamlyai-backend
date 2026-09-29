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

    // All 6 targets should be checked
    const targetKeys = Object.keys(dryRunResult.targets);
    assert.equal(targetKeys.length, 6);
  });

  it("2. Multi-target publishing succeeds across all 6 targets with isolated state", async () => {
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
});
