/**
 * Dynamic XML Sitemap Generator for Dreamly AI
 *
 * Endpoint: /sitemap.xml
 * Automatically indexes the homepage, /dreams directory, /privacy-policy,
 * and all registered canonical /dreams/:topic URLs.
 */

const { getAllTopics } = require("../content/topics/registry");

const BASE_URL = "https://dreamlyai-backend.vercel.app";

function escapeXml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateSitemapXml(topics = [], now = new Date()) {
  const lastMod = now.toISOString().slice(0, 10);

  const staticUrls = [
    { loc: `${BASE_URL}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${BASE_URL}/dreams`, changefreq: "daily", priority: "0.9" },
    { loc: `${BASE_URL}/privacy-policy`, changefreq: "monthly", priority: "0.3" },
    { loc: `${BASE_URL}/terms-of-use`, changefreq: "monthly", priority: "0.3" },
    { loc: `${BASE_URL}/ai-disclaimer`, changefreq: "monthly", priority: "0.3" }
  ];

  const topicUrls = topics.map((topic) => ({
    loc: `${BASE_URL}/dreams/${topic.id}`,
    changefreq: "weekly",
    priority: topic.priority <= 5 ? "0.85" : "0.75"
  }));

  const allUrls = [...staticUrls, ...topicUrls];

  const xmlEntries = allUrls.map((item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
}

module.exports = async function sitemapHandler(req, res) {
  if (req?.method && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const topics = getAllTopics();
  const xml = generateSitemapXml(topics);

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return res.status(200).send(xml);
};

module.exports.generateSitemapXml = generateSitemapXml;
