// api/privacy-policy.js
const fs = require("fs");
const path = require("path");

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Privacy Policy for the Dreamly AI mobile application.">
  <title>Dreamly AI Privacy Policy</title>
  <style>
    :root {
      --bg-color: #0b0d17;
      --card-bg: #131627;
      --text-color: #e2e8f0;
      --heading-color: #f8fafc;
      --muted-color: #94a3b8;
      --accent-color: #6366f1;
      --accent-light: #818cf8;
      --border-color: #232842;
      --link-color: #818cf8;
      --link-hover: #a5b4fc;
      --line-height: 1.7;
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg-color: #f8fafc;
        --card-bg: #ffffff;
        --text-color: #334155;
        --heading-color: #0f172a;
        --muted-color: #64748b;
        --accent-color: #4f46e5;
        --accent-light: #6366f1;
        --border-color: #e2e8f0;
        --link-color: #4f46e5;
        --link-hover: #3730a3;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: var(--line-height);
      padding: 2rem 1rem;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 2.5rem 2rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .nav-back {
      margin-bottom: 1.5rem;
    }

    .nav-back a {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--link-color);
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
    }

    .nav-back a:hover {
      color: var(--link-hover);
      text-decoration: underline;
    }

    header {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2rem;
      color: var(--heading-color);
      margin-bottom: 0.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .meta-info {
      color: var(--muted-color);
      font-size: 0.95rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .meta-info span {
      display: inline-block;
    }

    h2 {
      font-size: 1.35rem;
      color: var(--heading-color);
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      font-weight: 600;
      border-left: 3px solid var(--accent-light);
      padding-left: 0.75rem;
    }

    p {
      margin-bottom: 1rem;
      color: var(--text-color);
    }

    ul {
      margin-bottom: 1rem;
      padding-left: 1.5rem;
    }

    li {
      margin-bottom: 0.5rem;
      color: var(--text-color);
    }

    a {
      color: var(--link-color);
      text-decoration: underline;
    }

    a:hover {
      color: var(--link-hover);
    }

    .highlight-box {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
      margin: 1.5rem 0;
    }

    .highlight-box strong {
      color: var(--heading-color);
    }

    footer {
      border-top: 1px solid var(--border-color);
      padding-top: 1.5rem;
      margin-top: 3rem;
      text-align: center;
      font-size: 0.9rem;
      color: var(--muted-color);
    }

    @media (max-width: 600px) {
      .container {
        padding: 1.5rem 1.25rem;
      }
      h1 {
        font-size: 1.6rem;
      }
      h2 {
        font-size: 1.2rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav-back">
      <a href="/">&larr; Back to Dreamly AI Home</a>
    </div>

    <header>
      <h1>Dreamly AI Privacy Policy</h1>
      <div class="meta-info">
        <span><strong>Application:</strong> Dreamly AI</span>
        <span><strong>Package:</strong> com.oberon.dreamlyai</span>
        <span><strong>Last updated:</strong> March 2026</span>
      </div>
    </header>

    <main>
      <section>
        <h2>1. Introduction &amp; Overview</h2>
        <p>
          This Privacy Policy outlines how <strong>Dreamly AI</strong> ("we", "our", or "the app") handles information when you use our mobile application and related web services.
        </p>
        <p>
          Dreamly AI is a personal dream journaling and AI-assisted dream interpretation application designed for Android. We are committed to data minimization, privacy protection, and transparent practices.
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
          <li><strong>Dream Entries:</strong> Dream titles, written dream narratives, dates, times, dream types (such as Lucid, Vivid, Nightmare, Recurring), vividness ratings, and emotional intensity ratings are saved locally in an encrypted/private SQLite database on your Android device.</li>
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
          <li><strong>Operational Rate Limiting &amp; Caching:</strong> <strong>Upstash Redis</strong> is utilized as backend infrastructure for operational rate limiting, abuse prevention, and temporary caching of generated interpretations to ensure fast responses and service stability. Upstash Redis is backend infrastructure and is not contacted directly by the mobile app. User dream narratives are never permanently logged or stored in Redis keys.</li>
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
        <h2>6. Analytics &amp; Tracking SDK Disclosures</h2>
        <p>
          The Dreamly AI mobile application does not integrate standalone third-party analytics, crash tracking, or behavioral profiling SDKs such as Firebase Analytics, Google Analytics, Firebase Crashlytics, Meta/Facebook SDK, AppsFlyer, Adjust, Branch, Mixpanel, Amplitude, or Segment.
        </p>
        <p>
          Advertising-related data processing is conducted independently by Google AdMob as described in Section 5.
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <ul>
          <li><strong>On-Device Data:</strong> Your journal records and voice memos remain on your local device until you modify or delete them within the app, clear application data, or uninstall the app.</li>
          <li><strong>Backend State:</strong> The backend does not maintain persistent user account databases. Ephemeral cache and rate-limiting entries on Upstash Redis expire automatically based on standard TTL configurations.</li>
        </ul>
      </section>

      <section>
        <h2>8. Data Security</h2>
        <p>
          All communications between the mobile application and backend services are encrypted in transit using standard HTTPS / TLS (Transport Layer Security). We enforce fail-closed security controls and minimize server-side data retention to protect against unauthorized access.
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
        <h2>11. Cookies &amp; Tracking on This Webpage</h2>
        <p>
          This Privacy Policy webpage and the Dreamly AI backend API endpoints do not use cookies, web beacons, tracking pixels, or third-party web analytics tools.
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
    </main>

    <footer>
      <p><a href="/" style="color: var(--link-color); text-decoration: none;">&larr; Back to Dreamly AI Home</a></p>
      <p style="margin-top: 0.5rem;">&copy; 2026 Dreamly AI &bull; All rights reserved.</p>
    </footer>
  </div>
</body>
</html>`;

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.status(200).send(PRIVACY_POLICY_HTML);
};

module.exports.PRIVACY_POLICY_HTML = PRIVACY_POLICY_HTML;
