/**
 * Unit Tests for Google Analytics 4 (GA4) Integration & Conversion Measurement Foundation
 *
 * Verifies official Google tag implementation, measurement ID consistency,
 * universal presence across all production website pages, and complete
 * conversion event instrumentation (play_store_click, cta_click, dream_topic_view,
 * content_navigation, outbound_click, scroll).
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  GA_MEASUREMENT_ID,
  getGoogleTagHeadScript,
  getMeasurementFoundationScript
} = require("../utils/analytics");
const privacyPolicyHandler = require("../api/privacy-policy");
const termsOfUseHandler = require("../api/terms-of-use");
const aiDisclaimerHandler = require("../api/ai-disclaimer");
const directoryPageHandler = require("../api/dreams/index");
const topicPageHandler = require("../api/dreams/[topic]");

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(content) {
      this.body = content;
      return this;
    }
  };
  return res;
}

describe("Google Analytics 4 (GA4) Complete Conversion Measurement Foundation", () => {
  const rootDir = path.resolve(__dirname, "..");
  const landingHtmlPath = path.join(rootDir, "public", "index.html");
  const privacyHtmlPath = path.join(rootDir, "public", "privacy-policy", "index.html");
  const privacyFlatHtmlPath = path.join(rootDir, "public", "privacy-policy.html");
  const termsHtmlPath = path.join(rootDir, "public", "terms-of-use", "index.html");
  const termsFlatHtmlPath = path.join(rootDir, "public", "terms-of-use.html");
  const aiDisclaimerHtmlPath = path.join(rootDir, "public", "ai-disclaimer", "index.html");
  const aiDisclaimerFlatHtmlPath = path.join(rootDir, "public", "ai-disclaimer.html");

  describe("1. Centralized Analytics Module (utils/analytics.js)", () => {
    it("exports exact production GA4 measurement ID: G-G70KM0K4XS", () => {
      assert.equal(GA_MEASUREMENT_ID, "G-G70KM0K4XS");
    });

    it("generates official Google tag (gtag.js) script snippet for <head>", () => {
      const script = getGoogleTagHeadScript();
      assert.ok(script.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(script.includes("dataLayer"));
      assert.ok(script.includes("gtag('js', new Date())"));
      assert.ok(script.includes("gtag('config', 'G-G70KM0K4XS')"));
    });

    it("generates conversion measurement script with all 6 required event definitions", () => {
      const script = getMeasurementFoundationScript();
      
      // 1. Google Play Store conversion event
      assert.ok(script.includes("'play_store_click'"), "Must instrument play_store_click");
      assert.ok(script.includes("link_url:"), "play_store_click must include link_url");
      assert.ok(script.includes("link_location:"), "play_store_click must include link_location");

      // 2. Primary CTA interaction event
      assert.ok(script.includes("'cta_click'"), "Must instrument cta_click");
      assert.ok(script.includes("cta_name:"), "cta_click must include cta_name");
      assert.ok(script.includes("cta_location:"), "cta_click must include cta_location");
      assert.ok(script.includes("destination:"), "cta_click must include destination");

      // 3. Dream topic engagement event
      assert.ok(script.includes("'dream_topic_view'"), "Must instrument dream_topic_view");
      assert.ok(script.includes("topic:"), "dream_topic_view must include topic");

      // 4. Content navigation event
      assert.ok(script.includes("'content_navigation'"), "Must instrument content_navigation");
      assert.ok(script.includes("link_location: location"), "content_navigation must include link_location");
      assert.ok(script.includes("destination: destination"), "content_navigation must include destination");

      // 5. Outbound link engagement event
      assert.ok(script.includes("'outbound_click'"), "Must instrument outbound_click");
      assert.ok(script.includes("link_url: href"), "outbound_click must include link_url");
      assert.ok(script.includes("link_location: location"), "outbound_click must include link_location");

      // 6. Scroll engagement event
      assert.ok(script.includes("'scroll'"), "Must instrument scroll");
      assert.ok(script.includes("percent_scrolled: 90"), "scroll must track 90% threshold");
    });

    it("passes explicit topic ID when configured for topic pages", () => {
      const topicScript = getMeasurementFoundationScript({ topicId: "falling-dreams" });
      assert.ok(topicScript.includes('initTopicEngagement("falling-dreams")'));
    });

    it("properly excludes internal domains, Play Store links, and GA/GTM from outbound tracking", () => {
      const script = getMeasurementFoundationScript();
      assert.ok(script.includes("dreamlyai.life"), "Must filter internal dreamlyai.life domains");
      assert.ok(script.includes("googletagmanager.com"), "Must exclude googletagmanager.com from outbound");
      assert.ok(script.includes("google-analytics.com"), "Must exclude google-analytics.com from outbound");
      assert.ok(script.includes("play.google.com/store/apps/details?id=com.oberon.dreamlyai"), "Must exclude Play Store from generic outbound");
    });

    it("does NOT transmit sensitive PII parameters", () => {
      const script = getMeasurementFoundationScript();
      assert.ok(!script.includes("email:"), "Must not collect email");
      assert.ok(!script.includes("user_name:"), "Must not collect user names");
      assert.ok(!script.includes("phone:"), "Must not collect phone numbers");
      assert.ok(!script.includes("password:"), "Must not collect passwords");
    });
  });

  describe("2. Landing Page (public/index.html)", () => {
    it("contains official Google tag snippet in <head>", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
    });

    it("contains complete measurement foundation script before </body>", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assert.ok(html.includes('<script id="measurement-foundation">'));
      assert.ok(html.includes("play_store_click"));
      assert.ok(html.includes("cta_click"));
      assert.ok(html.includes("content_navigation"));
      assert.ok(html.includes("outbound_click"));
      assert.ok(html.includes("percent_scrolled: 90"));
    });

    it("has required CTA and navigation anchors in DOM", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assert.ok(html.includes('id="hero_google_play_btn"'));
      assert.ok(html.includes('id="hero_explore_dreams_btn"'));
      assert.ok(html.includes('id="footer_google_play_btn"'));
      assert.ok(html.includes('id="primary-nav-menu"'));
    });
  });

  describe("3. Legal & Disclaimer Static Pages", () => {
    it("public/privacy-policy.html and public/privacy-policy/index.html contain GA4 tag and measurement script", () => {
      const html1 = fs.readFileSync(privacyHtmlPath, "utf8");
      const html2 = fs.readFileSync(privacyFlatHtmlPath, "utf8");

      for (const html of [html1, html2]) {
        assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
        assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
        assert.ok(html.includes('<script id="measurement-foundation">'));
        assert.ok(html.includes("play_store_click"));
      }
    });

    it("public/terms-of-use.html and public/terms-of-use/index.html contain GA4 tag and measurement script", () => {
      const html1 = fs.readFileSync(termsHtmlPath, "utf8");
      const html2 = fs.readFileSync(termsFlatHtmlPath, "utf8");

      for (const html of [html1, html2]) {
        assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
        assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
        assert.ok(html.includes('<script id="measurement-foundation">'));
        assert.ok(html.includes("play_store_click"));
      }
    });

    it("public/ai-disclaimer.html and public/ai-disclaimer/index.html contain GA4 tag and measurement script", () => {
      const html1 = fs.readFileSync(aiDisclaimerHtmlPath, "utf8");
      const html2 = fs.readFileSync(aiDisclaimerFlatHtmlPath, "utf8");

      for (const html of [html1, html2]) {
        assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
        assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
        assert.ok(html.includes('<script id="measurement-foundation">'));
        assert.ok(html.includes("play_store_click"));
      }
    });
  });

  describe("4. Dynamic Serverless SSR Endpoints", () => {
    it("api/privacy-policy.js serves HTML with GA4 tag and measurement script", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await privacyPolicyHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
      assert.ok(res.body.includes('<script id="measurement-foundation">'));
    });

    it("api/terms-of-use.js serves HTML with GA4 tag and measurement script", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await termsOfUseHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
      assert.ok(res.body.includes('<script id="measurement-foundation">'));
    });

    it("api/ai-disclaimer.js serves HTML with GA4 tag and measurement script", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await aiDisclaimerHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
      assert.ok(res.body.includes('<script id="measurement-foundation">'));
    });

    it("api/dreams/index.js (/dreams) serves HTML with GA4 tag and directory measurement script", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await directoryPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
      assert.ok(res.body.includes('<script id="measurement-foundation">'));
      assert.ok(res.body.includes("initTopicEngagement(null)"));
    });

    it("api/dreams/[topic].js (/dreams/:topic) serves HTML with topic-specific dream_topic_view tracking", async () => {
      const req = {
        method: "GET",
        query: { topic: "falling-dreams" },
        url: "/dreams/falling-dreams"
      };
      const res = createMockResponse();
      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
      assert.ok(res.body.includes('<script id="measurement-foundation">'));
      assert.ok(res.body.includes('initTopicEngagement("falling-dreams")'));
    });

    it("api/dreams/[topic].js 404 handler serves HTML with GA4 tag and fallback measurement script", async () => {
      const req = {
        method: "GET",
        query: { topic: "non-existent-topic" },
        url: "/dreams/non-existent-topic"
      };
      const res = createMockResponse();
      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 404);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
      assert.ok(res.body.includes('<script id="measurement-foundation">'));
    });
  });
});
