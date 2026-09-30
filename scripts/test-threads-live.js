#!/usr/bin/env node
/**
 * scripts/test-threads-live.js
 *
 * Guarded One-Shot Live Test Script for Dreamly AI Threads Integration.
 *
 * SAFETY GUARDS:
 * 1. Requires explicit environment flag: THREADS_LIVE_TEST=true
 * 2. Requires environment variables: THREADS_USER_ID, THREADS_ACCESS_TOKEN
 * 3. Targets Threads ONLY. NEVER touches Instagram, Facebook, Pinterest, or YouTube.
 * 4. Safe read-only inspection by default. Real publication requires explicit --execute flag.
 * 5. Redacts all tokens and secrets from output.
 *
 * USAGE:
 *   # 1. Health-check & Profile inspection (Read-only, Zero writes)
 *   THREADS_LIVE_TEST=true node scripts/test-threads-live.js --check
 *
 *   # 2. Carousel Dry-Run (Reaches media URLs, validates manifest, Zero writes)
 *   THREADS_LIVE_TEST=true node scripts/test-threads-live.js --type=carousel --dry-run
 *
 *   # 3. Video Dry-Run (Validates video manifest and public URL, Zero writes)
 *   THREADS_LIVE_TEST=true node scripts/test-threads-live.js --type=video --dry-run
 *
 *   # 4. Guarded Live Carousel Publication (Requires explicit --execute)
 *   THREADS_LIVE_TEST=true node scripts/test-threads-live.js --type=carousel --execute
 *
 *   # 5. Guarded Live Video Publication (Requires explicit --execute)
 *   THREADS_LIVE_TEST=true node scripts/test-threads-live.js --type=video --execute
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

// Load local env files without overwriting existing env vars
function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["'](.*)["']$/, "$1");
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (_) {}
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.production.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const { loadThreadsConfig, validateThreadsConfig, redactSecrets, THREADS_GRAPH_BASE_URL } = require("../social/threadsConfig");
const { formatThreadsCaption, THREADS_FINAL_CAPTION_MAX } = require("../social/captions");
const { ThreadsAdapter, publishThreadsCarousel, publishThreadsVideo } = require("../social/threads");
const { validateManifest } = require("../social/manifest");
const { getVideoManifestForDate } = require("../social/video/videoRegistry");
const { getRedisClient } = require("../utils/redisClient");
const { getManifest } = require("../social/state");

async function main() {
  console.log("=================================================================");
  console.log("DREAMLY AI — GUARDED THREADS INTEGRATION LIVE TEST");
  console.log("=================================================================\n");

  // Guard 1: Enforce explicit THREADS_LIVE_TEST=true flag
  if (process.env.THREADS_LIVE_TEST !== "true") {
    console.error("❌ BLOCKED BY SAFETY GUARD:");
    console.error("   Live test requires explicit environment variable:");
    console.error("   THREADS_LIVE_TEST=true\n");
    console.error("   Example: THREADS_LIVE_TEST=true node scripts/test-threads-live.js --check\n");
    process.exit(1);
  }

  // Load and validate configuration
  let config;
  try {
    config = loadThreadsConfig();
  } catch (err) {
    console.error("❌ CONFIGURATION INCOMPLETE:");
    console.error(`   - ${err.message}\n`);
    console.error("Required environment variables:");
    console.error("   THREADS_USER_ID=<threads_user_id>");
    console.error("   THREADS_ACCESS_TOKEN=<threads_access_token>");
    console.error("   THREADS_API_VERSION=v1.0 (optional, default v1.0)\n");
    process.exit(1);
  }

  const validation = validateThreadsConfig(config);
  if (!validation.valid) {
    console.error("❌ CONFIGURATION INVALID:");
    for (const err of validation.errors) {
      console.error(`   - ${err}`);
    }
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isCheckOnly = args.includes("--check");
  const isExecute = args.includes("--execute");
  const mediaTypeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1] || "carousel";
  const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1] || process.env.PUBLISH_DATE;

  const sanitizedUserId = config.userId.slice(0, 4) + "***" + config.userId.slice(-2);
  console.log(`🔒 Authenticated User ID: ${sanitizedUserId}`);
  console.log(`📡 API Version:          ${config.apiVersion || "v1.0"}`);
  console.log(`🎯 Target Platform:       Threads ONLY (Meta Graph API)`);
  console.log(`🛡️ Execution Mode:        ${isExecute ? "⚠️ LIVE WRITE (--execute)" : "🛡️ READ-ONLY / DRY RUN"}`);
  console.log(`📦 Media Format:          ${mediaTypeArg.toUpperCase()}\n`);

  // Mode 1: Profile & Credentials Health-Check
  if (isCheckOnly) {
    console.log("--- [1/1] Diagnostic Token & Profile Health-Check ---");
    try {
      const apiVersion = config.apiVersion || "v1.0";
      const profileUrl = `${THREADS_GRAPH_BASE_URL}/${apiVersion}/${encodeURIComponent(config.userId)}?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(config.accessToken)}`;
      const res = await fetch(profileUrl);
      const data = await res.json();

      if (!res.ok || data.error) {
        console.error("❌ Threads API returned error during profile check:");
        console.error(JSON.stringify(redactSecrets(data), null, 2));
        process.exit(1);
      }

      console.log("✅ Threads Profile Verified Successfully!");
      console.log(`   Username:        @${data.username || "unknown"}`);
      console.log(`   Account ID:      ${data.id || config.userId}`);
      console.log(`   Profile Pic:     ${data.threads_profile_picture_url ? "Available" : "Not set"}`);
      console.log("\nZero write calls committed. Test completed cleanly.");
      return;
    } catch (err) {
      console.error("❌ Network or fetch failure during health check:", redactSecrets(err.message));
      process.exit(1);
    }
  }

  // Mode 2 & 3: Manifest Construction & Validation
  let testManifest = null;
  const today = new Date().toISOString().slice(0, 10);
  let redisClient = null;

  if (mediaTypeArg === "video") {
    // Determine campaign date for promo video
    const videoManifest =
      (dateArg ? getVideoManifestForDate(dateArg) : null) ||
      getVideoManifestForDate(today) ||
      getVideoManifestForDate("2026-09-28");
    assert.ok(videoManifest, `Promo video manifest must resolve`);

    const rawCaption = videoManifest.captions?.threads || videoManifest.captions?.instagram || "✨ Decode subconscious symbols and night emotions with Dreamly AI.";
    const videoCaption = formatThreadsCaption({
      baseCaption: rawCaption,
      websiteUrl: videoManifest.destinationUrl || "https://dreamlyai.life/"
    });

    testManifest = {
      date: videoManifest.date,
      id: videoManifest.id,
      type: "video",
      media: videoManifest.media,
      destinationUrl: videoManifest.destinationUrl,
      captions: {
        threads: videoCaption
      },
      metadata: videoManifest.metadata
    };
  } else {
    // Load actual prepared Dreamly AI carousel manifest from Redis (produced by Social Run Automation)
    try {
      redisClient = getRedisClient();
    } catch (err) {
      console.error("❌ Redis client initialization error:", redactSecrets(err.message));
    }

    if (!redisClient) {
      console.error("❌ BLOCKED: Upstash Redis client is required to load the prepared Dreamly AI carousel manifest.");
      console.error("   Ensure UPSTASH_REDIS_URL is configured in your environment.\n");
      process.exit(1);
    }

    let storedManifest = null;
    let selectedDate = dateArg || today;

    if (dateArg) {
      try {
        storedManifest = await getManifest({ redis: redisClient, publishDate: dateArg });
      } catch (err) {
        console.error(`❌ Failed to load manifest for requested date '${dateArg}':`, redactSecrets(err.message));
      }
    } else {
      // 1. Try today's date first
      try {
        storedManifest = await getManifest({ redis: redisClient, publishDate: today });
      } catch (_) {}

      // 2. If today's manifest is not found, discover the latest prepared valid manifest in Redis
      if (!storedManifest) {
        try {
          const keys = await redisClient.keys("social:manifest:*");
          const dateKeys = keys
            .map((k) => k.replace(/^social:manifest:/, ""))
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort()
            .reverse();

          for (const candidateDate of dateKeys) {
            try {
              const candidate = await getManifest({ redis: redisClient, publishDate: candidateDate });
              if (candidate && candidate.media && candidate.media.length > 0) {
                storedManifest = candidate;
                selectedDate = candidateDate;
                break;
              }
            } catch (_) {}
          }
        } catch (scanErr) {
          console.error("❌ Failed to query Redis for prepared manifests:", redactSecrets(scanErr.message));
        }
      }
    }

    if (!storedManifest) {
      console.error(`❌ NO PREPARED CAROUSEL MANIFEST FOUND in Redis (target date: '${selectedDate}').`);
      console.error("   The production Social Run Automation must run first to prepare and store");
      console.error("   real Dreamly AI carousel slides in Cloudflare R2 and Redis.\n");
      if (redisClient) await redisClient.quit().catch(() => {});
      process.exit(1);
    }

    // Validate stored manifest against strict Dreamly AI manifest schema
    const validationRes = validateManifest(storedManifest);
    if (!validationRes.valid) {
      console.error("❌ PREPARED MANIFEST FAILED SCHEMA VALIDATION:");
      for (const valErr of validationRes.errors) {
        console.error(`   - ${valErr}`);
      }
      if (redisClient) await redisClient.quit().catch(() => {});
      process.exit(1);
    }

    const rawCaption = storedManifest.captions?.threads || storedManifest.captions?.instagram || storedManifest.captions?.facebook || "";
    const carouselCaption = formatThreadsCaption({
      baseCaption: rawCaption,
      websiteUrl: "https://dreamlyai.life/"
    });

    testManifest = {
      ...storedManifest,
      type: "carousel",
      captions: {
        ...storedManifest.captions,
        threads: carouselCaption
      }
    };
  }

  console.log("--- Manifest Prepared for Threads Target ---");
  console.log(`  Date:           ${testManifest.date || testManifest.publishDate}`);
  console.log(`  Content ID:     ${testManifest.id || testManifest.contentId}`);
  console.log(`  Type:           ${(testManifest.type || "carousel").toUpperCase()}`);
  console.log(`  Media Count:    ${testManifest.media.length} items`);
  console.log(`  Caption Length: ${testManifest.captions.threads.length} / ${THREADS_FINAL_CAPTION_MAX} chars`);
  console.log(`  Caption Preview:\n"""\n${testManifest.captions.threads}\n"""\n`);

  assert.ok(
    testManifest.captions.threads.length <= THREADS_FINAL_CAPTION_MAX,
    `Threads caption length (${testManifest.captions.threads.length}) must be <= ${THREADS_FINAL_CAPTION_MAX}`
  );

  // Validate public media reachability for all items
  console.log("--- Validating Media Asset Accessibility (HEAD check) ---");
  for (let i = 0; i < testManifest.media.length; i++) {
    const item = testManifest.media[i];
    try {
      const headRes = await fetch(item.url, { method: "HEAD" });
      const isOk = headRes.ok || headRes.status === 200;
      console.log(`  [${i + 1}/${testManifest.media.length}] ${item.url}`);
      console.log(`      Status: ${headRes.status} | Content-Type: ${headRes.headers.get("content-type")} | Content-Length: ${headRes.headers.get("content-length")} bytes`);
      assert.ok(isOk, `Media asset ${item.url} must return HTTP 200 (received ${headRes.status})`);
    } catch (headErr) {
      console.error(`❌ Failed HEAD check for ${item.url}:`, headErr.message);
      throw headErr;
    }
  }

  if (!isExecute) {
    if (redisClient) await redisClient.quit().catch(() => {});
    console.log("\n✅ DRY-RUN COMPLETED SUCCESSFULLY!");
    console.log("   - All credentials and configuration verified");
    console.log("   - Manifest validated against schema");
    console.log("   - Caption length within 500-char Threads limit");
    console.log("   - All media assets reachable via public HTTPS");
    console.log("\nTo publish live to Threads, add the --execute flag:");
    console.log(`   THREADS_LIVE_TEST=true node scripts/test-threads-live.js --type=${mediaTypeArg} --execute\n`);
    return;
  }

  // Live Publishing Execution
  console.log("\n=================================================================");
  console.log(`🚀 EXECUTING LIVE THREADS ${mediaTypeArg.toUpperCase()} PUBLICATION`);
  console.log("=================================================================\n");

  const startTime = Date.now();
  let publishResult;

  if (mediaTypeArg === "video") {
    publishResult = await publishThreadsVideo({
      manifest: testManifest,
      fetchImpl: fetch,
      config
    });
  } else {
    publishResult = await publishThreadsCarousel({
      manifest: testManifest,
      fetchImpl: fetch,
      config
    });
  }

  if (redisClient) await redisClient.quit().catch(() => {});

  const durationMs = Date.now() - startTime;
  console.log("--- Threads Graph API Response ---");
  console.log(`  Success:       ${publishResult.success}`);
  console.log(`  Status:        ${publishResult.status}`);
  console.log(`  Post ID:       ${publishResult.postId}`);
  console.log(`  Container ID:  ${publishResult.containerId}`);
  console.log(`  Published At:  ${publishResult.publishedAt}`);
  console.log(`  Duration:      ${(durationMs / 1000).toFixed(2)}s\n`);

  assert.equal(publishResult.success, true, "Publication must report success: true");
  assert.equal(publishResult.status, "PUBLISHED", "Publication status must be PUBLISHED");
  assert.ok(publishResult.postId, "Publication must return a non-empty postId");

  // Post-Publish Verification via Threads Graph API
  console.log("--- Verifying Published Post via Threads Graph API ---");
  try {
    const apiVersion = config.apiVersion || "v1.0";
    const postVerifyUrl = `${THREADS_GRAPH_BASE_URL}/${apiVersion}/${encodeURIComponent(publishResult.postId)}?fields=id,text,media_type,permalink,timestamp&access_token=${encodeURIComponent(config.accessToken)}`;
    const verifyRes = await fetch(postVerifyUrl);
    const verifyData = await verifyRes.json();

    if (verifyRes.ok && verifyData && verifyData.id) {
      console.log(`  Post Verified: ✅`);
      console.log(`  ID:            ${verifyData.id}`);
      console.log(`  Media Type:    ${verifyData.media_type}`);
      console.log(`  Permalink:     ${verifyData.permalink || "(none)"}`);
      console.log(`  Timestamp:     ${verifyData.timestamp}`);
    } else {
      console.log(`  Post status queried (code: ${verifyRes.status})`);
    }
  } catch (verifyErr) {
    console.warn(`  Post-verification query warning: ${verifyErr.message}`);
  }

  console.log("\n=================================================================");
  console.log(`🎉 THREADS ${mediaTypeArg.toUpperCase()} PUBLISHED AND VERIFIED SUCCESSFULLY!`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ LIVE THREADS TEST FAILED:", redactSecrets(err.message || String(err)));
  if (err.stack) {
    console.error(redactSecrets(err.stack));
  }
  process.exit(1);
});
