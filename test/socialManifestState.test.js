// test/socialManifestState.test.js
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { buildPreparedContent } = require("../social/contentSchema");
const { renderCarousel } = require("../social/renderer");
const { loadR2Config } = require("../social/storageConfig");
const { uploadRenderedCarousel } = require("../social/storage");
const { buildManifest, validateManifest } = require("../social/manifest");
const {
  SOCIAL_STATE_VERSION,
  PREPARATION_STATUS,
  PUBLICATION_STATUS,
  saveManifest,
  getManifest,
  getPreparationState,
  claimPreparation,
  completePreparation,
  failPreparation,
  getPublicationState,
  claimPublication,
  markPublicationPublished,
  markPublicationFailed,
  markPublicationReconciliationRequired,
  safeReleaseLease
} = require("../social/state");
const { MockRedis } = require("./helpers/mockRedis");

function createMockEnv() {
  return {
    R2_ACCOUNT_ID: "mock_account_12345",
    R2_ACCESS_KEY_ID: "mock_access_key_abcde",
    R2_SECRET_ACCESS_KEY: "mock_secret_key_xyz987",
    R2_BUCKET_NAME: "dreamlyai-social-media",
    R2_PUBLIC_BASE_URL: "https://media.dreamlyai.com"
  };
}

function createValidCreativePayload(overrides = {}) {
  return {
    topic: overrides.topic || "Water and Ocean Dreams",
    slides: overrides.slides || [
      {
        role: "cover",
        headline: "What Does It Mean When You Dream of Oceans?",
        subheadline: "Explore the psychological symbolism of deep water in dreams."
      },
      {
        role: "content",
        title: "Calm Waters & Peace",
        body: "Tranquil oceans in dreams may reflect inner emotional clarity and a sense of calm in waking life."
      },
      {
        role: "content",
        title: "Turbulent Waves & Stress",
        body: "High waves and stormy seas can symbolize feeling overwhelmed by recent emotional challenges."
      },
      {
        role: "content",
        title: "Diving into the Depths",
        body: "Exploring underwater realms might suggest readiness to uncover subconscious thoughts and memories."
      },
      {
        role: "cta",
        headline: "Track Your Dreams Tonight",
        body: "Reflect on your nighttime thoughts and journal with DreamlyAI."
      }
    ],
    captions: overrides.captions || {
      instagram: "Have you ever dreamed of open water? Water often reflects our emotional state. What was your most memorable water dream? #dreamlyai #dreamsymbols",
      facebook: "Water in dreams often mirrors our emotional landscape. Calm seas may signify clarity, while stormy waters can indicate stress. What have your dreams looked like lately?"
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

async function createValidStorageResult(preparedContent) {
  const rendered = await renderCarousel(preparedContent);
  const mockS3 = new MockS3Client();
  const config = loadR2Config(createMockEnv());
  return await uploadRenderedCarousel({
    preparedContent,
    renderedCarousel: rendered,
    client: mockS3,
    config
  });
}

describe("Social Manifest & State Layer", () => {
  let redis;

  beforeEach(() => {
    redis = new MockRedis();
  });

  describe("Manifest Creation & Validation", () => {
    it("1. valid manifest builds successfully", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);

      const manifest = buildManifest({ preparedContent, storageResult });
      assert.equal(manifest.schemaVersion, 1);
      assert.equal(manifest.publishDate, "2026-08-28");
      assert.equal(manifest.contentId, "social-2026-08-28");
      assert.equal(manifest.category, "dream_symbols");
      assert.equal(manifest.topic, "Water and Ocean Dreams");
      assert.equal(manifest.slideCount, 5);
      assert.equal(manifest.media.length, 5);
      assert.equal(typeof manifest.captions.instagram, "string");
      assert.equal(typeof manifest.captions.facebook, "string");
    });

    it("2. manifest validates successfully", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const manifest = buildManifest({ preparedContent, storageResult });

      const res = validateManifest(manifest);
      assert.equal(res.valid, true);
      assert.deepEqual(res.errors, []);
    });

    it("3. same inputs generate deeply identical manifest", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResultA = await createValidStorageResult(preparedContent);
      const storageResultB = await createValidStorageResult(preparedContent);

      const manifestA = buildManifest({ preparedContent, storageResult: storageResultA });
      const manifestB = buildManifest({ preparedContent, storageResult: storageResultB });

      assert.deepEqual(manifestA, manifestB);
    });

    it("4. manifest contains no Buffer", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const manifest = buildManifest({ preparedContent, storageResult });

      for (const item of manifest.media) {
        assert.equal("buffer" in item, false);
      }
      assert.equal(JSON.stringify(manifest).includes("Buffer"), false);
    });

    it("5. wrong media count fails", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const badStorage = { ...storageResult, slideCount: 4, media: storageResult.media.slice(0, 4) };

      assert.throws(
        () => buildManifest({ preparedContent, storageResult: badStorage }),
        /slideCount must be 5|media must be an array of length 5/i
      );

      const manifest = buildManifest({ preparedContent, storageResult });
      const badManifest = { ...manifest, media: manifest.media.slice(0, 4) };
      assert.equal(validateManifest(badManifest).valid, false);
    });

    it("6. wrong slide index fails", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const badStorage = {
        ...storageResult,
        media: storageResult.media.map((m, i) => (i === 1 ? { ...m, index: 3 } : m))
      };

      assert.throws(
        () => buildManifest({ preparedContent, storageResult: badStorage }),
        /media\[1\] index must be 2/i
      );
    });

    it("7. wrong media role fails", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const badStorage = {
        ...storageResult,
        media: storageResult.media.map((m, i) => (i === 0 ? { ...m, role: "content" } : m))
      };

      assert.throws(
        () => buildManifest({ preparedContent, storageResult: badStorage }),
        /media\[0\] role must be 'cover'/i
      );
    });

    it("8. wrong deterministic key fails", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const badStorage = {
        ...storageResult,
        media: storageResult.media.map((m, i) =>
          i === 0 ? { ...m, key: "social/2026/08/28/custom-key.jpg" } : m
        )
      };

      assert.throws(
        () => buildManifest({ preparedContent, storageResult: badStorage }),
        /key must be 'social\/2026\/08\/28\/slide-01.jpg'/i
      );
    });

    it("9. non-HTTPS media URL fails", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const badStorage = {
        ...storageResult,
        media: storageResult.media.map((m, i) =>
          i === 0 ? { ...m, url: "http://media.dreamlyai.com/social/2026/08/28/slide-01.jpg" } : m
        )
      };

      assert.throws(
        () => buildManifest({ preparedContent, storageResult: badStorage }),
        /must use HTTPS/i
      );
    });

    it("10. wrong dimensions fail", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const badStorage = {
        ...storageResult,
        media: storageResult.media.map((m, i) => (i === 0 ? { ...m, width: 1000 } : m))
      };

      assert.throws(
        () => buildManifest({ preparedContent, storageResult: badStorage }),
        /width must be 1080/i
      );
    });

    it("11. unexpected manifest field fails", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const manifest = buildManifest({ preparedContent, storageResult });
      const badManifest = { ...manifest, extraTopLevelField: "forbidden" };

      const res = validateManifest(badManifest);
      assert.equal(res.valid, false);
      assert.match(res.errors.join(" "), /unexpected top-level field 'extraTopLevelField'/i);
    });
  });

  describe("Manifest Persistence", () => {
    it("12. first save returns CREATED", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const manifest = buildManifest({ preparedContent, storageResult });

      const res = await saveManifest({ redis, manifest });
      assert.deepEqual(res, { status: "CREATED" });
    });

    it("13. identical second save returns EXISTS_IDENTICAL", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const manifest = buildManifest({ preparedContent, storageResult });

      await saveManifest({ redis, manifest });
      const res2 = await saveManifest({ redis, manifest });
      assert.deepEqual(res2, { status: "EXISTS_IDENTICAL" });
    });

    it("14. different manifest for same date fails closed", async () => {
      const preparedA = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload({ topic: "Topic A" })
      });
      const storageA = await createValidStorageResult(preparedA);
      const manifestA = buildManifest({ preparedContent: preparedA, storageResult: storageA });

      const preparedB = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload({ topic: "Topic B" })
      });
      const storageB = await createValidStorageResult(preparedB);
      const manifestB = buildManifest({ preparedContent: preparedB, storageResult: storageB });

      await saveManifest({ redis, manifest: manifestA });

      await assert.rejects(
        async () => saveManifest({ redis, manifest: manifestB }),
        /Manifest conflict/i
      );
    });

    it("15. getManifest returns valid stored manifest", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const storageResult = await createValidStorageResult(preparedContent);
      const manifest = buildManifest({ preparedContent, storageResult });

      await saveManifest({ redis, manifest });
      const retrieved = await getManifest({ redis, publishDate: "2026-08-28" });
      assert.deepEqual(retrieved, manifest);

      const missing = await getManifest({ redis, publishDate: "2026-08-29" });
      assert.equal(missing, null);
    });

    it("16. corrupt stored manifest throws", async () => {
      await redis.set("social:manifest:2026-08-28", "{ invalid JSON");
      await assert.rejects(
        async () => getManifest({ redis, publishDate: "2026-08-28" }),
        /Corrupt stored manifest JSON/i
      );

      await redis.set("social:manifest:2026-08-28", JSON.stringify({ schemaVersion: 999 }));
      await assert.rejects(
        async () => getManifest({ redis, publishDate: "2026-08-28" }),
        /Invalid stored manifest/i
      );
    });
  });

  describe("Preparation State & Lease Management", () => {
    it("17. first claimPreparation acquires lease and stores PREPARING", async () => {
      const res = await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      assert.equal(res.acquired, true);

      const state = await getPreparationState({ redis, publishDate: "2026-08-28" });
      assert.equal(state.stateVersion, 1);
      assert.equal(state.publishDate, "2026-08-28");
      assert.equal(state.contentId, "social-2026-08-28");
      assert.equal(state.status, PREPARATION_STATUS.PREPARING);
    });

    it("18. concurrent second lease cannot acquire", async () => {
      await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      const res2 = await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-2"
      });

      assert.equal(res2.acquired, false);
      assert.equal(res2.reason, "LEASE_HELD");
    });

    it("19. completePreparation produces PREPARED", async () => {
      await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      const completed = await completePreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      assert.equal(completed.status, PREPARATION_STATUS.PREPARED);

      const state = await getPreparationState({ redis, publishDate: "2026-08-28" });
      assert.equal(state.status, PREPARATION_STATUS.PREPARED);

      // Lease was released
      const lease = await redis.get("social:lease:prepare:2026-08-28");
      assert.equal(lease, null);
    });

    it("20. already PREPARED cannot be claimed again", async () => {
      await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });
      await completePreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      const res = await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-2"
      });

      assert.equal(res.acquired, false);
      assert.equal(res.reason, "ALREADY_PREPARED");
    });

    it("21. failPreparation produces FAILED", async () => {
      await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      const failed = await failPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      assert.equal(failed.status, PREPARATION_STATUS.FAILED);

      const state = await getPreparationState({ redis, publishDate: "2026-08-28" });
      assert.equal(state.status, PREPARATION_STATUS.FAILED);

      const lease = await redis.get("social:lease:prepare:2026-08-28");
      assert.equal(lease, null);
    });

    it("22. FAILED may be claimed again after lease release", async () => {
      await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });
      await failPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      const res = await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-retry"
      });

      assert.equal(res.acquired, true);

      const state = await getPreparationState({ redis, publishDate: "2026-08-28" });
      assert.equal(state.status, PREPARATION_STATUS.PREPARING);
    });

    it("23. wrong leaseId cannot complete preparation", async () => {
      await claimPreparation({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        leaseId: "lease-worker-1"
      });

      await assert.rejects(
        async () =>
          completePreparation({
            redis,
            publishDate: "2026-08-28",
            contentId: "social-2026-08-28",
            leaseId: "wrong-lease-id"
          }),
        /does not own active lease/i
      );
    });

    it("24. illegal PREPARED transition is rejected", async () => {
      // Direct completion without claim/PREPARING state throws
      await redis.set("social:lease:prepare:2026-08-28", "lease-1");
      await assert.rejects(
        async () =>
          completePreparation({
            redis,
            publishDate: "2026-08-28",
            contentId: "social-2026-08-28",
            leaseId: "lease-1"
          }),
        /current state must be PREPARING/i
      );
    });

    it("25. corrupt stored preparation state throws", async () => {
      await redis.set("social:prepare:2026-08-28", "invalid JSON");
      await assert.rejects(
        async () => getPreparationState({ redis, publishDate: "2026-08-28" }),
        /Corrupt stored preparation state JSON/i
      );

      await redis.set(
        "social:prepare:2026-08-28",
        JSON.stringify({ stateVersion: 1, publishDate: "2026-08-28", contentId: "social-2026-08-28", status: "UNKNOWN_STATUS" })
      );
      await assert.rejects(
        async () => getPreparationState({ redis, publishDate: "2026-08-28" }),
        /Invalid stored preparation state/i
      );
    });
  });

  describe("Publication State & Lifecycle", () => {
    it("26. Facebook first claim succeeds", async () => {
      const res = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      assert.equal(res.acquired, true);

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(state.status, PUBLICATION_STATUS.PUBLISHING);
      assert.equal(state.platform, "facebook");
    });

    it("27. Instagram uses separate state/lease from Facebook", async () => {
      const fbClaim = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });
      assert.equal(fbClaim.acquired, true);

      const igClaim = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "instagram",
        leaseId: "pub-ig-1"
      });
      assert.equal(igClaim.acquired, true);

      const fbState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      const igState = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "instagram" });
      assert.equal(fbState.platform, "facebook");
      assert.equal(igState.platform, "instagram");
    });

    it("28. concurrent claim for same platform is blocked", async () => {
      await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      const second = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-2"
      });

      assert.equal(second.acquired, false);
      assert.equal(second.reason, "LEASE_HELD");
    });

    it("29. markPublicationPublished produces PUBLISHED", async () => {
      await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      const published = await markPublicationPublished({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      assert.equal(published.status, PUBLICATION_STATUS.PUBLISHED);

      const state = await getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" });
      assert.equal(state.status, PUBLICATION_STATUS.PUBLISHED);

      const lease = await redis.get("social:lease:publish:2026-08-28:facebook");
      assert.equal(lease, null);
    });

    it("30. PUBLISHED platform cannot be claimed again", async () => {
      await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });
      await markPublicationPublished({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      const attempt = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-new"
      });

      assert.equal(attempt.acquired, false);
      assert.equal(attempt.reason, "ALREADY_PUBLISHED");
    });

    it("31. FAILED publication can be retried", async () => {
      await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });
      await markPublicationFailed({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      const retry = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-retry"
      });

      assert.equal(retry.acquired, true);
    });

    it("32. RECONCILIATION_REQUIRED blocks future automatic claim", async () => {
      await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });
      await markPublicationReconciliationRequired({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      const attempt = await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-auto"
      });

      assert.equal(attempt.acquired, false);
      assert.equal(attempt.reason, "RECONCILIATION_REQUIRED");
    });

    it("33. wrong leaseId cannot mark PUBLISHED", async () => {
      await claimPublication({
        redis,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        platform: "facebook",
        leaseId: "pub-fb-1"
      });

      await assert.rejects(
        async () =>
          markPublicationPublished({
            redis,
            publishDate: "2026-08-28",
            contentId: "social-2026-08-28",
            platform: "facebook",
            leaseId: "impostor-lease"
          }),
        /does not own active lease/i
      );
    });

    it("34. unsupported platform is rejected", async () => {
      await assert.rejects(
        async () =>
          claimPublication({
            redis,
            publishDate: "2026-08-28",
            contentId: "social-2026-08-28",
            platform: "tiktok",
            leaseId: "pub-1"
          }),
        /Unsupported publication platform/i
      );
    });

    it("35. Pinterest is rejected", async () => {
      await assert.rejects(
        async () =>
          claimPublication({
            redis,
            publishDate: "2026-08-28",
            contentId: "social-2026-08-28",
            platform: "pinterest",
            leaseId: "pub-1"
          }),
        /Unsupported publication platform: 'pinterest'/i
      );
    });

    it("36. corrupt publication state throws", async () => {
      await redis.set("social:publish:2026-08-28:facebook", "{ corrupt");
      await assert.rejects(
        async () =>
          getPublicationState({ redis, publishDate: "2026-08-28", platform: "facebook" }),
        /Corrupt stored publication state JSON/i
      );
    });
  });

  describe("Lease Safety & Compare-and-Delete", () => {
    it("37. release logic removes a lease only when leaseId matches", async () => {
      await redis.set("social:lease:prepare:2026-08-28", "owner-token-A");

      // Attempt to release with wrong token
      const failedRelease = await safeReleaseLease(
        redis,
        "social:lease:prepare:2026-08-28",
        "wrong-token"
      );
      assert.equal(failedRelease, 0);
      assert.equal(await redis.get("social:lease:prepare:2026-08-28"), "owner-token-A");

      // Release with correct token
      const successfulRelease = await safeReleaseLease(
        redis,
        "social:lease:prepare:2026-08-28",
        "owner-token-A"
      );
      assert.equal(successfulRelease, 1);
      assert.equal(await redis.get("social:lease:prepare:2026-08-28"), null);
    });

    it("38. stale owner cannot delete a newer lease", async () => {
      // Worker 1 acquires lease
      await redis.set("social:lease:publish:2026-08-28:facebook", "worker-1");

      // Lease expires and Worker 2 acquires lease
      await redis.set("social:lease:publish:2026-08-28:facebook", "worker-2");

      // Worker 1 attempts to release expired lease
      const releaseResult = await safeReleaseLease(
        redis,
        "social:lease:publish:2026-08-28:facebook",
        "worker-1"
      );
      assert.equal(releaseResult, 0);

      // Worker 2's lease remains intact
      assert.equal(await redis.get("social:lease:publish:2026-08-28:facebook"), "worker-2");
    });
  });
});
