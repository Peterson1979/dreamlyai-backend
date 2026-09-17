// api/privacy-policy.js
const fs = require("fs");
const path = require("path");

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Privacy Policy for Dreamly AI — Learn how your dream journal data, AI interpretations, and app measurements are handled with a local-first, privacy-focused approach.">
  <title>Dreamly AI Privacy Policy</title>
  <link rel="canonical" href="https://dreamlyai.life/privacy-policy">
  <link rel="icon" type="image/png" href="/assets/ic_interpret1.png">

  <!-- Open Graph Meta -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="Dreamly AI Privacy Policy">
  <meta property="og:description" content="Privacy Policy for Dreamly AI — Learn how your dream journal data, AI interpretations, and app measurements are handled with a local-first, privacy-focused approach.">
  <meta property="og:url" content="https://dreamlyai.life/privacy-policy">
  <meta property="og:site_name" content="Dreamly AI">
  <meta property="og:image" content="https://dreamlyai.life/assets/ic_interpret1.png">

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
      --accent-emerald: #34d399;
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
      max-width: 920px;
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

    .nav-menu a:hover {
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

    /* Document Header */
    .doc-header {
      padding: 2rem 0 2rem;
      border-bottom: 1px solid var(--nav-border);
      margin-bottom: 2rem;
    }

    .doc-header h1 {
      font-size: clamp(2rem, 4vw, 2.6rem);
      font-weight: 800;
      color: var(--text-main);
      letter-spacing: -0.025em;
      margin-bottom: 0.75rem;
    }

    .meta-info {
      color: var(--text-muted);
      font-size: 0.92rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
    }

    .meta-info span {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .meta-info strong {
      color: var(--accent-light);
    }

    /* Document Content */
    .legal-card {
      background: rgba(14, 18, 36, 0.78);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      padding: 2.25rem 2rem;
      margin-bottom: 2rem;
      box-shadow: var(--shadow-subtle);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    h2 {
      font-size: 1.35rem;
      color: var(--text-main);
      margin-top: 2rem;
      margin-bottom: 0.85rem;
      font-weight: 700;
      letter-spacing: -0.015em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .legal-card > section:first-child > h2 {
      margin-top: 0;
    }

    p {
      margin-bottom: 1.15rem;
      color: var(--text-body);
      line-height: 1.75;
    }

    ul {
      margin-bottom: 1.25rem;
      padding-left: 1.5rem;
    }

    li {
      margin-bottom: 0.6rem;
      color: var(--text-body);
      line-height: 1.65;
    }

    strong {
      color: var(--text-main);
    }

    a {
      color: var(--accent-light);
      text-decoration: underline;
      transition: color 0.2s ease;
    }

    a:hover {
      color: var(--accent-moon);
    }

    .highlight-box {
      background: rgba(129, 140, 248, 0.08);
      border: 1px solid rgba(165, 180, 252, 0.2);
      border-radius: var(--radius-md);
      padding: 1.35rem 1.5rem;
      margin: 1.5rem 0;
    }

    .highlight-box p {
      margin-bottom: 0;
      color: var(--text-main);
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
      padding-left: 0;
    }

    .footer-col a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .footer-col a:hover,
    .footer-col a.active {
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
      .legal-card {
        padding: 1.6rem 1.25rem;
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
          <li><a href="/dreams">Dream Encyclopedia</a></li>
          <li>
            <a href="https://play.google.com/store/apps/details?id=com.oberon.dreamlyai" class="btn btn-primary nav-cta" target="_blank" rel="noopener noreferrer">
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
      <span aria-current="page">Privacy Policy</span>
    </nav>

    <div class="doc-header">
      <h1>Dreamly AI Privacy Policy</h1>
      <div class="meta-info">
        <span><strong>Application:</strong> Dreamly AI</span>
        <span><strong>Package:</strong> com.oberon.dreamlyai</span>
        <span><strong>Platform:</strong> Android &amp; Web</span>
        <span><strong>Last updated:</strong> March 2026</span>
      </div>
    </div>

    <div class="legal-card">
      <section>
        <h2>1. Introduction &amp; Overview</h2>
        <p>
          This Privacy Policy outlines how <strong>Dreamly AI</strong> ("we", "our", or "the app") processes information when you use our Android mobile application and associated web services.
        </p>
        <p>
          Dreamly AI is a personal dream exploration, journaling, and AI-assisted dream interpretation application designed for Android. We are committed to data minimization, privacy protection, and transparent practices.
        </p>
      </section>

      <section>
        <h2>2. Architecture &amp; Data Minimization</h2>
        <p>
          Dreamly AI is engineered with a <strong>local-first architecture</strong>:
        </p>
        <div class="highlight-box">
          <p>
            <strong>Core Privacy Principle:</strong> Your dream journal entries, audio voice recordings, and personal journal statistics are stored locally on your device. We do not maintain user account registries or permanent cloud dream databases.
          </p>
        </div>
        <p>
          You do not need to register, create a username and password, or provide personal identification to use Dreamly AI.
        </p>
      </section>

      <section>
        <h2>3. Information We Process &amp; How It Is Handled</h2>
        <p><strong>A. On-Device Journal Storage (Local Only):</strong></p>
        <ul>
          <li><strong>Dream Entries:</strong> Dream titles, written dream narratives, dates, times, dream types (such as Lucid, Vivid, Nightmare, Recurring), vividness ratings, and emotional intensity ratings are saved locally in a private SQLite database on your Android device.</li>
          <li><strong>Voice Notes:</strong> When you record a voice memo to capture a dream upon waking, the audio file is saved exclusively in your device's local application storage. Voice recordings are never uploaded or sent to external servers or AI providers.</li>
          <li><strong>Calendar &amp; Patterns:</strong> Recurring motif statistics and pattern calculations are performed locally on your device based on your stored journal entries.</li>
        </ul>

        <p><strong>B. Information Transmitted for AI Interpretation:</strong></p>
        <ul>
          <li><strong>Dream Narrative &amp; Tags:</strong> When you voluntarily tap to request an AI interpretation, the written dream narrative, along with optional symbol keywords, emotion tags, and selected language, is transmitted over an encrypted HTTPS connection to our backend serverless service.</li>
          <li><strong>Interpretation Output:</strong> Our backend generates a structured 6-part reflective interpretation (Summary, Detailed Analysis, Symbols, Emotions, Event Sequence, and Possible Meaning) and streams the response back to your device.</li>
        </ul>

        <p><strong>C. Device Permissions:</strong></p>
        <ul>
          <li><strong>Microphone Permission (<code>android.permission.RECORD_AUDIO</code>):</strong> Used solely for on-device voice recording of dream notes. Voice audio remains strictly local and is never transmitted over the internet.</li>
          <li><strong>Location Permissions:</strong> Dreamly AI does not request or use GPS, fine location, or coarse location permissions.</li>
          <li><strong>Network Layer:</strong> Standard IP addresses are transmitted at the network layer during secure HTTPS communication with the backend and integrated services.</li>
        </ul>
      </section>

      <section>
        <h2>4. AI Processing &amp; Backend Infrastructure</h2>
        <p>
          To generate natural-language interpretations, incoming interpretation requests are processed through reputable cloud and AI infrastructure providers:
        </p>
        <ul>
          <li><strong>Backend Hosting:</strong> <strong>Vercel</strong> (for serverless API execution and static delivery).</li>
          <li><strong>AI Inference Providers:</strong> <strong>Google Gemini</strong> and <strong>Groq</strong> AI APIs (for generating structured dream interpretations).</li>
          <li><strong>Operational Rate Limiting &amp; Infrastructure:</strong> <strong>Upstash Redis</strong> is utilized as backend infrastructure strictly for operational rate limiting, duplicate-request suppression, and token budget management to ensure service stability and abuse prevention. Upstash Redis is backend infrastructure and is not contacted directly by the mobile app. User dream narratives and generated interpretations are never stored, logged, or retained in Redis.</li>
        </ul>
      </section>

      <section>
        <h2>5. Advertising – Google AdMob</h2>
        <p>
          Dreamly AI displays advertisements using <strong>Google AdMob</strong>, an advertising service provided by <strong>Google LLC</strong>.
        </p>
        <p>
          To serve banner and interstitial advertisements, prevent ad fraud, ensure security, and provide ad measurement, Google AdMob and its SDK may automatically collect and process certain device and usage information, including:
        </p>
        <ul>
          <li>Device identifiers, including the Google Advertising ID (AAID) where available.</li>
          <li>IP address and general network connection details.</li>
          <li>Ad interaction, viewability, click, and impression data.</li>
          <li>Diagnostic and technical performance data related to ad serving.</li>
        </ul>
        <p>
          Google's data processing activities are governed by Google's Privacy Policy. For more information on how Google processes advertising data, please review:
        </p>
        <ul>
          <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy (https://policies.google.com/privacy)</a></li>
          <li><a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">How Google uses information from sites or apps that use our services (https://policies.google.com/technologies/ads)</a></li>
        </ul>
      </section>

      <section>
        <h2>6. Analytics &amp; Product Measurement Disclosures</h2>
        <p>
          To evaluate product stability, understand feature engagement, and measure organic acquisition, Dreamly AI utilizes <strong>Google Analytics for Firebase</strong> (within the Android mobile application) and <strong>Google Analytics</strong> (on our website).
        </p>
        <p><strong>A. Measurement Purposes:</strong></p>
        <ul>
          <li>Measuring product lifecycle milestones and activation (such as first open, initiating a dream entry, and receiving an interpretation).</li>
          <li>Understanding feature engagement (such as viewing the dream journal, calendar patterns, saving favorites, and sharing entries).</li>
          <li>Measuring organic acquisition and installation attribution via the Google Play Install Referrer (evaluating campaign sources without personal profiling).</li>
        </ul>
        <p><strong>B. Non-Sensitive Event Parameters &amp; Strict Content Safeguards:</strong></p>
        <p>
          In full accordance with our privacy principles, mobile app analytics measurements utilize only high-level, non-sensitive event parameters, such as:
        </p>
        <ul>
          <li>Selected application language (<code>language</code>)</li>
          <li>Aggregated dream count buckets (<code>dream_count_bucket</code>)</li>
          <li>Entry creation source (<code>entry_source</code>)</li>
          <li>Share action type (<code>share_type</code>)</li>
          <li>Active screen name (<code>screen</code>)</li>
          <li>Content category type (<code>content_type</code>)</li>
        </ul>
        <div class="highlight-box">
          <p>
            <strong>Strict Content Safeguard:</strong> Dreamly AI does NOT transmit dream narrative text, interpretation text, personal names, specific emotions, symbols, audio recordings, or arbitrary user-generated notes to analytics systems.
          </p>
        </div>
        <p><strong>C. Website Measurement &amp; UTM Campaign Attribution:</strong></p>
        <p>
          The Dreamly AI website uses client-side session storage (<code>sessionStorage</code>) to temporarily maintain standard acquisition campaign parameters (such as UTM source, medium, campaign, content, term, and referrer sources) across pages. When a user clicks to visit the Google Play Store, these parameters are attached to the Google Play Store URL to measure install attribution. The website does not employ third-party advertising tracking pixels or cross-site profiling cookies.
        </p>
        <p><strong>D. Third-Party Networks:</strong></p>
        <p>
          Google Analytics operates under Google's Privacy Policy (<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">https://policies.google.com/privacy</a>). Users can manage ad identifiers and device personalization through Android Settings (Google &gt; Ads).
        </p>
        <p>
          We do not sell user data, nor do we integrate Mobile Measurement Partners (MMPs such as AppsFlyer, Adjust, or Singular), data brokers, or social network tracking pixels.
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <ul>
          <li><strong>On-Device Data:</strong> Your journal records, patterns, and voice memos remain on your local device until you modify or delete them within the app, clear application storage, or uninstall the app.</li>
          <li><strong>Backend State:</strong> The backend functions statelessly. AI interpretation processing is transient and ephemeral; dream narratives are processed in memory and streamed directly back to your device without persistent storage on our servers. Operational rate-limiting counters and duplicate-suppression hashes on Upstash Redis expire automatically based on standard short TTL configurations.</li>
        </ul>
      </section>

      <section>
        <h2>8. Data Security</h2>
        <p>
          All communications between the mobile application and backend services are encrypted in transit using standard HTTPS / TLS (Transport Layer Security). We enforce strict security controls and minimize server-side data retention to protect against unauthorized access.
        </p>
      </section>

      <section>
        <h2>9. User Rights &amp; Data Control</h2>
        <p>
          You retain complete ownership and control over your information within Dreamly AI:
        </p>
        <ul>
          <li>You can add, edit, export, or delete individual dream entries at any time directly in the app.</li>
          <li>You can reset or manage advertising identifiers and ad personalization through your Android device settings (under Google &gt; Ads).</li>
          <li>You can delete all locally stored app data at any time through Android Settings &gt; Apps &gt; Dreamly AI &gt; Storage &gt; Clear Storage, or by uninstalling the application.</li>
        </ul>
      </section>

      <section>
        <h2>10. Children's Privacy</h2>
        <p>
          Dreamly AI is not directed to children under the age of 13 (or under 16 in applicable jurisdictions), and we do not knowingly collect personal information from children. If you believe a child has provided personal information to the application, please contact us so that we can take appropriate steps.
        </p>
      </section>

      <section>
        <h2>11. Cookies &amp; Web Tracking</h2>
        <p>
          The Dreamly AI website does not use persistent tracking cookies, cross-site trackers, or third-party marketing pixels. It utilizes standard client-side <code>sessionStorage</code> solely for temporary UTM campaign attribution during your active browsing session.
        </p>
      </section>

      <section>
        <h2>12. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect updates to application features or legal requirements. When changes are made, the "Last updated" date at the top of this document will be revised accordingly.
        </p>
      </section>

      <section>
        <h2>13. Contact Information</h2>
        <p>
          If you have questions, inquiries, or feedback regarding this Privacy Policy or data handling in Dreamly AI, you may contact us through the official Dreamly AI Google Play app listing and support channels at:
        </p>
        <p>
          <a href="https://play.google.com/store/apps/details?id=com.oberon.dreamlyai" target="_blank" rel="noopener noreferrer">https://play.google.com/store/apps/details?id=com.oberon.dreamlyai</a>
        </p>
      </section>
    </div>
  </main>

  <!-- Footer -->
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
            <li><a href="/privacy-policy" class="active">Privacy Policy</a></li>
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
</body>
</html>`;

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.status(200).send(PRIVACY_POLICY_HTML);
};

module.exports.PRIVACY_POLICY_HTML = PRIVACY_POLICY_HTML;
