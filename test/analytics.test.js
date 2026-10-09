/**
 * Regression Tests for Dreamly AI Website Privacy Cleanup & Analytics Removal
 *
 * Verifies that all website pages (static HTML and serverless SSR endpoints)
 * have zero unnecessary tracking scripts, zero GA4/gtag tags, zero persistent
 * storage (sessionStorage/localStorage tracking), while preserving in-memory
 * campaign parameter forwarding, SEO metadata, and legal disclosures.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
    },
    end() {
      return this;
    }
  };
  return res;
}

const FORBIDDEN_TRACKING_PATTERNS = [
  "https://www.googletagmanager.com/gtag/js",
  "gtag('config'",
  "gtag('event'",
  "window.dataLayer",
  "G-G70KM0K4XS",
  "dreamly_utm_attribution",
  "play_store_click",
  "cta_click",
  "dream_topic_view",
  "content_navigation",
  "outbound_click",
  "percent_scrolled"
];

function assertNoTrackingInHtml(html, contextDescription) {
  for (const pattern of FORBIDDEN_TRACKING_PATTERNS) {
    assert.ok(
      !html.includes(pattern),
      `${contextDescription} must NOT contain tracking pattern: "${pattern}"`
    );
  }
}

describe("Website Privacy Cleanup & Analytics Removal Verification", () => {
  const rootDir = path.resolve(__dirname, "..");
  const landingHtmlPath = path.join(rootDir, "public", "index.html");
  const privacyHtmlPath = path.join(rootDir, "public", "privacy-policy", "index.html");
  const privacyFlatHtmlPath = path.join(rootDir, "public", "privacy-policy.html");
  const termsHtmlPath = path.join(rootDir, "public", "terms-of-use", "index.html");
  const termsFlatHtmlPath = path.join(rootDir, "public", "terms-of-use.html");
  const aiDisclaimerHtmlPath = path.join(rootDir, "public", "ai-disclaimer", "index.html");
  const aiDisclaimerFlatHtmlPath = path.join(rootDir, "public", "ai-disclaimer.html");

  describe("1. Landing Page (public/index.html)", () => {
    it("has zero analytics tags, zero gtag initialization, and zero tracking events", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assertNoTrackingInHtml(html, "Landing page (public/index.html)");
      assert.ok(!html.includes("sessionStorage.setItem"), "Must not write to sessionStorage");
      assert.ok(!html.includes("sessionStorage.getItem"), "Must not read from sessionStorage");
      assert.ok(!html.includes("localStorage"), "Must not use localStorage");
    });

    it("contains in-memory campaign parameter forwarding script", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assert.ok(html.includes("In-Memory Campaign Parameter Forwarding"), "Must include in-memory forwarding script");
      assert.ok(html.includes("utm_source"), "Must check utm_source");
      assert.ok(html.includes("URLSearchParams"), "Must use URLSearchParams for in-memory extraction");
    });

    it("preserves core landing page structure, CTAs, and navigation", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assert.ok(html.includes('id="hero_google_play_btn"'), "Must preserve hero Play Store button ID");
      assert.ok(html.includes('id="hero_explore_dreams_btn"'), "Must preserve explore dreams button ID");
      assert.ok(html.includes('id="footer_google_play_btn"'), "Must preserve footer Play Store button ID");
      assert.ok(html.includes('id="primary-nav-menu"'), "Must preserve primary nav menu ID");
      assert.ok(html.includes('href="/privacy-policy"'), "Must preserve privacy policy link");
      assert.ok(html.includes('href="/terms-of-use"'), "Must preserve terms of use link");
      assert.ok(html.includes('href="/ai-disclaimer"'), "Must preserve AI disclaimer link");
    });
  });

  describe("2. Static Legal & Disclaimer Pages", () => {
    it("public/privacy-policy.html and nested index.html have zero tracking scripts", () => {
      const html1 = fs.readFileSync(privacyHtmlPath, "utf8");
      const html2 = fs.readFileSync(privacyFlatHtmlPath, "utf8");

      for (const [idx, html] of [html1, html2].entries()) {
        const name = idx === 0 ? "public/privacy-policy/index.html" : "public/privacy-policy.html";
        assertNoTrackingInHtml(html, name);
        assert.ok(html.includes("In-Memory Campaign Parameter Forwarding"), `${name} must include in-memory forwarding`);
      }
    });

    it("public/terms-of-use.html and nested index.html have zero tracking scripts", () => {
      const html1 = fs.readFileSync(termsHtmlPath, "utf8");
      const html2 = fs.readFileSync(termsFlatHtmlPath, "utf8");

      for (const [idx, html] of [html1, html2].entries()) {
        const name = idx === 0 ? "public/terms-of-use/index.html" : "public/terms-of-use.html";
        assertNoTrackingInHtml(html, name);
        assert.ok(html.includes("In-Memory Campaign Parameter Forwarding"), `${name} must include in-memory forwarding`);
      }
    });

    it("public/ai-disclaimer.html and nested index.html have zero tracking scripts", () => {
      const html1 = fs.readFileSync(aiDisclaimerHtmlPath, "utf8");
      const html2 = fs.readFileSync(aiDisclaimerFlatHtmlPath, "utf8");

      for (const [idx, html] of [html1, html2].entries()) {
        const name = idx === 0 ? "public/ai-disclaimer/index.html" : "public/ai-disclaimer.html";
        assertNoTrackingInHtml(html, name);
        assert.ok(html.includes("In-Memory Campaign Parameter Forwarding"), `${name} must include in-memory forwarding`);
      }
    });
  });

  describe("3. Dynamic Serverless SSR Endpoints", () => {
    it("api/privacy-policy.js serves HTML with zero tracking scripts and in-memory forwarder", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await privacyPolicyHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"]?.includes("text/html"));
      assertNoTrackingInHtml(res.body, "api/privacy-policy.js response");
      assert.ok(res.body.includes("In-Memory Campaign Parameter Forwarding"));
    });

    it("api/terms-of-use.js serves HTML with zero tracking scripts and in-memory forwarder", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await termsOfUseHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"]?.includes("text/html"));
      assertNoTrackingInHtml(res.body, "api/terms-of-use.js response");
      assert.ok(res.body.includes("In-Memory Campaign Parameter Forwarding"));
    });

    it("api/ai-disclaimer.js serves HTML with zero tracking scripts and in-memory forwarder", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await aiDisclaimerHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"]?.includes("text/html"));
      assertNoTrackingInHtml(res.body, "api/ai-disclaimer.js response");
      assert.ok(res.body.includes("In-Memory Campaign Parameter Forwarding"));
    });

    it("api/dreams/index.js (/dreams) serves HTML with zero tracking scripts and in-memory forwarder", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await directoryPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"]?.includes("text/html"));
      assertNoTrackingInHtml(res.body, "api/dreams/index.js response");
      assert.ok(res.body.includes("In-Memory Campaign Parameter Forwarding"));
      assert.ok(res.body.includes("All Dream Meanings") || res.body.includes("Common &amp; Universal Dreams"));
    });

    it("api/dreams/[topic].js (/dreams/:topic) serves HTML with zero tracking scripts and in-memory forwarder", async () => {
      const req = {
        method: "GET",
        query: { topic: "falling-dreams" },
        url: "/dreams/falling-dreams"
      };
      const res = createMockResponse();
      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"]?.includes("text/html"));
      assertNoTrackingInHtml(res.body, "api/dreams/[topic].js 200 response");
      assert.ok(res.body.includes("In-Memory Campaign Parameter Forwarding"));
      assert.ok(res.body.includes("Falling in Dreams"));
    });

    it("api/dreams/[topic].js 404 handler serves HTML with zero tracking scripts", async () => {
      const req = {
        method: "GET",
        query: { topic: "non-existent-topic" },
        url: "/dreams/non-existent-topic"
      };
      const res = createMockResponse();
      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 404);
      assert.ok(res.headers["content-type"]?.includes("text/html"));
      assertNoTrackingInHtml(res.body, "api/dreams/[topic].js 404 response");
    });
  });

  describe("4. Privacy Policy Disclosures Accuracy", () => {
    it("accurately explains that the website does not use tracking cookies or persistent storage", () => {
      const html = fs.readFileSync(privacyHtmlPath, "utf8");

      // Verify website negative disclosures
      assert.ok(
        html.includes("does not employ website traffic analytics") ||
        html.includes("does not use cookies"),
        "Privacy policy must disclose absence of website traffic analytics/cookies"
      );
      assert.ok(
        html.includes("without persistent storage") ||
        html.includes("processed in memory"),
        "Privacy policy must explain in-memory parameter forwarding"
      );

      // Verify mobile app positive disclosures remain accurate
      assert.ok(html.includes("Google Analytics for Firebase"), "Must retain mobile app Firebase disclosure");
      assert.ok(html.includes("Google AdMob"), "Must retain mobile app AdMob disclosure");
      assert.ok(html.includes("Google Play Install Referrer"), "Must retain Google Play Install Referrer disclosure");
    });
  });
});
