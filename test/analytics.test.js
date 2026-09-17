/**
 * Unit Tests for Google Analytics 4 (GA4) Integration
 *
 * Verifies official Google tag implementation, measurement ID consistency,
 * and universal presence across all production website pages.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { GA_MEASUREMENT_ID, getGoogleTagHeadScript } = require("../utils/analytics");
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

describe("Google Analytics 4 (GA4) Integration Verification", () => {
  const rootDir = path.resolve(__dirname, "..");
  const landingHtmlPath = path.join(rootDir, "public", "index.html");
  const privacyHtmlPath = path.join(rootDir, "public", "privacy-policy", "index.html");
  const privacyFlatHtmlPath = path.join(rootDir, "public", "privacy-policy.html");
  const termsHtmlPath = path.join(rootDir, "public", "terms-of-use", "index.html");
  const termsFlatHtmlPath = path.join(rootDir, "public", "terms-of-use.html");
  const aiDisclaimerHtmlPath = path.join(rootDir, "public", "ai-disclaimer", "index.html");
  const aiDisclaimerFlatHtmlPath = path.join(rootDir, "public", "ai-disclaimer.html");

  describe("1. Centralized Analytics Module (utils/analytics.js)", () => {
    it("exports exact production GA4 measurement ID", () => {
      assert.equal(GA_MEASUREMENT_ID, "G-G70KM0K4XS");
    });

    it("generates official Google tag (gtag.js) script snippet", () => {
      const script = getGoogleTagHeadScript();
      assert.ok(script.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(script.includes("dataLayer"));
      assert.ok(script.includes("gtag('js', new Date())"));
      assert.ok(script.includes("gtag('config', 'G-G70KM0K4XS')"));
    });
  });

  describe("2. Landing Page (public/index.html)", () => {
    it("contains official Google tag snippet in <head>", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");
      assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
    });
  });

  describe("3. Legal & Disclaimer Static Pages", () => {
    it("public/privacy-policy.html and public/privacy-policy/index.html contain GA4 tag", () => {
      const html1 = fs.readFileSync(privacyHtmlPath, "utf8");
      const html2 = fs.readFileSync(privacyFlatHtmlPath, "utf8");

      for (const html of [html1, html2]) {
        assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
        assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
      }
    });

    it("public/terms-of-use.html and public/terms-of-use/index.html contain GA4 tag", () => {
      const html1 = fs.readFileSync(termsHtmlPath, "utf8");
      const html2 = fs.readFileSync(termsFlatHtmlPath, "utf8");

      for (const html of [html1, html2]) {
        assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
        assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
      }
    });

    it("public/ai-disclaimer.html and public/ai-disclaimer/index.html contain GA4 tag", () => {
      const html1 = fs.readFileSync(aiDisclaimerHtmlPath, "utf8");
      const html2 = fs.readFileSync(aiDisclaimerFlatHtmlPath, "utf8");

      for (const html of [html1, html2]) {
        assert.ok(html.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
        assert.ok(html.includes("gtag('config', 'G-G70KM0K4XS')"));
      }
    });
  });

  describe("4. Dynamic Serverless SSR Endpoints", () => {
    it("api/privacy-policy.js serves HTML with GA4 tag", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await privacyPolicyHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
    });

    it("api/terms-of-use.js serves HTML with GA4 tag", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await termsOfUseHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
    });

    it("api/ai-disclaimer.js serves HTML with GA4 tag", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await aiDisclaimerHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
    });

    it("api/dreams/index.js (/dreams) serves HTML with GA4 tag", async () => {
      const req = { method: "GET" };
      const res = createMockResponse();
      await directoryPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("https://www.googletagmanager.com/gtag/js?id=G-G70KM0K4XS"));
      assert.ok(res.body.includes("gtag('config', 'G-G70KM0K4XS')"));
    });

    it("api/dreams/[topic].js (/dreams/:topic) serves HTML with GA4 tag", async () => {
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
    });

    it("api/dreams/[topic].js 404 handler serves HTML with GA4 tag", async () => {
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
    });
  });
});
