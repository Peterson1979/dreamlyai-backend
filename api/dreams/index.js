/**
 * Dream Topics Directory Page Handler for Dreamly AI
 *
 * Endpoint: /dreams
 * Renders an organized hub of all registered dream topics, grouped by category,
 * for SEO indexing and user navigation.
 */

const { getAllTopics } = require("../../content/topics/registry");
const { buildAttributedPlayStoreUrl } = require("../../social/urlBuilder");
const { getGoogleTagHeadScript, getMeasurementFoundationScript } = require("../../utils/analytics");

const CATEGORY_ORDER = Object.freeze([
  "common_dreams",
  "dream_symbols",
  "emotions_themes",
  "dream_science",
  "lucid_vivid",
  "reflection"
]);

const CATEGORY_METADATA = Object.freeze({
  common_dreams: {
    title: "Common & Universal Dreams",
    description: "Themes and patterns behind widespread dreams like falling, being chased, and lateness."
  },
  dream_symbols: {
    title: "Dream Symbols & Archetypes",
    description: "Exploration of common dream imagery, animals, objects, and elemental metaphors."
  },
  emotions_themes: {
    title: "Emotions & Relationships",
    description: "Navigating dreams about people you know, past partners, and intense feelings."
  },
  dream_science: {
    title: "Dream Science & Sleep Health",
    description: "Understanding REM cycles, nighttime biology, sleep paralysis, and nightmare causes."
  },
  lucid_vivid: {
    title: "Lucid & Vivid Dreaming",
    description: "Techniques for conscious nighttime awareness, flying dreams, and dream control."
  },
  reflection: {
    title: "Mindful Reflection & Journaling",
    description: "Prompts and introspective practices to connect personal waking life with sleep memories."
  }
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

function renderDirectoryHtml(topics) {
  const canonicalUrl = "https://dreamlyai.life/dreams";
  const playStoreUrl = buildAttributedPlayStoreUrl({
    platform: "website",
    medium: "organic",
    campaign: "seo_hub",
    contentId: "dreams_index"
  });

  // Group topics by category
  const grouped = {};
  for (const cat of CATEGORY_ORDER) {
    grouped[cat] = [];
  }

  for (const topic of topics) {
    if (!grouped[topic.category]) {
      grouped[topic.category] = [];
    }
    grouped[topic.category].push(topic);
  }

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Dreamly AI Dream Meaning & Sleep Science Directory",
    "description": "Comprehensive library of dream symbols, common dream patterns, and sleep science reflections.",
    "url": canonicalUrl,
    "numberOfItems": topics.length,
    "itemListElement": topics.map((topic, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": topic.title,
      "url": `https://dreamlyai.life/dreams/${topic.id}`
    }))
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
        "item": canonicalUrl
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dream Meanings &amp; Sleep Science Directory — Dreamly AI</title>
  <meta name="description" content="Explore thoughtful guides on dream symbols, common dream themes, sleep biology, and reflective dream interpretations with Dreamly AI.">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" type="image/png" href="/assets/ic_interpret1.png">

  <!-- Open Graph / Social Media Meta -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="Dream Meanings &amp; Sleep Science Directory — Dreamly AI">
  <meta property="og:description" content="Explore thoughtful guides on dream symbols, common dream themes, sleep biology, and reflective dream interpretations with Dreamly AI.">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:site_name" content="Dreamly AI">
  <meta property="og:image" content="https://dreamlyai.life/assets/ic_interpret1.png">

${getGoogleTagHeadScript()}

  <!-- Structured Data JSON-LD -->
  <script type="application/ld+json">
${JSON.stringify(itemListJsonLd, null, 2)}
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
      line-height: 1.65;
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
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* Navigation */
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

    /* Hero */
    .hero {
      padding: 2.5rem 0 3.5rem;
      text-align: center;
      position: relative;
    }

    .section-header-icon-wrap {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .section-header-icon {
      width: 68px;
      height: 68px;
      border-radius: 18px;
      object-fit: cover;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 20px rgba(129, 140, 248, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.14);
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

    .hero h1 {
      font-size: clamp(2rem, 4.5vw, 2.8rem);
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.2;
      letter-spacing: -0.025em;
      margin-bottom: 1rem;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-lead {
      color: var(--text-muted);
      font-size: 1.1rem;
      line-height: 1.7;
      max-width: 680px;
      margin: 0 auto;
    }

    /* Category Section */
    .category-section {
      margin-bottom: 3.5rem;
    }

    .category-header {
      margin-bottom: 1.25rem;
    }

    .category-header h2 {
      font-size: 1.45rem;
      color: var(--text-main);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 0.35rem;
    }

    .category-header p {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    /* Topic Cards */
    .topics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.25rem;
    }

    .topic-card {
      background: rgba(14, 18, 36, 0.75);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
      transition: all 0.22s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: var(--shadow-subtle);
    }

    .topic-card:hover {
      border-color: var(--card-border-hover);
      background: rgba(21, 27, 52, 0.85);
      transform: translateY(-3px);
    }

    .topic-card h3 {
      font-size: 1.12rem;
      color: var(--text-main);
      margin-bottom: 0.6rem;
      line-height: 1.35;
      font-weight: 600;
    }

    .topic-card p {
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.55;
      margin-bottom: 1.25rem;
      flex-grow: 1;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.86rem;
      color: var(--accent-light);
      font-weight: 600;
      padding-top: 0.75rem;
      border-top: 1px solid var(--nav-border);
    }

    /* CTA Banner */
    .cta-banner {
      background:
        linear-gradient(135deg, rgba(67, 56, 202, 0.28) 0%, rgba(14, 18, 36, 0.85) 100%);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      padding: 3.25rem 2rem;
      text-align: center;
      margin: 4rem 0 2rem;
      box-shadow: var(--shadow-elevated);
      position: relative;
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
      color: var(--text-muted);
      max-width: 620px;
      margin: 0 auto 1.85rem;
      font-size: 1.02rem;
      line-height: 1.6;
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
      margin-top: 3rem;
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
      .hero {
        padding: 2.5rem 0 2rem;
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
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span>&rsaquo;</span>
      <span aria-current="page">Dream Topics</span>
    </nav>

    <section class="hero">
      <div class="section-header-icon-wrap">
        <img src="/assets/ic_edu.png" alt="Dream Meaning &amp; Sleep Science Hub" class="section-header-icon">
      </div>
      <div>
        <span class="badge">🌙 Dream Meaning &amp; Sleep Science Hub</span>
      </div>
      <h1>Explore Dream Interpretations &amp; Symbols</h1>
      <p class="hero-lead">
        Discover structured reflections, psychological perspectives, and sleep science insights across common dream themes and personal symbols.
      </p>
    </section>

    <!-- Topics by Category -->
    ${CATEGORY_ORDER.map((catKey) => {
      const catMeta = CATEGORY_METADATA[catKey] || { title: catKey, description: "" };
      const catTopics = grouped[catKey] || [];
      if (catTopics.length === 0) return "";

      return `
      <section class="category-section">
        <div class="category-header">
          <h2>${escapeHtml(catMeta.title)}</h2>
          <p>${escapeHtml(catMeta.description)}</p>
        </div>
        <div class="topics-grid">
          ${catTopics.map((topic) => `
          <a href="/dreams/${escapeHtml(topic.id)}" class="topic-card">
            <div>
              <h3>${escapeHtml(topic.title)}</h3>
              <p>${escapeHtml(topic.searchIntent)}</p>
            </div>
            <div class="card-footer">
              <span>Read guide</span>
              <span>&rarr;</span>
            </div>
          </a>
          `).join("")}
        </div>
      </section>
      `;
    }).join("")}

    <!-- CTA Banner -->
    <section class="cta-banner">
      <h2>Journal &amp; Decode Your Dreams with Dreamly AI</h2>
      <p>Log your nighttime memories securely on your Android device. Track recurring patterns, explore symbols, and receive private AI reflections.</p>
      <a href="${escapeHtml(playStoreUrl)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.609 1.814L13.792 12 3.61 22.186a2.38 2.38 0 0 1-.61-.735V2.55c.18-.286.39-.536.61-.736zm11.24 11.24l2.58 2.58-12.04 6.95 9.46-9.53zm0-2.108L5.39 1.417l12.04 6.95-2.58 2.58zM18.8 11.21l3.18 1.83a1.59 1.59 0 0 1 0 2.76l-3.18 1.83-2.11-2.11 2.11-2.31z"/>
        </svg>
        <span>Get Dreamly AI on Google Play</span>
      </a>
    </section>
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
${getMeasurementFoundationScript()}
</body>
</html>`;
}

module.exports = async function directoryPageHandler(req, res) {
  if (req?.method && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const topics = getAllTopics();
  const html = renderDirectoryHtml(topics);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return res.status(200).send(html);
};

module.exports.renderDirectoryHtml = renderDirectoryHtml;
