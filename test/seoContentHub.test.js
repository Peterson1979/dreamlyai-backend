/**
 * Unit Tests for Dream SEO Content Hub v1
 *
 * Tests topic page SSR (/dreams/:topic), directory hub (/dreams),
 * dynamic sitemap (/sitemap.xml), and crawler directives.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const topicPageHandler = require("../api/dreams/[topic]");
const directoryPageHandler = require("../api/dreams/index");
const sitemapHandler = require("../api/sitemap");
const { getAllTopics, getTopicById } = require("../content/topics/registry");

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
    json(content) {
      this.headers["content-type"] = "application/json";
      this.body = JSON.stringify(content);
      return this;
    }
  };
  return res;
}

describe("Dream SEO Content Hub v1", () => {
  describe("1. Topic Page Handler (/dreams/:topic)", () => {
    it("renders valid SEO page for registered topic (teeth-falling-out)", async () => {
      const req = {
        method: "GET",
        query: { topic: "teeth-falling-out" },
        url: "/dreams/teeth-falling-out"
      };
      const res = createMockResponse();

      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("text/html"));
      assert.ok(res.headers["cache-control"].includes("public"));

      const html = res.body;

      // Meta tags
      assert.ok(html.includes("<title>Teeth Falling Out in Dreams: Stress, Control &amp; Life Transitions — Dreamly AI</title>"));
      assert.ok(html.includes('<meta name="description"'));
      assert.ok(html.includes('<link rel="canonical" href="https://dreamlyai.life/dreams/teeth-falling-out">'));
      assert.ok(html.includes('<meta property="og:type" content="article">'));
      assert.ok(html.includes('<meta property="og:title"'));
      assert.ok(html.includes('<meta property="og:url" content="https://dreamlyai.life/dreams/teeth-falling-out">'));

      // JSON-LD Schemas
      assert.ok(html.includes('"@type": "Article"'));
      assert.ok(html.includes('"@type": "BreadcrumbList"'));
      assert.ok(html.includes('"url": "https://dreamlyai.life/dreams/teeth-falling-out"'));

      // Content Sections
      assert.ok(html.includes("Understanding This Dream Experience"));
      assert.ok(html.includes("Reflective Angles &amp; Questions"));
      assert.ok(html.includes("Decode Symbolic Dream Imagery"));

      // Play Store CTA with UTM attribution
      assert.ok(html.includes("https://play.google.com/store/apps/details?id=com.oberon.dreamlyai"));
      assert.ok(html.includes("utm_source%3Dwebsite"));
      assert.ok(html.includes("utm_campaign%3Dseo_hub"));
      assert.ok(html.includes("utm_content%3Dteeth-falling-out"));
    });

    it("resolves topic from path URL fallback when query.topic is empty", async () => {
      const req = {
        method: "GET",
        query: {},
        url: "/dreams/falling-dreams"
      };
      const res = createMockResponse();

      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes("Falling in Dreams: What Sudden Drops &amp; Hypnic Jerks Mean"));
    });

    it("returns 404 for non-existent topic", async () => {
      const req = {
        method: "GET",
        query: { topic: "non-existent-dream-topic-xyz" },
        url: "/dreams/non-existent-dream-topic-xyz"
      };
      const res = createMockResponse();

      await topicPageHandler(req, res);

      assert.equal(res.statusCode, 404);
      assert.ok(res.body.includes("Dream Topic Not Found"));
    });

    it("rejects non-GET methods with 405", async () => {
      const req = { method: "POST", query: { topic: "teeth-falling-out" } };
      const res = createMockResponse();

      await topicPageHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  describe("2. Directory Page Handler (/dreams)", () => {
    it("renders topic hub listing all registered topics grouped by category", async () => {
      const req = { method: "GET", url: "/dreams" };
      const res = createMockResponse();

      await directoryPageHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("text/html"));
      assert.ok(res.headers["cache-control"].includes("public"));

      const html = res.body;

      // Meta and titles
      assert.ok(html.includes("Dream Meanings &amp; Sleep Science Directory — Dreamly AI"));
      assert.ok(html.includes('<link rel="canonical" href="https://dreamlyai.life/dreams">'));

      // JSON-LD ItemList
      assert.ok(html.includes('"@type": "ItemList"'));
      assert.ok(html.includes('"@type": "BreadcrumbList"'));

      // Category headers
      assert.ok(html.includes("Common &amp; Universal Dreams"));
      assert.ok(html.includes("Dream Symbols &amp; Archetypes"));
      assert.ok(html.includes("Emotions &amp; Relationships"));
      assert.ok(html.includes("Dream Science &amp; Sleep Health"));
      assert.ok(html.includes("Lucid &amp; Vivid Dreaming"));

      // Every registered topic is linked
      const allTopics = getAllTopics();
      for (const topic of allTopics) {
        assert.ok(
          html.includes(`/dreams/${topic.id}`),
          `Expected directory to link to /dreams/${topic.id}`
        );
      }

      // Visual Hub Icon & Identity
      assert.ok(html.includes("ic_edu.png"), "Expected directory to include ic_edu.png icon");
      assert.ok(html.includes("Dream Meaning &amp; Sleep Science Hub"), "Expected directory to include hub title");

      // CTA Banner
      assert.ok(html.includes("Journal &amp; Decode Your Dreams with Dreamly AI"));
      assert.ok(html.includes("utm_content%3Ddreams_index"));
    });

    it("rejects non-GET methods with 405", async () => {
      const req = { method: "POST", url: "/dreams" };
      const res = createMockResponse();

      await directoryPageHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  describe("3. Dynamic Sitemap Handler (/sitemap.xml)", () => {
    it("generates valid XML sitemap containing homepage, hub, and all topics", async () => {
      const req = { method: "GET", url: "/sitemap.xml" };
      const res = createMockResponse();

      await sitemapHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("application/xml"));
      assert.ok(res.headers["cache-control"].includes("public"));

      const xml = res.body;

      assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));

      // Core static URLs
      assert.ok(xml.includes("<loc>https://dreamlyai.life/</loc>"));
      assert.ok(xml.includes("<loc>https://dreamlyai.life/dreams</loc>"));
      assert.ok(xml.includes("<loc>https://dreamlyai.life/privacy-policy</loc>"));

      // All 21 topic URLs
      const allTopics = getAllTopics();
      for (const topic of allTopics) {
        assert.ok(
          xml.includes(`<loc>https://dreamlyai.life/dreams/${topic.id}</loc>`),
          `Expected sitemap to include https://dreamlyai.life/dreams/${topic.id}`
        );
      }
    });

    it("rejects non-GET methods with 405", async () => {
      const req = { method: "DELETE", url: "/sitemap.xml" };
      const res = createMockResponse();

      await sitemapHandler(req, res);
      assert.equal(res.statusCode, 405);
    });
  });

  describe("4. Robots.txt and Static Configuration", () => {
    it("public/robots.txt exists and points to the sitemap", () => {
      const robotsPath = path.join(__dirname, "..", "public", "robots.txt");
      assert.ok(fs.existsSync(robotsPath), "public/robots.txt should exist");

      const content = fs.readFileSync(robotsPath, "utf8");
      assert.ok(content.includes("User-agent: *"));
      assert.ok(content.includes("Allow: /"));
      assert.ok(content.includes("Sitemap: https://dreamlyai.life/sitemap.xml"));
    });
  });
});
