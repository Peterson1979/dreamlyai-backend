// test/socialUrlBuilder.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { GOOGLE_PLAY_URL } = require("../social/config");
const {
  SUPPORTED_SOURCES,
  buildAttributedPlayStoreUrl,
  buildAttributedWebUrl
} = require("../social/urlBuilder");

describe("Social & Campaign URL Builder", () => {
  it("buildAttributedPlayStoreUrl builds valid attributed Play Store URL for Facebook", () => {
    const url = buildAttributedPlayStoreUrl({
      platform: "facebook",
      medium: "social",
      campaign: "lucid_dreams",
      contentId: "social-2026-09-16"
    });

    assert.ok(url.startsWith(GOOGLE_PLAY_URL), "Must start with official Google Play URL");
    assert.ok(url.includes("&referrer="), "Must contain &referrer=");
    assert.ok(url.includes("utm_source%3Dfacebook"), "Must contain encoded utm_source=facebook");
    assert.ok(url.includes("utm_medium%3Dsocial"), "Must contain encoded utm_medium=social");
    assert.ok(url.includes("utm_campaign%3Dlucid_dreams"), "Must contain encoded utm_campaign");
    assert.ok(url.includes("utm_content%3Dsocial-2026-09-16"), "Must contain encoded utm_content");
  });

  it("buildAttributedPlayStoreUrl builds valid attributed Play Store URL for Instagram", () => {
    const url = buildAttributedPlayStoreUrl({
      platform: "instagram",
      medium: "social",
      campaign: "recurring_themes",
      contentId: "social-2026-09-17"
    });

    assert.ok(url.startsWith(GOOGLE_PLAY_URL));
    assert.ok(url.includes("utm_source%3Dinstagram"));
    assert.ok(url.includes("utm_campaign%3Drecurring_themes"));
  });

  it("buildAttributedPlayStoreUrl builds valid attributed Play Store URL for Pinterest", () => {
    const url = buildAttributedPlayStoreUrl({
      platform: "pinterest",
      medium: "social",
      campaign: "dream_meanings",
      contentId: "pin_001"
    });

    assert.ok(url.startsWith(GOOGLE_PLAY_URL));
    assert.ok(url.includes("utm_source%3Dpinterest"));
  });

  it("buildAttributedPlayStoreUrl applies fallback defaults safely when called with empty object", () => {
    const url = buildAttributedPlayStoreUrl({});

    assert.ok(url.startsWith(GOOGLE_PLAY_URL));
    assert.ok(url.includes("utm_source%3Dfacebook"));
    assert.ok(url.includes("utm_medium%3Dsocial"));
    assert.ok(url.includes("utm_campaign%3Ddaily_social"));
    assert.ok(url.includes("utm_content%3Dgeneral"));
  });

  it("buildAttributedWebUrl builds valid attributed website URL with default production domain", () => {
    const url = buildAttributedWebUrl({
      platform: "pinterest",
      medium: "social",
      campaign: "flying_dreams",
      contentId: "pin_42"
    });

    assert.ok(url.startsWith("https://dreamlyai.life/"));
    assert.ok(url.includes("utm_source=pinterest"));
    assert.ok(url.includes("utm_medium=social"));
    assert.ok(url.includes("utm_campaign=flying_dreams"));
    assert.ok(url.includes("utm_content=pin_42"));
  });

  it("buildAttributedWebUrl respects custom baseUrl when specified", () => {
    const url = buildAttributedWebUrl({
      baseUrl: "https://custom.dreamlyai.life",
      platform: "pinterest",
      medium: "social",
      campaign: "flying_dreams",
      contentId: "pin_42"
    });

    assert.ok(url.startsWith("https://custom.dreamlyai.life/"));
    assert.ok(url.includes("utm_source=pinterest"));
  });
});
