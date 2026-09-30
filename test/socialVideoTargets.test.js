/**
 * Dreamly AI Video Social Target Registry & Config Tests
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  VIDEO_TARGETS,
  ALL_TARGET_IDS,
  canonicalizeTargetId,
  loadVideoTargetsConfig
} = require("../social/video/videoTargets");

const { PinterestVideoAdapter } = require("../social/video/adapters/pinterestVideoAdapter");
const { YouTubeVideoAdapter } = require("../social/video/adapters/youtubeVideoAdapter");
const { InstagramReelsAdapter } = require("../social/video/adapters/instagramReelsAdapter");
const { FacebookVideoAdapter } = require("../social/video/adapters/facebookVideoAdapter");

describe("Dreamly AI Video Social Target Registry & Config", () => {
  it("1. Resolves all 8 canonical target IDs and alias mappings", () => {
    assert.equal(ALL_TARGET_IDS.length, 9);
    assert.deepEqual(ALL_TARGET_IDS, [
      "pinterest_dreamly",
      "youtube_dreamly",
      "instagram_dreamly",
      "facebook_dreamly",
      "threads_dreamly",
      "instagram_lifemode",
      "facebook_lifemode",
      "youtube_lifemode",
      "pinterest_lifemode"
    ]);

    // Test canonical aliases
    assert.equal(canonicalizeTargetId("pinterest"), "pinterest_dreamly");
    assert.equal(canonicalizeTargetId("pinterest_primary"), "pinterest_dreamly");
    assert.equal(canonicalizeTargetId("youtube"), "youtube_dreamly");
    assert.equal(canonicalizeTargetId("youtube_primary"), "youtube_dreamly");
    assert.equal(canonicalizeTargetId("instagram"), "instagram_dreamly");
    assert.equal(canonicalizeTargetId("instagram_primary"), "instagram_dreamly");
    assert.equal(canonicalizeTargetId("facebook"), "facebook_dreamly");
    assert.equal(canonicalizeTargetId("facebook_primary"), "facebook_dreamly");
    assert.equal(canonicalizeTargetId("threads"), "threads_dreamly");
    assert.equal(canonicalizeTargetId("threads_primary"), "threads_dreamly");
    assert.equal(canonicalizeTargetId("threads_dreamly"), "threads_dreamly");
    assert.equal(canonicalizeTargetId("instagram_secondary"), "instagram_lifemode");
    assert.equal(canonicalizeTargetId("facebook_secondary"), "facebook_lifemode");
    assert.equal(canonicalizeTargetId("youtube_secondary"), "youtube_lifemode");
    assert.equal(canonicalizeTargetId("pinterest_secondary"), "pinterest_lifemode");
    assert.equal(canonicalizeTargetId("non_existent"), null);
  });

  it("2. Loads isolated configurations for Dreamly AI and LifeMode targets", () => {
    const mockEnv = {
      DREAMLY_PINTEREST_BOARD_ID: "board_dreamly_123",
      DREAMLY_PINTEREST_ACCESS_TOKEN: "token_dreamly_pin",
      DREAMLY_PINTEREST_APP_ID: "appid_dreamly",
      DREAMLY_PINTEREST_APP_SECRET: "secret_dreamly",

      DREAMLY_YOUTUBE_CLIENT_ID: "yt_client_dreamly",
      DREAMLY_YOUTUBE_CLIENT_SECRET: "yt_secret_dreamly",
      DREAMLY_YOUTUBE_REFRESH_TOKEN: "yt_refresh_dreamly",
      DREAMLY_YOUTUBE_CHANNEL_ID: "yt_channel_dreamly",

      INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig_dreamly_123",
      FACEBOOK_PAGE_ID: "fb_page_dreamly_456",
      FACEBOOK_PAGE_ACCESS_TOKEN: "token_dreamly_meta",

      LIFEMODE_INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig_lifemode_123",
      LIFEMODE_FACEBOOK_PAGE_ID: "fb_page_lifemode_456",
      LIFEMODE_FACEBOOK_PAGE_ACCESS_TOKEN: "token_lifemode_meta",

      LIFEMODE_YOUTUBE_CLIENT_ID: "yt_client_lifemode",
      LIFEMODE_YOUTUBE_CLIENT_SECRET: "yt_secret_lifemode",
      LIFEMODE_YOUTUBE_REFRESH_TOKEN: "yt_refresh_lifemode",

      LIFEMODE_PINTEREST_BOARD_ID: "board_lifemode_789",
      LIFEMODE_PINTEREST_ACCESS_TOKEN: "token_lifemode_pin"
    };

    const config = loadVideoTargetsConfig(mockEnv);

    // Verify Dreamly Pinterest
    assert.equal(config.pinterest_dreamly.boardId, "board_dreamly_123");
    assert.equal(config.pinterest_dreamly.accessToken, "token_dreamly_pin");
    assert.equal(config.pinterest_dreamly.enabled, true);

    // Verify Dreamly YouTube
    assert.equal(config.youtube_dreamly.clientId, "yt_client_dreamly");
    assert.equal(config.youtube_dreamly.refreshToken, "yt_refresh_dreamly");
    assert.equal(config.youtube_dreamly.enabled, true);

    // Verify Dreamly Instagram
    assert.equal(config.instagram_dreamly.businessAccountId, "ig_dreamly_123");
    assert.equal(config.instagram_dreamly.pageAccessToken, "token_dreamly_meta");
    assert.equal(config.instagram_dreamly.enabled, true);

    // Verify Dreamly Facebook
    assert.equal(config.facebook_dreamly.pageId, "fb_page_dreamly_456");
    assert.equal(config.facebook_dreamly.pageAccessToken, "token_dreamly_meta");
    assert.equal(config.facebook_dreamly.enabled, true);

    // Verify LifeMode Instagram
    assert.equal(config.instagram_lifemode.businessAccountId, "ig_lifemode_123");
    assert.equal(config.instagram_lifemode.pageAccessToken, "token_lifemode_meta");
    assert.equal(config.instagram_lifemode.enabled, true);

    // Verify LifeMode Facebook
    assert.equal(config.facebook_lifemode.pageId, "fb_page_lifemode_456");
    assert.equal(config.facebook_lifemode.pageAccessToken, "token_lifemode_meta");

    // Verify LifeMode YouTube
    assert.equal(config.youtube_lifemode.clientId, "yt_client_lifemode");
    assert.notEqual(config.youtube_lifemode.clientId, config.youtube_dreamly.clientId);

    // Verify LifeMode Pinterest
    assert.equal(config.pinterest_lifemode.boardId, "board_lifemode_789");
    assert.notEqual(config.pinterest_lifemode.boardId, config.pinterest_dreamly.boardId);
  });

  it("3. Target enable/disable flags work dynamically without modifying code", () => {
    const mockEnv = {
      DREAMLY_PINTEREST_ENABLED: "false",
      DREAMLY_YOUTUBE_ENABLED: "0",
      DREAMLY_INSTAGRAM_ENABLED: "false",
      DREAMLY_FACEBOOK_ENABLED: "0",
      LIFEMODE_INSTAGRAM_ENABLED: "true",
      LIFEMODE_FACEBOOK_ENABLED: "1",
      LIFEMODE_YOUTUBE_ENABLED: "no",
      LIFEMODE_PINTEREST_ENABLED: "yes"
    };

    const config = loadVideoTargetsConfig(mockEnv);

    assert.equal(config.pinterest_dreamly.enabled, false);
    assert.equal(config.youtube_dreamly.enabled, false);
    assert.equal(config.instagram_dreamly.enabled, false);
    assert.equal(config.facebook_dreamly.enabled, false);
    assert.equal(config.instagram_lifemode.enabled, true);
    assert.equal(config.facebook_lifemode.enabled, true);
    assert.equal(config.youtube_lifemode.enabled, false);
    assert.equal(config.pinterest_lifemode.enabled, true);
  });

  it("4. Adapters fail closed when required credentials or board/channel IDs are missing", () => {
    const emptyConfig = {};

    const pinAdapter = new PinterestVideoAdapter("pinterest_dreamly");
    const pinVal = pinAdapter.validateConfig(emptyConfig);
    assert.equal(pinVal.valid, false);
    assert.ok(pinVal.errors.some(e => e.includes("Missing accessToken or refreshToken")));
    assert.ok(pinVal.errors.some(e => e.includes("Missing boardId")));

    const ytAdapter = new YouTubeVideoAdapter("youtube_dreamly");
    const ytVal = ytAdapter.validateConfig(emptyConfig);
    assert.equal(ytVal.valid, false);
    assert.ok(ytVal.errors.some(e => e.includes("Missing clientId")));
    assert.ok(ytVal.errors.some(e => e.includes("Missing refreshToken")));

    const igAdapter = new InstagramReelsAdapter("instagram_dreamly");
    const igVal = igAdapter.validateConfig(emptyConfig);
    assert.equal(igVal.valid, false);
    assert.ok(igVal.errors.some(e => e.includes("Missing Instagram Business Account ID")));

    const fbAdapter = new FacebookVideoAdapter("facebook_dreamly");
    const fbVal = fbAdapter.validateConfig(emptyConfig);
    assert.equal(fbVal.valid, false);
    assert.ok(fbVal.errors.some(e => e.includes("Missing Page ID")));
  });
});
