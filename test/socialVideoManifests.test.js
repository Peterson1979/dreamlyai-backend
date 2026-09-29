/**
 * Dreamly AI Video Manifests and Source Asset Validation Tests
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PROMO_VIDEO_START_DATE,
  PROMO_VIDEO_END_DATE,
  PROMO_VIDEO_TOTAL_COUNT,
  PROMO_VIDEO_MANIFESTS_30,
  isPromoVideoCampaignDate,
  getVideoManifestForDate,
  getVideoManifestBySequence,
  getAllVideoManifests
} = require("../social/video/videoRegistry");

const SOURCE_DESC_FILE = "C:\\Users\\opeti\\APP\\Dreamly\\Dreamly marketing\\Dreamly 1 havi\\DreamlyAI 1 havi.txt";
const SOURCE_VIDEO_DIR = "C:\\Users\\opeti\\APP\\Dreamly\\Dreamly marketing\\Dreamly 1 havi\\Dreamly AI 1 havi videok";
const MANIFEST_DIR = path.resolve(__dirname, "../fixtures/social-manifests/promo-videos-30");
const BATCH_FILE = path.resolve(__dirname, "../fixtures/social-manifests/promo-videos-30-batch.json");

describe("Dreamly AI 30-Day Promotional Video Suite & Manifests", () => {
  it("1. Verifies 30 source videos and 30 numbered text descriptions exist on disk", () => {
    assert.ok(fs.existsSync(SOURCE_DESC_FILE), "Source descriptions file must exist");
    assert.ok(fs.existsSync(SOURCE_VIDEO_DIR), "Source video directory must exist");

    const descRaw = fs.readFileSync(SOURCE_DESC_FILE, "utf8");
    const descBlocks = descRaw.split(/(?=^\d+\.\s+\*\*Title:\*\*)/m).map(b => b.trim()).filter(Boolean);
    assert.equal(descBlocks.length, 30, "Source text file must contain exactly 30 numbered entries");

    for (let i = 0; i < 30; i++) {
      const seq = i + 1;
      const videoFileName = `${seq}.mp4`;
      const videoFilePath = path.join(SOURCE_VIDEO_DIR, videoFileName);
      assert.ok(fs.existsSync(videoFilePath), `Video file ${videoFileName} must exist at ${videoFilePath}`);
      const stat = fs.statSync(videoFilePath);
      assert.ok(stat.size > 1000000, `Video ${videoFileName} must be > 1MB, found ${stat.size} bytes`);
    }
  });

  it("2. Verifies 30 individual manifest JSON files and batch file exist and parse cleanly", () => {
    assert.ok(fs.existsSync(MANIFEST_DIR), "Manifest directory must exist");
    assert.ok(fs.existsSync(BATCH_FILE), "Batch manifest file must exist");

    const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith(".json")).sort();
    assert.equal(files.length, 30, "Expected exactly 30 manifest files in directory");

    const batchData = JSON.parse(fs.readFileSync(BATCH_FILE, "utf8"));
    assert.equal(batchData.length, 30, "Batch file must contain 30 manifests");
  });

  it("3. Verifies strict 1:1 mapping between source text, video files, and manifests", () => {
    const descRaw = fs.readFileSync(SOURCE_DESC_FILE, "utf8");
    const descBlocks = descRaw.split(/(?=^\d+\.\s+\*\*Title:\*\*)/m).map(b => b.trim()).filter(Boolean);

    const seenSeqs = new Set();
    const seenVideos = new Set();
    const seenTitles = new Set();
    const seenDates = new Set();

    for (let i = 0; i < 30; i++) {
      const seq = i + 1;
      const seqPad = String(seq).padStart(2, "0");
      const expectedFileName = `promo-video-${seqPad}.json`;
      const filePath = path.join(MANIFEST_DIR, expectedFileName);
      const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));

      const block = descBlocks[i];
      const titleMatch = block.match(/\*\*Title:\*\*\s*(.+)/);
      const visualMatch = block.match(/\*\*Vizual:\*\*\s*(.+)/);
      const voiceoverMatch = block.match(/\*\*Voiceover:\*\*\s*(.+)/);

      const expectedTitle = titleMatch[1].trim();
      const expectedVisual = visualMatch[1].trim();
      const expectedVoiceover = voiceoverMatch[1].trim().replace(/^[“"']+|[”"']+$/g, "");

      // Validate metadata
      assert.equal(manifest.metadata.sequenceNumber, seq);
      assert.equal(manifest.metadata.sourceDescriptionNumber, seq);
      assert.equal(manifest.metadata.videoFileName, `${seq}.mp4`);
      assert.equal(manifest.metadata.exactSourceTitle, expectedTitle);
      assert.equal(manifest.metadata.visual, expectedVisual);
      assert.equal(manifest.metadata.voiceover, expectedVoiceover);
      assert.equal(manifest.metadata.qualityGate, "QUALITY_GATE_PASS");

      // Validate uniqueness
      assert.ok(!seenSeqs.has(seq));
      seenSeqs.add(seq);
      assert.ok(!seenVideos.has(manifest.metadata.videoFileName));
      seenVideos.add(manifest.metadata.videoFileName);
      assert.ok(!seenTitles.has(manifest.metadata.exactSourceTitle));
      seenTitles.add(manifest.metadata.exactSourceTitle);
      assert.ok(!seenDates.has(manifest.date));
      seenDates.add(manifest.date);

      // Validate media
      assert.equal(manifest.media.length, 1);
      assert.equal(manifest.media[0].type, "video/mp4");
      assert.equal(manifest.media[0].aspectRatio, "9:16");
      assert.ok(manifest.media[0].url.startsWith("https://"));

      // Validate platform copy presence and constraints
      assert.ok(manifest.captions.instagram && typeof manifest.captions.instagram === "string");
      assert.ok(manifest.captions.instagram.includes("link in bio") || manifest.captions.instagram.includes("Link in bio"));

      assert.ok(manifest.captions.facebook && typeof manifest.captions.facebook === "string");
      assert.ok(manifest.captions.facebook.includes("play.google.com"));

      assert.ok(manifest.captions.youtube && typeof manifest.captions.youtube === "object");
      assert.ok(manifest.captions.youtube.title && manifest.captions.youtube.title.length <= 100);
      assert.ok(manifest.captions.youtube.description.includes("play.google.com"));
      assert.ok(Array.isArray(manifest.captions.youtube.tags) && manifest.captions.youtube.tags.length > 0);

      assert.ok(manifest.captions.pinterest && typeof manifest.captions.pinterest === "object");
      assert.ok(manifest.captions.pinterest.title && manifest.captions.pinterest.title.length <= 100);
      assert.ok(manifest.captions.pinterest.description && manifest.captions.pinterest.description.length <= 500);
      assert.ok(manifest.captions.pinterest.link && manifest.captions.pinterest.link.startsWith("https://"));
    }
  });

  it("4. Verifies videoRegistry lookup functions and date boundaries", () => {
    assert.equal(PROMO_VIDEO_TOTAL_COUNT, 30);
    assert.equal(PROMO_VIDEO_MANIFESTS_30.length, 30);
    assert.equal(isPromoVideoCampaignDate(PROMO_VIDEO_START_DATE), true);
    assert.equal(isPromoVideoCampaignDate(PROMO_VIDEO_END_DATE), true);
    assert.equal(isPromoVideoCampaignDate("2025-01-01"), false);

    const m1 = getVideoManifestForDate("2026-09-28");
    assert.ok(m1);
    assert.equal(m1.metadata.sequenceNumber, 1);
    assert.equal(m1.metadata.videoFileName, "1.mp4");

    const mBySeq = getVideoManifestBySequence(15);
    assert.ok(mBySeq);
    assert.equal(mBySeq.metadata.sequenceNumber, 15);
    assert.equal(mBySeq.metadata.videoFileName, "15.mp4");

    const all = getAllVideoManifests();
    assert.equal(all.length, 30);
  });
});
