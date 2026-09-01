// test/socialQualityGate.test.js
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { GOOGLE_PLAY_URL } = require("../social/config");
const { buildPreparedContent } = require("../social/contentSchema");
const { renderCarousel } = require("../social/renderer");
const { loadR2Config } = require("../social/storageConfig");
const { uploadRenderedCarousel } = require("../social/storage");
const { buildManifest } = require("../social/manifest");
const { buildPlatformCaptions, FACEBOOK_FINAL_CAPTION_MAX } = require("../social/captions");
const {
  QUALITY_GATE_VERSION,
  QUALITY_STATUS,
  computeManifestDigest,
  computeCreativeDigest,
  extractComparisonTokens,
  calculateJaccardSimilarity,
  normalizeHeadline,
  evaluateQualityGate,
  getQualityGateState,
  getHistoryRecord,
  loadRecentHistory,
  saveQualityGateResult,
  runQualityGate,
  assertQualityGatePass
} = require("../social/qualityGate");
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

async function buildFullArtifact(publishDate = "2026-08-28", creativeOverrides = {}) {
  const preparedContent = buildPreparedContent({
    publishDate,
    category: "dream_symbols",
    creative: createValidCreativePayload(creativeOverrides)
  });
  const renderedCarousel = await renderCarousel(preparedContent);
  const mockS3 = new MockS3Client();
  const config = loadR2Config(createMockEnv());
  const storageResult = await uploadRenderedCarousel({
    preparedContent,
    renderedCarousel,
    client: mockS3,
    config
  });
  const manifest = buildManifest({ preparedContent, storageResult });
  return { preparedContent, renderedCarousel, manifest, storageResult };
}

describe("Social Quality Gate & Final Captions", () => {
  let redis;

  beforeEach(() => {
    redis = new MockRedis();
  });

  describe("Final Platform Captions", () => {
    it("1. Instagram caption remains exactly unchanged", async () => {
      const { manifest } = await buildFullArtifact();
      const captions = buildPlatformCaptions(manifest);
      assert.equal(captions.instagram, manifest.captions.instagram);
    });

    it("2. Facebook gets deterministic Google Play CTA", async () => {
      const { manifest } = await buildFullArtifact();
      const captions = buildPlatformCaptions(manifest);
      assert.equal(captions.facebook.includes("Download DreamlyAI:\n" + GOOGLE_PLAY_URL), true);
    });

    it("3. Facebook exact Play URL appears exactly once", async () => {
      const { manifest } = await buildFullArtifact();
      const captions = buildPlatformCaptions(manifest);
      const occurrences = captions.facebook.split(GOOGLE_PLAY_URL).length - 1;
      assert.equal(occurrences, 1);
    });

    it("4. existing exact URL is not duplicated", async () => {
      const { manifest } = await buildFullArtifact("2026-08-28", {
        captions: {
          instagram: "Test IG",
          facebook: `Base text with ${GOOGLE_PLAY_URL} already included`
        }
      });
      const captions = buildPlatformCaptions(manifest);
      const occurrences = captions.facebook.split(GOOGLE_PLAY_URL).length - 1;
      assert.equal(occurrences, 1);
      assert.equal(captions.facebook, `Base text with ${GOOGLE_PLAY_URL} already included`);
    });

    it("5. Facebook final caption > 2000 chars fails", async () => {
      const { manifest } = await buildFullArtifact();
      const longManifest = {
        ...manifest,
        captions: {
          instagram: "Test IG",
          facebook: "A".repeat(1950)
        }
      };
      assert.throws(
        () => buildPlatformCaptions(longManifest),
        /exceeds/i
      );
    });
  });

  describe("Core Quality Gate Evaluation", () => {
    it("6. valid complete artifact passes", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, true);
      assert.equal(evaluation.status, "PASS");
      assert.deepEqual(evaluation.errorCodes, []);
      assert.equal(typeof evaluation.manifestDigest, "string");
      assert.equal(typeof evaluation.creativeDigest, "string");
      assert.equal(typeof evaluation.finalCaptionsDigest, "string");
    });

    it("7. malformed prepared content fails", async () => {
      const { renderedCarousel, manifest } = await buildFullArtifact();
      const malformedPrepared = {
        schemaVersion: 1,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        category: "invalid_category",
        slideCount: 5,
        creative: createValidCreativePayload()
      };

      const evaluation = await evaluateQualityGate({
        preparedContent: malformedPrepared,
        renderedCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.status, "FAILED");
      assert.equal(evaluation.errorCodes.includes("PREPARED_CONTENT_INVALID"), true);
    });

    it("8. invalid manifest fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badManifest = { ...manifest, slideCount: 4 };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: badManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_INVALID"), true);
    });

    it("9. manifest/prepared publishDate mismatch fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const mismatchedPrepared = {
        ...preparedContent,
        publishDate: "2026-08-29",
        contentId: "social-2026-08-29"
      };

      const evaluation = await evaluateQualityGate({
        preparedContent: mismatchedPrepared,
        renderedCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_PREPARED_MISMATCH"), true);
    });

    it("10. contentId mismatch fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const mismatchedManifest = { ...manifest, contentId: "social-2026-08-28-override" };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: mismatchedManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(
        evaluation.errorCodes.includes("MANIFEST_INVALID") ||
          evaluation.errorCodes.includes("MANIFEST_PREPARED_MISMATCH"),
        true
      );
    });

    it("11. topic mismatch fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const mismatchedManifest = { ...manifest, topic: "Different Topic" };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: mismatchedManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_PREPARED_MISMATCH"), true);
    });

    it("12. captions mismatch fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const mismatchedManifest = {
        ...manifest,
        captions: {
          instagram: "Tampered IG",
          facebook: manifest.captions.facebook
        }
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: mismatchedManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_PREPARED_MISMATCH"), true);
    });

    it("13. wrong rendered slide count fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badCarousel = {
        ...renderedCarousel,
        slideCount: 4,
        slides: renderedCarousel.slides.slice(0, 4)
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: badCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("RENDERED_CAROUSEL_INVALID"), true);
    });

    it("14. wrong role order fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badCarousel = {
        ...renderedCarousel,
        slides: renderedCarousel.slides.map((s, idx) => (idx === 0 ? { ...s, role: "content" } : s))
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: badCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("RENDERED_CAROUSEL_INVALID"), true);
    });

    it("15. corrupt JPEG buffer fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badCarousel = {
        ...renderedCarousel,
        slides: renderedCarousel.slides.map((s, idx) =>
          idx === 0 ? { ...s, buffer: Buffer.from("not a valid jpeg buffer at all") } : s
        )
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: badCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(
        evaluation.errorCodes.includes("RENDERED_CAROUSEL_INVALID") ||
          evaluation.errorCodes.includes("RENDER_METADATA_CORRUPT"),
        true
      );
    });

    it("16. wrong image dimensions fail", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badCarousel = { ...renderedCarousel, width: 1000 };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: badCarousel,
        manifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("RENDERED_CAROUSEL_INVALID"), true);
    });

    it("17. manifest byteLength mismatch fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badManifest = {
        ...manifest,
        media: manifest.media.map((m, idx) => (idx === 0 ? { ...m, byteLength: m.byteLength + 100 } : m))
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: badManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_RENDER_MISMATCH"), true);
    });

    it("18. missing media URL fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badManifest = {
        ...manifest,
        media: manifest.media.map((m, idx) => (idx === 0 ? { ...m, url: "" } : m))
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: badManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_INVALID"), true);
    });

    it("19. non-HTTPS URL fails", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badManifest = {
        ...manifest,
        media: manifest.media.map((m, idx) =>
          idx === 0 ? { ...m, url: "http://media.dreamlyai.com/social/2026/08/28/slide-01.jpg" } : m
        )
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest: badManifest,
        recentHistory: []
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("MANIFEST_INVALID"), true);
    });
  });

  describe("Cryptographic Digests", () => {
    it("20. same manifest produces same SHA-256 digest", async () => {
      const { manifest } = await buildFullArtifact();
      const d1 = computeManifestDigest(manifest);
      const d2 = computeManifestDigest(manifest);
      assert.equal(d1, d2);
      assert.equal(typeof d1, "string");
      assert.equal(d1.length, 64);
    });

    it("21. changed manifest produces different digest", async () => {
      const { manifest } = await buildFullArtifact();
      const d1 = computeManifestDigest(manifest);
      const changed = { ...manifest, topic: "Slightly changed topic" };
      const d2 = computeManifestDigest(changed);
      assert.notEqual(d1, d2);
    });

    it("22. same creative produces same creative digest", async () => {
      const creative1 = createValidCreativePayload();
      const creative2 = createValidCreativePayload();
      assert.equal(computeCreativeDigest(creative1), computeCreativeDigest(creative2));
    });

    it("23. same final captions produce same digest", async () => {
      const { manifest } = await buildFullArtifact();
      const captions1 = buildPlatformCaptions(manifest);
      const captions2 = buildPlatformCaptions(manifest);
      assert.equal(computeManifestDigest(captions1), computeManifestDigest(captions2));
    });
  });

  describe("Duplicate & Near-Duplicate Detection", () => {
    it("24. no history passes", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });
      assert.equal(evaluation.pass, true);
    });

    it("25. exact creativeDigest history fails DUPLICATE_EXACT", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const creativeDigest = computeCreativeDigest(preparedContent.creative);

      const fakeHistoryRecord = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest,
        manifestDigest: "some-manifest-digest",
        coverHeadline: "different headline",
        comparisonTokens: ["unique", "tokens"]
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: [fakeHistoryRecord]
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("DUPLICATE_EXACT"), true);
    });

    it("26. exact normalized cover headline fails DUPLICATE_COVER_HEADLINE", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const headline = normalizeHeadline(preparedContent.creative.slides[0].headline);

      const fakeHistoryRecord = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest: "other-digest",
        manifestDigest: "other-manifest-digest",
        coverHeadline: headline,
        comparisonTokens: ["different", "words"]
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: [fakeHistoryRecord]
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("DUPLICATE_COVER_HEADLINE"), true);
    });

    it("27. clearly near-identical content >= threshold fails DUPLICATE_NEAR", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const tokens = extractComparisonTokens(preparedContent.creative);

      // Create a near identical token set (e.g. 90% overlap)
      const nearTokens = [...tokens];
      nearTokens.pop();

      const fakeHistoryRecord = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest: "other-digest",
        manifestDigest: "other-manifest-digest",
        coverHeadline: "completely unique headline that differs",
        comparisonTokens: nearTokens
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: [fakeHistoryRecord]
      });

      assert.equal(evaluation.pass, false);
      assert.equal(evaluation.errorCodes.includes("DUPLICATE_NEAR"), true);
    });

    it("28. clearly different content passes", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();

      const fakeHistoryRecord = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest: "other-digest",
        manifestDigest: "other-manifest-digest",
        coverHeadline: "flying over mountains and clouds",
        comparisonTokens: ["flying", "mountains", "clouds", "lucid", "sky", "altitude"]
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: [fakeHistoryRecord]
      });

      assert.equal(evaluation.pass, true);
    });

    it("29. CTA similarity alone does NOT trigger near-duplicate", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();

      // History record containing identical CTA words, but totally different content tokens
      const fakeHistoryRecord = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest: "other-digest",
        manifestDigest: "other-manifest-digest",
        coverHeadline: "teeth falling out symbolism",
        comparisonTokens: ["teeth", "falling", "dentist", "anxiety", "vulnerability"]
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: [fakeHistoryRecord]
      });

      assert.equal(evaluation.pass, true);
    });

    it("30. caption similarity alone does NOT trigger near-duplicate", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();

      const fakeHistoryRecord = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest: "other-digest",
        manifestDigest: "other-manifest-digest",
        coverHeadline: "running in slow motion",
        comparisonTokens: ["running", "motion", "legs", "escape", "pursuit"]
      };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: [fakeHistoryRecord]
      });

      assert.equal(evaluation.pass, true);
    });
  });

  describe("History Persistence & Loading", () => {
    it("31. previous 30 days are loaded, current day excluded", async () => {
      // Store history for 2026-08-27 (day - 1) and 2026-08-28 (current day)
      const hist27 = {
        stateVersion: 1,
        publishDate: "2026-08-27",
        contentId: "social-2026-08-27",
        creativeDigest: "digest-27",
        manifestDigest: "man-27",
        coverHeadline: "headline 27",
        comparisonTokens: ["token27"]
      };
      const hist28 = {
        stateVersion: 1,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        creativeDigest: "digest-28",
        manifestDigest: "man-28",
        coverHeadline: "headline 28",
        comparisonTokens: ["token28"]
      };

      await redis.set("social:history:2026-08-27", JSON.stringify(hist27));
      await redis.set("social:history:2026-08-28", JSON.stringify(hist28));

      const loaded = await loadRecentHistory({ redis, publishDate: "2026-08-28", days: 30 });
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].publishDate, "2026-08-27");
    });

    it("32. missing history days are ignored", async () => {
      const loaded = await loadRecentHistory({ redis, publishDate: "2026-08-28", days: 30 });
      assert.deepEqual(loaded, []);
    });

    it("33. corrupt history record throws", async () => {
      await redis.set("social:history:2026-08-27", "{ invalid JSON");
      await assert.rejects(
        async () => loadRecentHistory({ redis, publishDate: "2026-08-28", days: 5 }),
        /Corrupt stored history record/i
      );
    });

    it("34. no Redis KEYS/SCAN is required", async () => {
      // Verifies loadRecentHistory uses direct gets
      const loaded = await loadRecentHistory({ redis, publishDate: "2026-08-28", days: 5 });
      assert.deepEqual(loaded, []);
    });

    it("35. FAILED evaluation is not written to history", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badCarousel = { ...renderedCarousel, slideCount: 4, slides: renderedCarousel.slides.slice(0, 4) };

      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: badCarousel,
        manifest,
        recentHistory: []
      });
      assert.equal(evaluation.status, "FAILED");

      await saveQualityGateResult({ redis, evaluation });

      const qualityState = await getQualityGateState({ redis, publishDate: "2026-08-28" });
      assert.equal(qualityState.status, "FAILED");

      const historyRecord = await getHistoryRecord({ redis, publishDate: "2026-08-28" });
      assert.equal(historyRecord, null);
    });

    it("36. PASS writes history", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });
      assert.equal(evaluation.status, "PASS");

      await saveQualityGateResult({ redis, evaluation });

      const qualityState = await getQualityGateState({ redis, publishDate: "2026-08-28" });
      assert.equal(qualityState.status, "PASS");

      const historyRecord = await getHistoryRecord({ redis, publishDate: "2026-08-28" });
      assert.equal(historyRecord !== null, true);
      assert.equal(historyRecord.publishDate, "2026-08-28");
    });

    it("37. identical PASS save is idempotent", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });

      const res1 = await saveQualityGateResult({ redis, evaluation });
      assert.equal(res1.status, "PASS");

      const res2 = await saveQualityGateResult({ redis, evaluation });
      assert.equal(res2.status, "EXISTS_IDENTICAL");
    });

    it("38. different terminal PASS for same date conflicts", async () => {
      const art1 = await buildFullArtifact("2026-08-28", { topic: "Topic 1" });
      const eval1 = await evaluateQualityGate({
        preparedContent: art1.preparedContent,
        renderedCarousel: art1.renderedCarousel,
        manifest: art1.manifest,
        recentHistory: []
      });
      await saveQualityGateResult({ redis, evaluation: eval1 });

      const art2 = await buildFullArtifact("2026-08-28", { topic: "Topic 2" });
      const eval2 = await evaluateQualityGate({
        preparedContent: art2.preparedContent,
        renderedCarousel: art2.renderedCarousel,
        manifest: art2.manifest,
        recentHistory: []
      });

      await assert.rejects(
        async () => saveQualityGateResult({ redis, evaluation: eval2 }),
        /Quality Gate conflict/i
      );
    });

    it("39. FAILED may later be replaced by PASS", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const badCarousel = { ...renderedCarousel, slideCount: 4, slides: renderedCarousel.slides.slice(0, 4) };

      const evalFailed = await evaluateQualityGate({
        preparedContent,
        renderedCarousel: badCarousel,
        manifest,
        recentHistory: []
      });
      await saveQualityGateResult({ redis, evaluation: evalFailed });

      const state1 = await getQualityGateState({ redis, publishDate: "2026-08-28" });
      assert.equal(state1.status, "FAILED");

      const evalPass = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });
      await saveQualityGateResult({ redis, evaluation: evalPass });

      const state2 = await getQualityGateState({ redis, publishDate: "2026-08-28" });
      assert.equal(state2.status, "PASS");
    });

    it("40. conflicting history record fails closed", async () => {
      // Pre-seed conflicting history record for same date
      const fakeHist = {
        stateVersion: 1,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        creativeDigest: "preseeded-digest",
        manifestDigest: "preseeded-manifest-digest",
        coverHeadline: "preseeded headline",
        comparisonTokens: ["preseeded"]
      };
      await redis.set("social:history:2026-08-28", JSON.stringify(fakeHist));

      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const evaluation = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });

      await assert.rejects(
        async () => saveQualityGateResult({ redis, evaluation }),
        /Content history conflict/i
      );
    });
  });

  describe("Publisher Precondition Check", () => {
    it("41. matching PASS + manifest succeeds", async () => {
      const { manifest } = await buildFullArtifact();
      const qualityState = {
        stateVersion: 1,
        publishDate: manifest.publishDate,
        contentId: manifest.contentId,
        status: "PASS",
        manifestDigest: computeManifestDigest(manifest),
        creativeDigest: "creative-digest",
        finalCaptionsDigest: "captions-digest",
        errorCodes: []
      };

      assert.equal(assertQualityGatePass({ qualityState, manifest }), true);
    });

    it("42. missing Quality Gate state fails", async () => {
      const { manifest } = await buildFullArtifact();
      assert.throws(
        () => assertQualityGatePass({ qualityState: null, manifest }),
        /Quality Gate state is missing/i
      );
    });

    it("43. FAILED state fails", async () => {
      const { manifest } = await buildFullArtifact();
      const qualityState = {
        stateVersion: 1,
        publishDate: manifest.publishDate,
        contentId: manifest.contentId,
        status: "FAILED",
        manifestDigest: computeManifestDigest(manifest),
        creativeDigest: "creative-digest",
        finalCaptionsDigest: "captions-digest",
        errorCodes: ["SOME_ERROR"]
      };

      assert.throws(
        () => assertQualityGatePass({ qualityState, manifest }),
        /Quality Gate check failed: status is 'FAILED'/i
      );
    });

    it("44. PASS tied to different manifestDigest fails", async () => {
      const { manifest } = await buildFullArtifact();
      const qualityState = {
        stateVersion: 1,
        publishDate: manifest.publishDate,
        contentId: manifest.contentId,
        status: "PASS",
        manifestDigest: "different-unrelated-digest",
        creativeDigest: "creative-digest",
        finalCaptionsDigest: "captions-digest",
        errorCodes: []
      };

      assert.throws(
        () => assertQualityGatePass({ qualityState, manifest }),
        /manifestDigest mismatch/i
      );
    });

    it("45. wrong publishDate/contentId fails", async () => {
      const { manifest } = await buildFullArtifact();
      const qualityState = {
        stateVersion: 1,
        publishDate: "2026-08-29",
        contentId: "social-2026-08-29",
        status: "PASS",
        manifestDigest: computeManifestDigest(manifest),
        creativeDigest: "creative-digest",
        finalCaptionsDigest: "captions-digest",
        errorCodes: []
      };

      assert.throws(
        () => assertQualityGatePass({ qualityState, manifest }),
        /publishDate '2026-08-29' does not match/i
      );
    });
  });

  describe("Boundaries & End-to-End Runner", () => {
    it("46. Pinterest is not introduced anywhere in Quality Gate output", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      const evaluation = await runQualityGate({
        redis,
        preparedContent,
        renderedCarousel,
        manifest
      });

      const serialized = JSON.stringify(evaluation);
      assert.equal(serialized.toLowerCase().includes("pinterest"), false);
    });

    it("47. no raw image Buffer is persisted in Quality Gate/history records", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      await runQualityGate({
        redis,
        preparedContent,
        renderedCarousel,
        manifest
      });

      const qRaw = await redis.get("social:quality:2026-08-28");
      const hRaw = await redis.get("social:history:2026-08-28");

      assert.equal(qRaw.includes("Buffer"), false);
      assert.equal(hRaw.includes("Buffer"), false);
    });

    it("48. no AI creative full text is stored in history except normalized cover headline/token set", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();
      await runQualityGate({
        redis,
        preparedContent,
        renderedCarousel,
        manifest
      });

      const history = await getHistoryRecord({ redis, publishDate: "2026-08-28" });
      assert.deepEqual(Object.keys(history).sort(), [
        "comparisonTokens",
        "contentId",
        "coverHeadline",
        "creativeDigest",
        "manifestDigest",
        "publishDate",
        "stateVersion"
      ]);
      assert.equal("body" in history, false);
      assert.equal("captions" in history, false);
    });

    it("49. repeated valid evaluation is deterministic", async () => {
      const { preparedContent, renderedCarousel, manifest } = await buildFullArtifact();

      const eval1 = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });
      const eval2 = await evaluateQualityGate({
        preparedContent,
        renderedCarousel,
        manifest,
        recentHistory: []
      });

      assert.deepEqual(eval1, eval2);
    });
  });
});
