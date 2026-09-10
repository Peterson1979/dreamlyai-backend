// test/privacyPolicy.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const privacyPolicyHandler = require("../api/privacy-policy");

describe("Landing Page & Privacy Policy Verification", () => {
  const rootDir = path.resolve(__dirname, "..");
  const landingHtmlPath = path.join(rootDir, "public", "index.html");
  const privacyHtmlPath = path.join(rootDir, "public", "privacy-policy", "index.html");
  const privacyFlatHtmlPath = path.join(rootDir, "public", "privacy-policy.html");
  const vercelJsonPath = path.join(rootDir, "vercel.json");

  it("Landing page (public/index.html) exists and meets all requirements", () => {
    assert.ok(fs.existsSync(landingHtmlPath), "public/index.html must exist");
    const html = fs.readFileSync(landingHtmlPath, "utf8");

    // Title & Meta
    assert.ok(html.includes("<title>Dreamly AI"), "Title must identify Dreamly AI");
    assert.ok(html.includes('<meta name="description"'), "Meta description must be present");
    assert.ok(html.includes('<meta property="og:title"'), "Open Graph title must be present");

    // Product identity & content
    assert.ok(html.includes("Dreamly AI"), "Must clearly identify Dreamly AI");
    assert.ok(html.includes("dream interpretation"), "Must describe dream interpretation");

    // Exact Google Play CTA URL
    const googlePlayUrl = "https://play.google.com/store/apps/details?id=com.oberon.dreamlyai";
    assert.ok(html.includes(googlePlayUrl), `Must contain exact Google Play CTA: ${googlePlayUrl}`);

    // Navigation & Privacy link
    assert.ok(html.includes('href="/privacy-policy"'), "Must contain Privacy Policy link");

    // Negative constraints on landing page
    assert.ok(!html.toLowerCase().includes("developer"), "Landing page must NOT contain the word 'developer'");
    assert.ok(!html.includes("Forray"), "Landing page must NOT contain developer name");
    assert.ok(!html.includes("Gyöngyi"), "Landing page must NOT contain developer name");
    assert.ok(!html.includes("<script"), "Landing page must NOT contain external or inline JavaScript scripts");
  });

  it("Privacy policy static files exist and contain required substantive disclosures", () => {
    assert.ok(fs.existsSync(privacyHtmlPath), "public/privacy-policy/index.html must exist");
    assert.ok(fs.existsSync(privacyFlatHtmlPath), "public/privacy-policy.html must exist");

    const html = fs.readFileSync(privacyHtmlPath, "utf8");

    assert.ok(html.includes("Dreamly AI Privacy Policy"), "Must have Dreamly AI Privacy Policy title");
    assert.ok(html.includes("com.oberon.dreamlyai"), "Must disclose package name com.oberon.dreamlyai");
    assert.ok(html.includes("Google AdMob"), "Must disclose Google AdMob");
    assert.ok(html.includes("Google LLC"), "Must disclose Google LLC");
    assert.ok(html.includes("https://policies.google.com/privacy"), "Must link to Google Privacy Policy");
    assert.ok(html.includes("https://policies.google.com/technologies/ads"), "Must link to Google Ads policies");
    assert.ok(html.includes("https://play.google.com/store/apps/details?id=com.oberon.dreamlyai"), "Must link to Google Play support");
    assert.ok(html.includes("Google Gemini"), "Must disclose Gemini AI inference");
    assert.ok(html.includes("Groq"), "Must disclose Groq AI inference");
    assert.ok(html.includes("Upstash Redis"), "Must disclose Upstash Redis caching/rate limiting");
    assert.ok(html.includes("RECORD_AUDIO"), "Must disclose RECORD_AUDIO microphone permission");
  });

  it("api/privacy-policy.js serverless route responds with HTTP 200 and text/html", async () => {
    let statusCode = 0;
    let headers = {};
    let body = "";

    const req = { method: "GET" };
    const res = {
      setHeader(name, val) {
        headers[name.toLowerCase()] = val;
      },
      status(code) {
        statusCode = code;
        return this;
      },
      send(data) {
        body = data;
        return this;
      }
    };

    await privacyPolicyHandler(req, res);

    assert.equal(statusCode, 200, "Serverless handler must return HTTP 200");
    assert.ok(headers["content-type"]?.includes("text/html"), "Content-Type must be text/html");
    assert.ok(headers["content-type"]?.includes("charset=utf-8"), "Charset must be utf-8");
    assert.ok(body.includes("Dreamly AI Privacy Policy"), "Body must contain Privacy Policy HTML");
  });

  it("vercel.json preserves crons/functions and includes privacy-policy rewrite and cleanUrls", () => {
    assert.ok(fs.existsSync(vercelJsonPath), "vercel.json must exist");
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));

    assert.equal(vercelConfig.cleanUrls, true, "cleanUrls must be enabled");
    assert.ok(Array.isArray(vercelConfig.rewrites), "rewrites must be configured");

    const privacyRewrite = vercelConfig.rewrites.find((r) => r.source === "/privacy-policy");
    assert.ok(privacyRewrite, "Rewrite for /privacy-policy must exist");
    assert.equal(privacyRewrite.destination, "/api/privacy-policy");

    // Preserve existing crons & functions
    assert.ok(Array.isArray(vercelConfig.crons), "Existing crons must be preserved");
    assert.equal(vercelConfig.crons[0]?.path, "/api/social-run");
    assert.ok(vercelConfig.functions?.["api/**/*.js"], "Existing function config must be preserved");
  });
});
