/**
 * Dynamic SEO Topic Page Handler for Dreamly AI
 *
 * Endpoint: /dreams/:topic
 * Resolves topic from content registry and renders an SEO-optimized landing page
 * with JSON-LD structured data (Article, Breadcrumbs), meta tags, reflective content,
 * and attributed Play Store conversion CTAs.
 */

const { getTopicById, getTopicsByCategory } = require("../../content/topics/registry");
const { buildAttributedPlayStoreUrl } = require("../../social/urlBuilder");

const CATEGORY_LABELS = Object.freeze({
  dream_symbols: "Dream Symbols & Archetypes",
  dream_science: "Dream Science & Sleep Health",
  common_dreams: "Common & Universal Dreams",
  emotions_themes: "Emotions & Life Themes",
  dream_recall: "Dream Recall & Memory",
  lucid_vivid: "Lucid & Vivid Dreaming",
  reflection: "Mindful Reflection & Growth"
});

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTopicIdFromRequest(req) {
  if (req?.query?.topic && typeof req.query.topic === "string") {
    const clean = req.query.topic.trim().toLowerCase();
    if (clean.length > 0 && clean !== "index") return clean;
  }
  if (req?.query?.slug && typeof req.query.slug === "string") {
    const clean = req.query.slug.trim().toLowerCase();
    if (clean.length > 0 && clean !== "index") return clean;
  }
  const url = typeof req?.url === "string" ? req.url.split("?")[0].split("#")[0] : "";
  const match = url.match(/\/dreams\/([a-z0-9-]+)/i) || url.match(/\/api\/dreams\/([a-z0-9-]+)/i);
  if (match && match[1] && match[1].toLowerCase() !== "index") {
    return match[1].toLowerCase();
  }
  return null;
}

function renderNotFoundHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topic Not Found — Dreamly AI</title>
  <meta name="robots" content="noindex, follow">
  <style>
    :root {
      --bg-color: #0b0d17;
      --card-bg: #131627;
      --card-border: #232842;
      --text-color: #e2e8f0;
      --heading-color: #f8fafc;
      --muted-color: #94a3b8;
      --accent-color: #6366f1;
      --accent-light: #818cf8;
      --btn-bg: #4f46e5;
      --btn-hover: #4338ca;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg-color: #f8fafc;
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --text-color: #334155;
        --heading-color: #0f172a;
        --muted-color: #64748b;
        --accent-color: #4f46e5;
        --accent-light: #6366f1;
        --btn-bg: #4f46e5;
        --btn-hover: #3730a3;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: 1.6;
      padding: 3rem 1.5rem;
      text-align: center;
    }
    .container { max-width: 600px; margin: 0 auto; background: var(--card-bg); padding: 2.5rem; border-radius: 12px; border: 1px solid var(--card-border); }
    h1 { color: var(--heading-color); font-size: 1.75rem; margin-bottom: 1rem; }
    p { color: var(--muted-color); margin-bottom: 2rem; }
    .btn { display: inline-block; background: var(--btn-bg); color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; }
    .btn:hover { background: var(--btn-hover); }
  </style>
</head>
<body>
  <div class="container">
    <h1>Dream Topic Not Found</h1>
    <p>The dream symbol or topic you are searching for is not available or may have been moved.</p>
    <a href="/dreams" class="btn">Explore All Dream Topics &rarr;</a>
  </div>
</body>
</html>`;
}

function renderTopicHtml(topic) {
  const canonicalUrl = `https://dreamlyai-backend.vercel.app/dreams/${topic.id}`;
  const categoryLabel = CATEGORY_LABELS[topic.category] || topic.category.replace(/_/g, " ");
  const relatedTopics = getTopicsByCategory(topic.category).filter((t) => t.id !== topic.id).slice(0, 4);

  const playStoreUrl = buildAttributedPlayStoreUrl({
    platform: "website",
    medium: "organic",
    campaign: "seo_hub",
    contentId: topic.id
  });

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": topic.title,
    "description": topic.searchIntent,
    "url": canonicalUrl,
    "mainEntityOfPage": canonicalUrl,
    "keywords": topic.keywords.join(", "),
    "articleSection": categoryLabel,
    "publisher": {
      "@type": "Organization",
      "name": "Dreamly AI",
      "url": "https://dreamlyai-backend.vercel.app/"
    }
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://dreamlyai-backend.vercel.app/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Dream Topics",
        "item": "https://dreamlyai-backend.vercel.app/dreams"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": topic.title,
        "item": canonicalUrl
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(topic.title)} — Dreamly AI</title>
  <meta name="description" content="${escapeHtml(topic.searchIntent)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(topic.title)}">
  <meta property="og:description" content="${escapeHtml(topic.searchIntent)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:site_name" content="Dreamly AI">

  <!-- Twitter Meta -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(topic.title)}">
  <meta name="twitter:description" content="${escapeHtml(topic.searchIntent)}">

  <!-- Structured Data JSON-LD -->
  <script type="application/ld+json">
${JSON.stringify(articleJsonLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumbJsonLd, null, 2)}
  </script>

  <style>
    :root {
      --bg-color: #0b0d17;
      --card-bg: #131627;
      --card-border: #232842;
      --card-hover-border: #6366f1;
      --text-color: #e2e8f0;
      --heading-color: #f8fafc;
      --muted-color: #94a3b8;
      --accent-color: #6366f1;
      --accent-light: #818cf8;
      --accent-gradient: linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #38bdf8 100%);
      --btn-bg: #4f46e5;
      --btn-hover: #4338ca;
      --btn-text: #ffffff;
      --border-color: #1e243d;
      --link-color: #818cf8;
      --link-hover: #a5b4fc;
      --shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg-color: #f8fafc;
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --card-hover-border: #6366f1;
        --text-color: #334155;
        --heading-color: #0f172a;
        --muted-color: #64748b;
        --accent-color: #4f46e5;
        --accent-light: #6366f1;
        --accent-gradient: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #0284c7 100%);
        --btn-bg: #4f46e5;
        --btn-hover: #3730a3;
        --btn-text: #ffffff;
        --border-color: #e2e8f0;
        --link-color: #4f46e5;
        --link-hover: #3730a3;
        --shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 0 1.5rem; }

    /* Header & Nav */
    header {
      border-bottom: 1px solid var(--border-color);
      background-color: var(--bg-color);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
    }
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--heading-color);
      text-decoration: none;
    }
    .brand-icon { width: 26px; height: 26px; fill: var(--accent-light); }
    .nav-links { display: flex; gap: 1.25rem; list-style: none; }
    .nav-links a { color: var(--muted-color); text-decoration: none; font-size: 0.95rem; font-weight: 500; }
    .nav-links a:hover { color: var(--heading-color); }

    /* Breadcrumbs */
    .breadcrumbs {
      padding: 1.5rem 0 0.5rem;
      font-size: 0.85rem;
      color: var(--muted-color);
    }
    .breadcrumbs a { color: var(--link-color); text-decoration: none; }
    .breadcrumbs a:hover { text-decoration: underline; }
    .breadcrumbs span { margin: 0 0.4rem; }

    /* Article Hero */
    .topic-hero {
      padding: 2rem 0 2.5rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--accent-light);
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.25;
      color: var(--heading-color);
      margin-bottom: 1.25rem;
      letter-spacing: -0.02em;
    }
    .lead {
      font-size: 1.15rem;
      color: var(--muted-color);
      line-height: 1.6;
    }

    /* Content Cards */
    .content-card {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: var(--shadow);
    }
    .content-card h2 {
      font-size: 1.4rem;
      color: var(--heading-color);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .content-card p {
      margin-bottom: 1rem;
    }
    .content-card p:last-child {
      margin-bottom: 0;
    }

    /* Reflective Angles Grid */
    .angles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
      margin-top: 1.25rem;
    }
    .angle-item {
      background: var(--bg-color);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
    }
    .angle-item h3 {
      font-size: 1rem;
      color: var(--heading-color);
      margin-bottom: 0.5rem;
    }
    .angle-item p {
      font-size: 0.9rem;
      color: var(--muted-color);
      margin: 0;
    }

    /* Keywords Tag Cloud */
    .keywords-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .keyword-tag {
      background: var(--bg-color);
      border: 1px solid var(--card-border);
      color: var(--muted-color);
      font-size: 0.85rem;
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
    }

    /* CTA Callout */
    .cta-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(192, 132, 252, 0.1) 100%);
      border: 1px solid var(--accent-light);
      border-radius: 14px;
      padding: 2.5rem 2rem;
      text-align: center;
      margin: 3rem 0;
    }
    .cta-banner h2 {
      font-size: 1.6rem;
      color: var(--heading-color);
      margin-bottom: 0.75rem;
    }
    .cta-banner p {
      max-width: 650px;
      margin: 0 auto 1.75rem;
      color: var(--text-color);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.85rem 1.75rem;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .btn-primary {
      background-color: var(--btn-bg);
      color: var(--btn-text);
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    }
    .btn-primary:hover {
      background-color: var(--btn-hover);
      transform: translateY(-1px);
    }
    .btn-icon { width: 20px; height: 20px; fill: currentColor; }

    /* Related Topics */
    .related-section {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border-color);
    }
    .related-section h2 {
      font-size: 1.3rem;
      color: var(--heading-color);
      margin-bottom: 1.25rem;
    }
    .related-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }
    .related-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.2s;
    }
    .related-card:hover {
      border-color: var(--accent-light);
    }
    .related-card h3 {
      font-size: 1rem;
      color: var(--heading-color);
      margin-bottom: 0.4rem;
    }
    .related-card p {
      font-size: 0.85rem;
      color: var(--muted-color);
      line-height: 1.4;
      margin: 0;
    }

    /* Footer */
    footer {
      border-top: 1px solid var(--border-color);
      padding: 3rem 0;
      margin-top: 4rem;
      text-align: center;
      color: var(--muted-color);
      font-size: 0.9rem;
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      list-style: none;
      margin-bottom: 1rem;
    }
    .footer-links a { color: var(--muted-color); text-decoration: none; }
    .footer-links a:hover { color: var(--heading-color); }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <nav>
        <a href="/" class="brand">
          <svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-5.4-5.4c0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
          </svg>
          <span>Dreamly AI</span>
        </a>
        <ul class="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/dreams">All Topics</a></li>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main class="container">
    <!-- Breadcrumbs -->
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span>&rsaquo;</span>
      <a href="/dreams">Dream Topics</a>
      <span>&rsaquo;</span>
      <span aria-current="page">${escapeHtml(topic.title)}</span>
    </nav>

    <!-- Hero Header -->
    <section class="topic-hero">
      <div class="badge">🌙 ${escapeHtml(categoryLabel)}</div>
      <h1>${escapeHtml(topic.title)}</h1>
      <p class="lead">${escapeHtml(topic.searchIntent)}</p>
    </section>

    <!-- Overview Section -->
    <section class="content-card">
      <h2>Understanding This Dream Experience</h2>
      <p>
        Dreams featuring <strong>${escapeHtml(topic.title)}</strong> often arise during Rapid Eye Movement (REM) sleep, when the brain consolidates emotionally charged memories and subconscious reflections. Rather than serving as rigid predictions or definitive psychological diagnoses, these experiences offer rich, subjective starting points for personal reflection.
      </p>
      <p>
        Sleep science suggests that thematic dreams reflect how our waking nervous system processes stress, aspirations, and relationships. By examining how you felt upon waking—whether calm, startled, or curious—you can gain meaningful insight into what your subconscious was navigating overnight.
      </p>

      <div class="keywords-list" aria-label="Related search themes">
        ${topic.keywords.map((k) => `<span class="keyword-tag"># ${escapeHtml(k)}</span>`).join("\n        ")}
      </div>
    </section>

    <!-- Reflective Questions & Angles -->
    <section class="content-card">
      <h2>Reflective Angles &amp; Questions to Ask Yourself</h2>
      <p>Consider these perspective shifts and mindful questions when reflecting on your dream:</p>
      
      <div class="angles-grid">
        ${topic.socialAngles.map((angle, idx) => `
        <article class="angle-item">
          <h3>${idx + 1}. ${escapeHtml(angle)}</h3>
          <p>How does this theme connect with recent conversations, decisions, or feelings in your waking life?</p>
        </article>
        `).join("")}
      </div>
    </section>

    <!-- App CTA Banner -->
    <section class="cta-banner">
      <h2>${escapeHtml(topic.appCTA.headline)}</h2>
      <p>${escapeHtml(topic.appCTA.body)}</p>
      <a href="${escapeHtml(playStoreUrl)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.609 1.814L13.792 12 3.61 22.186a2.38 2.38 0 0 1-.61-.735V2.55c.18-.286.39-.536.61-.736zm11.24 11.24l2.58 2.58-12.04 6.95 9.46-9.53zm0-2.108L5.39 1.417l12.04 6.95-2.58 2.58zM18.8 11.21l3.18 1.83a1.59 1.59 0 0 1 0 2.76l-3.18 1.83-2.11-2.11 2.11-2.31z"/>
        </svg>
        <span>${escapeHtml(topic.appCTA.buttonText)}</span>
      </a>
    </section>

    ${relatedTopics.length > 0 ? `
    <!-- Related Topics -->
    <section class="related-section">
      <h2>More in ${escapeHtml(categoryLabel)}</h2>
      <div class="related-grid">
        ${relatedTopics.map((rel) => `
        <a href="/dreams/${escapeHtml(rel.id)}" class="related-card">
          <h3>${escapeHtml(rel.title)}</h3>
          <p>${escapeHtml(rel.searchIntent.slice(0, 110))}...</p>
        </a>
        `).join("")}
      </div>
    </section>
    ` : ""}
  </main>

  <footer>
    <div class="container">
      <ul class="footer-links">
        <li><a href="/">Home</a></li>
        <li><a href="/dreams">Dream Directory</a></li>
        <li><a href="/privacy-policy">Privacy Policy</a></li>
        <li><a href="https://play.google.com/store/apps/details?id=com.oberon.dreamlyai" target="_blank" rel="noopener noreferrer">Google Play Store</a></li>
      </ul>
      <p>&copy; 2026 Dreamly AI. Private On-Device Dream Journaling &amp; AI Reflections.</p>
    </div>
  </footer>
</body>
</html>`;
}

module.exports = async function topicPageHandler(req, res) {
  if (req?.method && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const topicId = getTopicIdFromRequest(req);
  if (!topicId) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(404).send(renderNotFoundHtml());
  }

  const topic = getTopicById(topicId);
  if (!topic) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(404).send(renderNotFoundHtml());
  }

  const html = renderTopicHtml(topic);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return res.status(200).send(html);
};

module.exports.renderTopicHtml = renderTopicHtml;
module.exports.renderNotFoundHtml = renderNotFoundHtml;
module.exports.getTopicIdFromRequest = getTopicIdFromRequest;
