// test/legalPages.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const privacyPolicyHandler = require("../api/privacy-policy");
const termsOfUseHandler = require("../api/terms-of-use");
const aiDisclaimerHandler = require("../api/ai-disclaimer");
const { generateSitemapXml } = require("../api/sitemap");
const { getAllTopics } = require("../content/topics/registry");

describe("Legal & Documentation Layer Verification", () => {
  const rootDir = path.resolve(__dirname, "..");
  const landingHtmlPath = path.join(rootDir, "public", "index.html");
  const privacyHtmlPath = path.join(rootDir, "public", "privacy-policy", "index.html");
  const termsHtmlPath = path.join(rootDir, "public", "terms-of-use", "index.html");
  const termsFlatHtmlPath = path.join(rootDir, "public", "terms-of-use.html");
  const aiDisclaimerHtmlPath = path.join(rootDir, "public", "ai-disclaimer", "index.html");
  const aiDisclaimerFlatHtmlPath = path.join(rootDir, "public", "ai-disclaimer.html");
  const vercelJsonPath = path.join(rootDir, "vercel.json");

  describe("1. Privacy Policy Verification & Accuracy", () => {
    it("discloses non-sensitive analytics event parameters and confirms dream text is not sent", () => {
      const html = fs.readFileSync(privacyHtmlPath, "utf8");

      assert.ok(html.includes("language"), "Must document non-sensitive parameter: language");
      assert.ok(html.includes("dream_count_bucket"), "Must document non-sensitive parameter: dream_count_bucket");
      assert.ok(html.includes("entry_source"), "Must document non-sensitive parameter: entry_source");
      assert.ok(html.includes("share_type"), "Must document non-sensitive parameter: share_type");
      assert.ok(html.includes("screen"), "Must document non-sensitive parameter: screen");
      assert.ok(html.includes("content_type"), "Must document non-sensitive parameter: content_type");

      // Privacy boundary assertions
      assert.ok(
        html.includes("does not send free-form dream narrative text") ||
        html.includes("free-form dream text") ||
        html.includes("dream narratives"),
        "Must explicitly explain that free-form dream text is not sent to analytics"
      );
      assert.ok(html.includes("SQLite"), "Must document local-first on-device SQLite database");
    });
  });

  describe("2. Terms of Use Verification (/terms-of-use)", () => {
    it("static files exist and contain required terms sections", () => {
      assert.ok(fs.existsSync(termsHtmlPath), "public/terms-of-use/index.html must exist");
      assert.ok(fs.existsSync(termsFlatHtmlPath), "public/terms-of-use.html must exist");

      const html = fs.readFileSync(termsHtmlPath, "utf8");

      assert.ok(html.includes("Dreamly AI Terms of Use"), "Must have Terms of Use title");
      assert.ok(html.includes("Acceptance of Terms"), "Must cover Acceptance of Terms");
      assert.ok(html.includes("Description of the Service"), "Must cover Description of Service");
      assert.ok(html.includes("AI-Generated Content"), "Must cover AI-Generated Content");
      assert.ok(html.includes("No Medical or Psychological Diagnosis"), "Must cover No Medical/Psychological Diagnosis");
      assert.ok(html.includes("User Content &amp; Ownership"), "Must cover User Content & Ownership");
      assert.ok(html.includes("Acceptable Use"), "Must cover Acceptable Use");
      assert.ok(html.includes("Intellectual Property"), "Must cover Intellectual Property");
      assert.ok(html.includes("Advertising"), "Must cover Advertising");
      assert.ok(html.includes("Disclaimer of Warranties"), "Must cover Disclaimer of Warranties");
      assert.ok(html.includes("Limitation of Liability"), "Must cover Limitation of Liability");
    });

    it("api/terms-of-use.js serverless route responds with HTTP 200 and text/html", async () => {
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

      await termsOfUseHandler(req, res);

      assert.equal(statusCode, 200, "Serverless handler must return HTTP 200");
      assert.ok(headers["content-type"]?.includes("text/html"), "Content-Type must be text/html");
      assert.ok(headers["content-type"]?.includes("charset=utf-8"), "Charset must be utf-8");
      assert.ok(body.includes("Dreamly AI Terms of Use"), "Body must contain Terms of Use HTML");
    });
  });

  describe("3. AI & Content Disclaimer Verification (/ai-disclaimer)", () => {
    it("static files exist and contain required disclaimer disclosures", () => {
      assert.ok(fs.existsSync(aiDisclaimerHtmlPath), "public/ai-disclaimer/index.html must exist");
      assert.ok(fs.existsSync(aiDisclaimerFlatHtmlPath), "public/ai-disclaimer.html must exist");

      const html = fs.readFileSync(aiDisclaimerHtmlPath, "utf8");

      assert.ok(html.includes("AI &amp; Content Disclaimer"), "Must have AI & Content Disclaimer title");
      assert.ok(html.includes("Probabilistic Generation") || html.includes("probabilistic"), "Must explain AI generation nature");
      assert.ok(html.includes("Inherent Subjectivity of Dreams") || html.includes("Subjectivity"), "Must explain dream subjectivity");
      assert.ok(html.includes("No Scientific or Clinical Validation"), "Must cover lack of scientific/clinical validation");
      assert.ok(html.includes("Purpose of the Application"), "Must cover purpose for exploration/reflection");
      assert.ok(html.includes("Strict Non-Professional Advice Boundary"), "Must cover strict non-professional advice boundary");
      assert.ok(html.includes("Seeking Qualified Support"), "Must cover crisis/professional support guidance");
    });

    it("api/ai-disclaimer.js serverless route responds with HTTP 200 and text/html", async () => {
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

      await aiDisclaimerHandler(req, res);

      assert.equal(statusCode, 200, "Serverless handler must return HTTP 200");
      assert.ok(headers["content-type"]?.includes("text/html"), "Content-Type must be text/html");
      assert.ok(headers["content-type"]?.includes("charset=utf-8"), "Charset must be utf-8");
      assert.ok(body.includes("AI &amp; Content Disclaimer"), "Body must contain AI Disclaimer HTML");
    });
  });

  describe("4. Site-Wide Legal Footer & Navigation Consistency", () => {
    it("landing page footer contains all 3 legal links and top nav excludes privacy policy", () => {
      const html = fs.readFileSync(landingHtmlPath, "utf8");

      // Footer links
      assert.ok(html.includes('href="/privacy-policy"'), "Footer must link to /privacy-policy");
      assert.ok(html.includes('href="/terms-of-use"'), "Footer must link to /terms-of-use");
      assert.ok(html.includes('href="/ai-disclaimer"'), "Footer must link to /ai-disclaimer");

      // Top nav checks
      const topNavMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
      assert.ok(topNavMatch, "Navigation menu must exist");
      const topNav = topNavMatch[0];
      assert.ok(!topNav.includes('/privacy-policy'), "Top nav must NOT include /privacy-policy");
      assert.ok(!topNav.includes('/terms-of-use'), "Top nav must NOT include /terms-of-use");
      assert.ok(!topNav.includes('/ai-disclaimer'), "Top nav must NOT include /ai-disclaimer");
    });

    it("vercel.json contains rewrites for /terms-of-use and /ai-disclaimer", () => {
      const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
      const termsRewrite = vercelConfig.rewrites.find((r) => r.source === "/terms-of-use");
      const disclaimerRewrite = vercelConfig.rewrites.find((r) => r.source === "/ai-disclaimer");

      assert.ok(termsRewrite, "Rewrite for /terms-of-use must exist");
      assert.equal(termsRewrite.destination, "/api/terms-of-use");
      assert.ok(disclaimerRewrite, "Rewrite for /ai-disclaimer must exist");
      assert.equal(disclaimerRewrite.destination, "/api/ai-disclaimer");
    });

    it("sitemap generator includes /terms-of-use and /ai-disclaimer", () => {
      const topics = getAllTopics();
      const xml = generateSitemapXml(topics);

      assert.ok(xml.includes("<loc>https://dreamlyai-backend.vercel.app/terms-of-use</loc>"));
      assert.ok(xml.includes("<loc>https://dreamlyai-backend.vercel.app/ai-disclaimer</loc>"));
      assert.ok(xml.includes("<loc>https://dreamlyai-backend.vercel.app/privacy-policy</loc>"));
      assert.ok(xml.includes("<loc>https://dreamlyai-backend.vercel.app/dreams</loc>"));
      assert.ok(xml.includes("<loc>https://dreamlyai-backend.vercel.app/</loc>"));
    });
  });
});
