/**
 * Dream Topics Directory Page Handler for Dreamly AI
 *
 * Endpoint: /dreams
 * Renders an organized hub of all registered dream topics, grouped by category,
 * for SEO indexing and user navigation.
 */

const { getAllTopics } = require("../../content/topics/registry");
const { buildAttributedPlayStoreUrl } = require("../../social/urlBuilder");

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
  const canonicalUrl = "https://dreamlyai-backend.vercel.app/dreams";
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
      "url": `https://dreamlyai-backend.vercel.app/dreams/${topic.id}`
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
        "item": "https://dreamlyai-backend.vercel.app/"
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

  <!-- Open Graph / Social Media Meta -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="Dream Meanings &amp; Sleep Science Directory — Dreamly AI">
  <meta property="og:description" content="Explore thoughtful guides on dream symbols, common dream themes, sleep biology, and reflective dream interpretations with Dreamly AI.">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:site_name" content="Dreamly AI">

  <!-- Structured Data JSON-LD -->
  <script type="application/ld+json">
${JSON.stringify(itemListJsonLd, null, 2)}
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
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1040px; margin: 0 auto; padding: 0 1.5rem; }

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

    .breadcrumbs {
      padding: 1.5rem 0 0.5rem;
      font-size: 0.85rem;
      color: var(--muted-color);
    }
    .breadcrumbs a { color: var(--link-color); text-decoration: none; }
    .breadcrumbs a:hover { text-decoration: underline; }
    .breadcrumbs span { margin: 0 0.4rem; }

    .hero {
      padding: 2rem 0 3rem;
      text-align: center;
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
      color: var(--heading-color);
      margin-bottom: 1rem;
      letter-spacing: -0.02em;
    }
    .hero p {
      max-width: 680px;
      margin: 0 auto;
      color: var(--muted-color);
      font-size: 1.1rem;
    }

    .category-section {
      margin-bottom: 3.5rem;
    }
    .category-header {
      margin-bottom: 1.25rem;
    }
    .category-header h2 {
      font-size: 1.45rem;
      color: var(--heading-color);
      margin-bottom: 0.3rem;
    }
    .category-header p {
      color: var(--muted-color);
      font-size: 0.95rem;
    }

    .topics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.25rem;
    }
    .topic-card {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .topic-card:hover {
      border-color: var(--accent-light);
      transform: translateY(-2px);
      box-shadow: var(--shadow);
    }
    .topic-card h3 {
      font-size: 1.1rem;
      color: var(--heading-color);
      margin-bottom: 0.6rem;
      line-height: 1.35;
    }
    .topic-card p {
      font-size: 0.88rem;
      color: var(--muted-color);
      line-height: 1.5;
      margin-bottom: 1rem;
      flex-grow: 1;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--link-color);
      font-weight: 600;
    }

    .cta-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(192, 132, 252, 0.1) 100%);
      border: 1px solid var(--accent-light);
      border-radius: 14px;
      padding: 2.5rem 2rem;
      text-align: center;
      margin: 4rem 0;
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
          <li><a href="/dreams" style="color: var(--heading-color); font-weight: 600;">All Topics</a></li>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
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
      <div class="badge">🌙 Dream Meaning &amp; Sleep Science Hub</div>
      <h1>Explore Dream Interpretations &amp; Symbols</h1>
      <p>
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
