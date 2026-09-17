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
const { getGoogleTagHeadScript, getMeasurementFoundationScript } = require("../../utils/analytics");

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

${getGoogleTagHeadScript()}

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
${getMeasurementFoundationScript()}
</body>
</html>`;
}

function renderTopicHtml(topic) {
  const canonicalUrl = `https://dreamlyai.life/dreams/${topic.id}`;
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
      "url": "https://dreamlyai.life/"
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
        "item": "https://dreamlyai.life/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Dream Topics",
        "item": "https://dreamlyai.life/dreams"
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
  <link rel="icon" type="image/png" href="/assets/ic_interpret1.png">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(topic.title)}">
  <meta property="og:description" content="${escapeHtml(topic.searchIntent)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:site_name" content="Dreamly AI">
  <meta property="og:image" content="https://dreamlyai.life/assets/ic_interpret1.png">

  <!-- Twitter Meta -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(topic.title)}">
  <meta name="twitter:description" content="${escapeHtml(topic.searchIntent)}">

${getGoogleTagHeadScript()}

  <!-- Structured Data JSON-LD -->
  <script type="application/ld+json">
${JSON.stringify(articleJsonLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumbJsonLd, null, 2)}
  </script>

  <style>
    :root {
      --bg-deep: #070913;
      --bg-surface: #0e1224;
      --bg-surface-elevated: #151b34;
      --card-border: rgba(165, 180, 252, 0.12);
      --card-border-hover: rgba(165, 180, 252, 0.35);
      --text-main: #f1f5f9;
      --text-body: #cbd5e1;
      --text-muted: #8e9bb4;
      --accent-soft: #818cf8;
      --accent-light: #a5b4fc;
      --accent-glow: rgba(129, 140, 248, 0.25);
      --accent-moon: #c7d2fe;
      --accent-gold: #fbbf24;
      --accent-emerald: #34d399;
      --accent-cyan: #38bdf8;
      --btn-primary-bg: #4338ca;
      --btn-primary-hover: #3730a3;
      --btn-text: #ffffff;
      --nav-border: rgba(148, 163, 184, 0.1);
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --shadow-subtle: 0 4px 20px rgba(0, 0, 0, 0.4);
      --shadow-elevated: 0 12px 36px rgba(0, 0, 0, 0.55);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      position: relative;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-deep);
      color: var(--text-body);
      line-height: 1.7;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    body::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: -1;
      background:
        radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99, 102, 241, 0.12), transparent 70%),
        linear-gradient(180deg, rgba(7, 9, 19, 0.2) 0%, rgba(7, 9, 19, 0.4) 35%, rgba(7, 9, 19, 0.55) 70%, rgba(5, 7, 14, 0.72) 100%),
        url('/assets/ic_background.jpg') center top / cover no-repeat;
      pointer-events: none;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* Header & Nav */
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(7, 9, 19, 0.75);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--nav-border);
    }

    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.9rem 0;
      white-space: nowrap;
      position: relative;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: var(--text-main);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      z-index: 101;
    }

    .brand-logo-img {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      object-fit: cover;
      box-shadow: 0 0 12px var(--accent-glow);
    }

    .nav-toggle {
      display: none;
      background: transparent;
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      padding: 0.5rem;
      width: 42px;
      height: 42px;
      position: relative;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      gap: 5px;
      transition: all 0.2s ease;
      z-index: 101;
    }

    .nav-toggle:hover,
    .nav-toggle:focus-visible {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--card-border-hover);
      outline: 2px solid var(--accent-soft);
      outline-offset: 2px;
    }

    .nav-toggle-bar {
      display: block;
      width: 20px;
      height: 2px;
      background-color: var(--text-main);
      border-radius: 2px;
      transition: transform 0.25s ease, opacity 0.2s ease;
    }

    .nav-toggle[aria-expanded="true"] .nav-toggle-bar:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    .nav-toggle[aria-expanded="true"] .nav-toggle-bar:nth-child(2) {
      opacity: 0;
    }
    .nav-toggle[aria-expanded="true"] .nav-toggle-bar:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .nav-menu {
      display: flex;
      align-items: center;
      gap: 2rem;
      list-style: none;
    }

    .nav-menu a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
      transition: color 0.2s ease;
    }

    .nav-menu a:hover,
    .nav-menu a.active {
      color: var(--accent-moon);
    }

    .nav-cta {
      padding: 0.5rem 1.15rem;
      font-size: 0.9rem;
      border-radius: var(--radius-sm);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.65rem;
      padding: 0.85rem 1.65rem;
      border-radius: var(--radius-sm);
      font-size: 0.98rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.22s ease;
      cursor: pointer;
      border: 1px solid transparent;
      line-height: 1.2;
    }

    .btn-primary {
      background: var(--btn-primary-bg);
      color: var(--btn-text);
      box-shadow: 0 4px 16px rgba(67, 56, 202, 0.45);
    }

    .btn-primary:hover {
      background: var(--btn-primary-hover);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(67, 56, 202, 0.6);
    }

    .btn-icon {
      width: 19px;
      height: 19px;
      fill: currentColor;
      flex-shrink: 0;
    }

    /* Breadcrumbs */
    .breadcrumbs {
      padding: 1.5rem 0 0.5rem;
      font-size: 0.88rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .breadcrumbs a {
      color: var(--accent-light);
      text-decoration: none;
      transition: color 0.2s ease;
    }
    .breadcrumbs a:hover {
      color: var(--accent-moon);
      text-decoration: underline;
    }
    .breadcrumbs span {
      color: var(--text-muted);
    }

    /* Article Hero */
    .topic-hero {
      padding: 2rem 0 2.5rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.95rem;
      border-radius: 9999px;
      background: rgba(129, 140, 248, 0.12);
      border: 1px solid rgba(165, 180, 252, 0.22);
      color: var(--accent-light);
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-bottom: 1.25rem;
    }

    h1 {
      font-size: clamp(2rem, 4.2vw, 2.6rem);
      font-weight: 800;
      line-height: 1.22;
      color: var(--text-main);
      margin-bottom: 1.25rem;
      letter-spacing: -0.025em;
    }

    .lead {
      font-size: 1.15rem;
      color: var(--text-muted);
      line-height: 1.65;
    }

    /* Content Cards */
    .content-card {
      background: rgba(14, 18, 36, 0.78);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      padding: 2.25rem 2rem;
      margin-bottom: 2rem;
      box-shadow: var(--shadow-subtle);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .content-card h2 {
      font-size: 1.4rem;
      color: var(--text-main);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 700;
      letter-spacing: -0.015em;
    }

    .content-card p {
      margin-bottom: 1rem;
      color: var(--text-body);
      font-size: 0.98rem;
      line-height: 1.7;
    }

    .content-card p:last-child {
      margin-bottom: 0;
    }

    /* Reflective Angles Grid */
    .angles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.15rem;
      margin-top: 1.5rem;
    }

    .angle-item {
      background: rgba(21, 27, 52, 0.55);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 1.35rem;
      transition: all 0.2s ease;
    }

    .angle-item:hover {
      border-color: var(--card-border-hover);
      background: rgba(21, 27, 52, 0.75);
    }

    .angle-item h3 {
      font-size: 1.02rem;
      color: var(--text-main);
      margin-bottom: 0.5rem;
      font-weight: 600;
    }

    .angle-item p {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.55;
    }

    /* Keywords Tag Cloud */
    .keywords-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid var(--nav-border);
    }

    .keyword-tag {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 0.82rem;
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
    }

    /* CTA Callout */
    .cta-banner {
      background:
        linear-gradient(135deg, rgba(67, 56, 202, 0.28) 0%, rgba(14, 18, 36, 0.85) 100%);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      padding: 3.25rem 2rem;
      text-align: center;
      margin: 3.5rem 0 2rem;
      box-shadow: var(--shadow-elevated);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .cta-banner h2 {
      font-size: clamp(1.6rem, 3.2vw, 2.2rem);
      color: var(--text-main);
      margin-bottom: 0.85rem;
      letter-spacing: -0.02em;
    }

    .cta-banner p {
      max-width: 620px;
      margin: 0 auto 1.85rem;
      color: var(--text-muted);
      font-size: 1.02rem;
      line-height: 1.6;
    }

    /* Related Topics */
    .related-section {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--nav-border);
    }

    .related-section h2 {
      font-size: 1.35rem;
      color: var(--text-main);
      margin-bottom: 1.25rem;
      font-weight: 700;
    }

    .related-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .related-card {
      background: rgba(14, 18, 36, 0.75);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 1.25rem;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .related-card:hover {
      border-color: var(--card-border-hover);
      background: rgba(21, 27, 52, 0.85);
      transform: translateY(-2px);
    }

    .related-card h3 {
      font-size: 1rem;
      color: var(--text-main);
      margin-bottom: 0.4rem;
      font-weight: 600;
    }

    .related-card p {
      font-size: 0.86rem;
      color: var(--text-muted);
      line-height: 1.45;
      margin: 0;
    }

    /* Footer */
    footer {
      border-top: 1px solid var(--nav-border);
      padding: 3.5rem 0 2.5rem;
      font-size: 0.9rem;
      color: var(--text-muted);
      background: rgba(5, 7, 14, 0.68);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      margin-top: 4rem;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      margin-bottom: 2.5rem;
      text-align: left;
    }

    .footer-col h5 {
      color: var(--text-main);
      font-size: 0.92rem;
      font-weight: 600;
      margin-bottom: 0.95rem;
      letter-spacing: 0.02em;
    }

    .footer-col ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .footer-col a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .footer-col a:hover {
      color: var(--accent-moon);
    }

    .footer-bottom {
      border-top: 1px solid var(--nav-border);
      padding-top: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }

    @media (max-width: 860px) {
      .nav-menu {
        gap: 1.25rem;
      }
    }

    @media (max-width: 680px) {
      .topic-hero {
        padding: 2rem 0 1.5rem;
      }
      .content-card {
        padding: 1.5rem 1.25rem;
      }
      .nav-toggle {
        display: inline-flex;
      }
      .nav-menu {
        display: flex;
        flex-direction: column;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: rgba(7, 9, 19, 0.96);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-bottom: 1px solid var(--nav-border);
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
        padding: 1.25rem 1.5rem 1.75rem;
        gap: 1.25rem;
        align-items: stretch;
        text-align: center;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(-8px);
        transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s ease;
      }
      .nav-menu.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
      }
      .nav-menu li {
        width: 100%;
      }
      .nav-menu a {
        display: block;
        padding: 0.65rem 0;
        font-size: 1.05rem;
      }
      .nav-menu .nav-cta {
        margin-top: 0.5rem;
        padding: 0.75rem 1.25rem;
        display: inline-flex;
        width: 100%;
      }
      .footer-bottom {
        flex-direction: column;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <!-- Header Navigation -->
  <header>
    <div class="container">
      <nav>
        <a href="/" class="brand" aria-label="Dreamly AI Home">
          <img src="/assets/ic_interpret1.png" alt="Dreamly AI Logo" class="brand-logo-img">
          <span>Dreamly AI</span>
        </a>
        <button class="nav-toggle" id="mobile-nav-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="primary-nav-menu">
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
        </button>
        <ul class="nav-menu" id="primary-nav-menu">
          <li><a href="/">Home</a></li>
          <li><a href="/#features">Features</a></li>
          <li><a href="/dreams" class="active">Dream Encyclopedia</a></li>
          <li>
            <a href="${escapeHtml(playStoreUrl)}" class="btn btn-primary nav-cta" target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </li>
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
      <div class="footer-grid">
        <div class="footer-col">
          <div class="brand" style="margin-bottom: 0.85rem;">
            <img src="/assets/ic_interpret1.png" alt="Dreamly AI Logo" class="brand-logo-img">
            <span>Dreamly AI</span>
          </div>
          <p style="font-size: 0.88rem; line-height: 1.5; color: var(--text-muted);">
            Understand your dreams. Build your personal dream journal. Discover patterns over time.
          </p>
        </div>
        <div class="footer-col">
          <h5>Features</h5>
          <ul>
            <li><a href="/#features">AI Interpretation</a></li>
            <li><a href="/#journal">Quick Voice Journal</a></li>
            <li><a href="/#patterns">Pattern Connections</a></li>
            <li><a href="/#patterns">Bedtime Intentions</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h5>Encyclopedia</h5>
          <ul>
            <li><a href="/dreams">All Dream Meanings</a></li>
            <li><a href="/dreams/recurring-dreams">Recurring Dreams</a></li>
            <li><a href="/dreams/falling-dreams">Falling in Dreams</a></li>
            <li><a href="/dreams/lucid-dreaming">Lucid Dreaming Guide</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h5>Legal &amp; App</h5>
          <ul>
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms-of-use">Terms of Use</a></li>
            <li><a href="/ai-disclaimer">AI &amp; Content Disclaimer</a></li>
            <li><a href="https://play.google.com/store/apps/details?id=com.oberon.dreamlyai" target="_blank" rel="noopener noreferrer">Google Play Store</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Dreamly AI. All rights reserved.</p>
        <p style="font-size: 0.82rem;">Dreamly AI is designed for personal self-reflection, journaling, and entertainment.</p>
      </div>
    </div>
  </footer>

  <!-- Mobile Navigation Interaction Script -->
  <script>
    (function() {
      var navToggle = document.getElementById('mobile-nav-toggle');
      var navMenu = document.getElementById('primary-nav-menu');
      if (!navToggle || !navMenu) return;

      function toggleMenu(forceOpen) {
        var isOpen = typeof forceOpen === 'boolean' ? forceOpen : !navMenu.classList.contains('is-open');
        if (isOpen) {
          navMenu.classList.add('is-open');
          navToggle.setAttribute('aria-expanded', 'true');
        } else {
          navMenu.classList.remove('is-open');
          navToggle.setAttribute('aria-expanded', 'false');
        }
      }

      navToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleMenu();
      });

      var navLinks = navMenu.querySelectorAll('a');
      navLinks.forEach(function(link) {
        link.addEventListener('click', function() {
          toggleMenu(false);
        });
      });

      document.addEventListener('click', function(e) {
        if (navMenu.classList.contains('is-open') && !navMenu.contains(e.target) && !navToggle.contains(e.target)) {
          toggleMenu(false);
        }
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
          toggleMenu(false);
          navToggle.focus();
        }
      });
    })();
  </script>
${getMeasurementFoundationScript({ topicId: topic.id })}
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
