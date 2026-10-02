/**
 * Dreamly AI Video Social Target Registry and Configuration Model
 *
 * Defines the 6 authoritative publication targets:
 * 1. pinterest_dreamly (@dreamlyai, Board: Dreamly AI)
 * 2. youtube_dreamly (Dreamly AI YouTube channel, Cloud Project: DreamlyAi-New)
 * 3. instagram_lifemode (@lifemodehq Instagram Reels)
 * 4. facebook_lifemode (LifeMode Facebook Page Video)
 * 5. youtube_lifemode (LifeMode YouTube channel)
 * 6. pinterest_lifemode (@lifemodehq, Board: Dream Meanings & Night Symbols)
 */

const VIDEO_TARGETS = Object.freeze({
  PINTEREST_DREAMLY: "pinterest_dreamly",
  YOUTUBE_DREAMLY: "youtube_dreamly",
  INSTAGRAM_DREAMLY: "instagram_dreamly",
  FACEBOOK_DREAMLY: "facebook_dreamly",
  THREADS_DREAMLY: "threads_dreamly",
  INSTAGRAM_LIFEMODE: "instagram_lifemode",
  FACEBOOK_LIFEMODE: "facebook_lifemode",
  YOUTUBE_LIFEMODE: "youtube_lifemode",
  PINTEREST_LIFEMODE: "pinterest_lifemode"
});

const ALL_TARGET_IDS = Object.freeze([
  VIDEO_TARGETS.PINTEREST_DREAMLY,
  VIDEO_TARGETS.YOUTUBE_DREAMLY,
  VIDEO_TARGETS.INSTAGRAM_DREAMLY,
  VIDEO_TARGETS.FACEBOOK_DREAMLY,
  VIDEO_TARGETS.THREADS_DREAMLY,
  VIDEO_TARGETS.INSTAGRAM_LIFEMODE,
  VIDEO_TARGETS.FACEBOOK_LIFEMODE,
  VIDEO_TARGETS.YOUTUBE_LIFEMODE,
  VIDEO_TARGETS.PINTEREST_LIFEMODE
]);

const TARGET_ALIASES = Object.freeze({
  pinterest: VIDEO_TARGETS.PINTEREST_DREAMLY,
  pinterest_primary: VIDEO_TARGETS.PINTEREST_DREAMLY,
  youtube: VIDEO_TARGETS.YOUTUBE_DREAMLY,
  youtube_primary: VIDEO_TARGETS.YOUTUBE_DREAMLY,
  instagram: VIDEO_TARGETS.INSTAGRAM_DREAMLY,
  instagram_primary: VIDEO_TARGETS.INSTAGRAM_DREAMLY,
  facebook: VIDEO_TARGETS.FACEBOOK_DREAMLY,
  facebook_primary: VIDEO_TARGETS.FACEBOOK_DREAMLY,
  threads: VIDEO_TARGETS.THREADS_DREAMLY,
  threads_primary: VIDEO_TARGETS.THREADS_DREAMLY,
  threads_dreamly: VIDEO_TARGETS.THREADS_DREAMLY,
  instagram_secondary: VIDEO_TARGETS.INSTAGRAM_LIFEMODE,
  facebook_secondary: VIDEO_TARGETS.FACEBOOK_LIFEMODE,
  youtube_secondary: VIDEO_TARGETS.YOUTUBE_LIFEMODE,
  pinterest_secondary: VIDEO_TARGETS.PINTEREST_LIFEMODE
});

/**
 * Resolves any target string (canonical ID or legacy alias) to its canonical target ID.
 * @param {string} target
 * @returns {string | null}
 */
function canonicalizeTargetId(target) {
  if (typeof target !== "string") return null;
  const norm = target.trim().toLowerCase();
  if (ALL_TARGET_IDS.includes(norm)) {
    return norm;
  }
  return TARGET_ALIASES[norm] || null;
}

/**
 * Checks boolean flag from environment (defaults to true unless explicitly 'false' or '0').
 * @param {string | undefined} val
 * @param {boolean} [defaultVal=true]
 * @returns {boolean}
 */
function parseBoolEnv(val, defaultVal = true) {
  if (val === undefined || val === null || val === "") return defaultVal;
  const s = String(val).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/**
 * Loads and validates configuration for all 8 targets from environment variables.
 * Keeps credentials isolated between Dreamly and LifeMode.
 *
 * @param {object} [env=process.env]
 * @returns {object} Map of target ID to its resolved configuration
 */
function loadVideoTargetsConfig(env = process.env) {
  if (!env || typeof env !== "object") {
    throw new Error("Invalid environment passed to loadVideoTargetsConfig");
  }

  // 1. Pinterest Dreamly (@dreamlyai)
  const pinterestDreamlyEnabled = parseBoolEnv(
    env.DREAMLY_PINTEREST_ENABLED ??
    env.PINTEREST_DREAMLY_ENABLED ??
    env.PINTEREST_PRIMARY_ENABLED ??
    env.PINTEREST_ENABLED,
    true
  );
  const pinterestDreamlyConfig = {
    targetId: VIDEO_TARGETS.PINTEREST_DREAMLY,
    platform: "pinterest",
    brand: "Dreamly AI",
    account: "@dreamlyai",
    boardName: "Dreamly AI",
    enabled: pinterestDreamlyEnabled,
    boardId: (
      env.DREAMLY_PINTEREST_BOARD_ID ||
      env.PINTEREST_DREAMLY_BOARD_ID ||
      env.PINTEREST_PRIMARY_BOARD_ID ||
      env.PINTEREST_BOARD_ID ||
      ""
    ).trim(),
    accessToken: (
      env.DREAMLY_PINTEREST_ACCESS_TOKEN ||
      env.PINTEREST_DREAMLY_ACCESS_TOKEN ||
      env.PINTEREST_PRIMARY_ACCESS_TOKEN ||
      env.PINTEREST_ACCESS_TOKEN ||
      ""
    ).trim(),
    refreshToken: (
      env.DREAMLY_PINTEREST_REFRESH_TOKEN ||
      env.PINTEREST_DREAMLY_REFRESH_TOKEN ||
      env.PINTEREST_PRIMARY_REFRESH_TOKEN ||
      env.PINTEREST_REFRESH_TOKEN ||
      ""
    ).trim(),
    appId: (
      env.DREAMLY_PINTEREST_APP_ID ||
      env.PINTEREST_DREAMLY_APP_ID ||
      env.PINTEREST_PRIMARY_APP_ID ||
      env.PINTEREST_APP_ID ||
      ""
    ).trim(),
    appSecret: (
      env.DREAMLY_PINTEREST_APP_SECRET ||
      env.PINTEREST_DREAMLY_APP_SECRET ||
      env.PINTEREST_PRIMARY_APP_SECRET ||
      env.PINTEREST_APP_SECRET ||
      ""
    ).trim(),
    accessTier: (
      env.DREAMLY_PINTEREST_ACCESS_TIER ||
      env.PINTEREST_DREAMLY_ACCESS_TIER ||
      env.PINTEREST_PRIMARY_ACCESS_TIER ||
      env.PINTEREST_ACCESS_TIER ||
      "standard"
    ).trim(),
    allowTrialPosting: parseBoolEnv(
      env.DREAMLY_PINTEREST_ALLOW_TRIAL_POSTING ??
      env.PINTEREST_DREAMLY_ALLOW_TRIAL_POSTING ??
      env.PINTEREST_PRIMARY_ALLOW_TRIAL_POSTING ??
      env.PINTEREST_ALLOW_TRIAL_POSTING,
      false
    ),
    httpTimeoutMs: Number(env.PINTEREST_HTTP_TIMEOUT_MS) || 30000,
    pollMaxAttempts: Number(env.PINTEREST_POLL_MAX_ATTEMPTS) || 25,
    pollIntervalMs: Number(env.PINTEREST_POLL_INTERVAL_MS) || 3000
  };

  // 2. YouTube Dreamly (Channel: Dreamly AI, GCP: DreamlyAi-New)
  const youtubeDreamlyEnabled = parseBoolEnv(
    env.DREAMLY_YOUTUBE_ENABLED ?? env.YOUTUBE_ENABLED,
    true
  );
  const youtubeDreamlyConfig = {
    targetId: VIDEO_TARGETS.YOUTUBE_DREAMLY,
    platform: "youtube",
    brand: "Dreamly AI",
    account: "Dreamly AI",
    gcpProject: "DreamlyAi-New",
    enabled: youtubeDreamlyEnabled,
    clientId: (env.DREAMLY_YOUTUBE_CLIENT_ID || env.YOUTUBE_CLIENT_ID || "").trim(),
    clientSecret: (env.DREAMLY_YOUTUBE_CLIENT_SECRET || env.YOUTUBE_CLIENT_SECRET || "").trim(),
    refreshToken: (env.DREAMLY_YOUTUBE_REFRESH_TOKEN || env.YOUTUBE_REFRESH_TOKEN || "").trim(),
    channelId: (env.DREAMLY_YOUTUBE_CHANNEL_ID || env.YOUTUBE_CHANNEL_ID || "").trim(),
    privacyStatus: (env.DREAMLY_YOUTUBE_PRIVACY_STATUS || env.YOUTUBE_PRIVACY_STATUS || "public").trim(),
    categoryId: (env.DREAMLY_YOUTUBE_CATEGORY_ID || env.YOUTUBE_CATEGORY_ID || "24").trim(),
    httpTimeoutMs: Number(env.YOUTUBE_HTTP_TIMEOUT_MS) || 60000
  };

  // 3. Instagram Dreamly (@dreamlyai Reels)
  const instagramDreamlyEnabled = parseBoolEnv(
    env.DREAMLY_INSTAGRAM_ENABLED ??
    env.INSTAGRAM_DREAMLY_ENABLED ??
    env.INSTAGRAM_PRIMARY_ENABLED ??
    env.INSTAGRAM_ENABLED,
    true
  );
  const instagramDreamlyConfig = {
    targetId: VIDEO_TARGETS.INSTAGRAM_DREAMLY,
    platform: "instagram",
    brand: "Dreamly AI",
    account: "@dreamlyai",
    enabled: instagramDreamlyEnabled,
    businessAccountId: (
      env.DREAMLY_INSTAGRAM_BUSINESS_ACCOUNT_ID ||
      env.INSTAGRAM_DREAMLY_BUSINESS_ACCOUNT_ID ||
      env.INSTAGRAM_PRIMARY_BUSINESS_ACCOUNT_ID ||
      env.INSTAGRAM_BUSINESS_ACCOUNT_ID ||
      ""
    ).trim(),
    pageId: (
      env.DREAMLY_FACEBOOK_PAGE_ID ||
      env.FACEBOOK_DREAMLY_PAGE_ID ||
      env.FACEBOOK_PRIMARY_PAGE_ID ||
      env.FACEBOOK_PAGE_ID ||
      ""
    ).trim(),
    pageAccessToken: (
      env.DREAMLY_FACEBOOK_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_DREAMLY_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_PRIMARY_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_PAGE_ACCESS_TOKEN ||
      ""
    ).trim(),
    graphApiVersion: env.META_GRAPH_API_VERSION || "v25.0",
    httpTimeoutMs: Number(env.META_HTTP_TIMEOUT_MS) || 30000,
    pollMaxAttempts: Number(env.INSTAGRAM_POLL_MAX_ATTEMPTS) || 12,
    pollIntervalMs: Number(env.INSTAGRAM_POLL_INTERVAL_MS) || 5000
  };

  // 4. Facebook Dreamly (Dreamly AI Facebook Page Video)
  const facebookDreamlyEnabled = parseBoolEnv(
    env.DREAMLY_FACEBOOK_ENABLED ??
    env.FACEBOOK_DREAMLY_ENABLED ??
    env.FACEBOOK_PRIMARY_ENABLED ??
    env.FACEBOOK_ENABLED,
    true
  );
  const facebookDreamlyConfig = {
    targetId: VIDEO_TARGETS.FACEBOOK_DREAMLY,
    platform: "facebook",
    brand: "Dreamly AI",
    account: "Dreamly AI",
    enabled: facebookDreamlyEnabled,
    pageId: (
      env.DREAMLY_FACEBOOK_PAGE_ID ||
      env.FACEBOOK_DREAMLY_PAGE_ID ||
      env.FACEBOOK_PRIMARY_PAGE_ID ||
      env.FACEBOOK_PAGE_ID ||
      ""
    ).trim(),
    pageAccessToken: (
      env.DREAMLY_FACEBOOK_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_DREAMLY_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_PRIMARY_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_PAGE_ACCESS_TOKEN ||
      ""
    ).trim(),
    graphApiVersion: env.META_GRAPH_API_VERSION || "v25.0",
    httpTimeoutMs: Number(env.META_HTTP_TIMEOUT_MS) || 30000
  };

  // 5. Instagram LifeMode (@lifemodehq Reels)
  const instagramLifemodeEnabled = parseBoolEnv(
    env.LIFEMODE_INSTAGRAM_ENABLED ?? env.INSTAGRAM_SECONDARY_ENABLED,
    true
  );
  const instagramLifemodeConfig = {
    targetId: VIDEO_TARGETS.INSTAGRAM_LIFEMODE,
    platform: "instagram",
    brand: "LifeMode",
    account: "@lifemodehq",
    enabled: instagramLifemodeEnabled,
    businessAccountId: (
      env.LIFEMODE_INSTAGRAM_BUSINESS_ACCOUNT_ID ||
      env.INSTAGRAM_SECONDARY_BUSINESS_ACCOUNT_ID ||
      ""
    ).trim(),
    pageId: (
      env.LIFEMODE_FACEBOOK_PAGE_ID ||
      env.FACEBOOK_SECONDARY_PAGE_ID ||
      ""
    ).trim(),
    pageAccessToken: (
      env.LIFEMODE_FACEBOOK_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN ||
      ""
    ).trim(),
    graphApiVersion: env.META_GRAPH_API_VERSION || "v25.0",
    httpTimeoutMs: Number(env.META_HTTP_TIMEOUT_MS) || 30000,
    pollMaxAttempts: Number(env.INSTAGRAM_POLL_MAX_ATTEMPTS) || 12,
    pollIntervalMs: Number(env.INSTAGRAM_POLL_INTERVAL_MS) || 5000
  };

  // 6. Facebook LifeMode (LifeMode Facebook Page Video)
  const facebookLifemodeEnabled = parseBoolEnv(
    env.LIFEMODE_FACEBOOK_ENABLED ?? env.FACEBOOK_SECONDARY_ENABLED,
    true
  );
  const facebookLifemodeConfig = {
    targetId: VIDEO_TARGETS.FACEBOOK_LIFEMODE,
    platform: "facebook",
    brand: "LifeMode",
    account: "LifeMode",
    enabled: facebookLifemodeEnabled,
    pageId: (
      env.LIFEMODE_FACEBOOK_PAGE_ID ||
      env.FACEBOOK_SECONDARY_PAGE_ID ||
      ""
    ).trim(),
    pageAccessToken: (
      env.LIFEMODE_FACEBOOK_PAGE_ACCESS_TOKEN ||
      env.FACEBOOK_SECONDARY_PAGE_ACCESS_TOKEN ||
      ""
    ).trim(),
    graphApiVersion: env.META_GRAPH_API_VERSION || "v25.0",
    httpTimeoutMs: Number(env.META_HTTP_TIMEOUT_MS) || 30000
  };

  // 7. YouTube LifeMode (LifeMode YouTube Channel)
  const youtubeLifemodeEnabled = parseBoolEnv(
    env.LIFEMODE_YOUTUBE_ENABLED ?? env.YOUTUBE_SECONDARY_ENABLED,
    true
  );
  const youtubeLifemodeConfig = {
    targetId: VIDEO_TARGETS.YOUTUBE_LIFEMODE,
    platform: "youtube",
    brand: "LifeMode",
    account: "LifeMode",
    enabled: youtubeLifemodeEnabled,
    clientId: (env.LIFEMODE_YOUTUBE_CLIENT_ID || env.YOUTUBE_SECONDARY_CLIENT_ID || "").trim(),
    clientSecret: (env.LIFEMODE_YOUTUBE_CLIENT_SECRET || env.YOUTUBE_SECONDARY_CLIENT_SECRET || "").trim(),
    refreshToken: (env.LIFEMODE_YOUTUBE_REFRESH_TOKEN || env.YOUTUBE_SECONDARY_REFRESH_TOKEN || "").trim(),
    channelId: (env.LIFEMODE_YOUTUBE_CHANNEL_ID || env.YOUTUBE_SECONDARY_CHANNEL_ID || "").trim(),
    privacyStatus: (env.LIFEMODE_YOUTUBE_PRIVACY_STATUS || env.YOUTUBE_SECONDARY_PRIVACY_STATUS || "public").trim(),
    categoryId: (env.LIFEMODE_YOUTUBE_CATEGORY_ID || env.YOUTUBE_SECONDARY_CATEGORY_ID || "24").trim(),
    httpTimeoutMs: Number(env.YOUTUBE_HTTP_TIMEOUT_MS) || 60000
  };

  // 8. Pinterest LifeMode (@lifemodehq, Board: Dream Meanings & Night Symbols)
  const pinterestLifemodeEnabled = parseBoolEnv(
    env.LIFEMODE_PINTEREST_ENABLED ??
    env.PINTEREST_LIFEMODE_ENABLED ??
    env.PINTEREST_SECONDARY_ENABLED,
    true
  );
  const pinterestLifemodeConfig = {
    targetId: VIDEO_TARGETS.PINTEREST_LIFEMODE,
    platform: "pinterest",
    brand: "LifeMode",
    account: "@lifemodehq",
    boardName: "Dream Meanings & Night Symbols",
    enabled: pinterestLifemodeEnabled,
    boardId: (
      env.LIFEMODE_PINTEREST_BOARD_ID ||
      env.PINTEREST_LIFEMODE_BOARD_ID ||
      env.PINTEREST_SECONDARY_BOARD_ID ||
      ""
    ).trim(),
    accessToken: (
      env.LIFEMODE_PINTEREST_ACCESS_TOKEN ||
      env.PINTEREST_LIFEMODE_ACCESS_TOKEN ||
      env.PINTEREST_SECONDARY_ACCESS_TOKEN ||
      ""
    ).trim(),
    refreshToken: (
      env.LIFEMODE_PINTEREST_REFRESH_TOKEN ||
      env.PINTEREST_LIFEMODE_REFRESH_TOKEN ||
      env.PINTEREST_SECONDARY_REFRESH_TOKEN ||
      ""
    ).trim(),
    appId: (
      env.LIFEMODE_PINTEREST_APP_ID ||
      env.PINTEREST_LIFEMODE_APP_ID ||
      env.PINTEREST_SECONDARY_APP_ID ||
      ""
    ).trim(),
    appSecret: (
      env.LIFEMODE_PINTEREST_APP_SECRET ||
      env.PINTEREST_LIFEMODE_APP_SECRET ||
      env.PINTEREST_SECONDARY_APP_SECRET ||
      ""
    ).trim(),
    accessTier: (
      env.LIFEMODE_PINTEREST_ACCESS_TIER ||
      env.PINTEREST_LIFEMODE_ACCESS_TIER ||
      env.PINTEREST_SECONDARY_ACCESS_TIER ||
      "standard"
    ).trim(),
    allowTrialPosting: parseBoolEnv(
      env.LIFEMODE_PINTEREST_ALLOW_TRIAL_POSTING ??
      env.PINTEREST_LIFEMODE_ALLOW_TRIAL_POSTING ??
      env.PINTEREST_SECONDARY_ALLOW_TRIAL_POSTING ??
      env.PINTEREST_ALLOW_TRIAL_POSTING,
      false
    ),
    httpTimeoutMs: Number(env.PINTEREST_HTTP_TIMEOUT_MS) || 30000,
    pollMaxAttempts: Number(env.PINTEREST_POLL_MAX_ATTEMPTS) || 25,
    pollIntervalMs: Number(env.PINTEREST_POLL_INTERVAL_MS) || 3000
  };

  // 9. Threads Dreamly (@dreamlyai Threads Video)
  const threadsDreamlyEnabled = parseBoolEnv(
    env.DREAMLY_THREADS_ENABLED ??
    env.THREADS_DREAMLY_ENABLED ??
    env.THREADS_PRIMARY_ENABLED ??
    env.THREADS_ENABLED,
    true
  );
  const threadsDreamlyConfig = {
    targetId: VIDEO_TARGETS.THREADS_DREAMLY,
    platform: "threads",
    brand: "Dreamly AI",
    account: "@dreamlyaiapp",
    enabled: threadsDreamlyEnabled,
    userId: (
      env.DREAMLY_THREADS_USER_ID ||
      env.THREADS_DREAMLY_USER_ID ||
      env.THREADS_PRIMARY_USER_ID ||
      env.THREADS_USER_ID ||
      ""
    ).trim(),
    accessToken: (
      env.DREAMLY_THREADS_ACCESS_TOKEN ||
      env.THREADS_DREAMLY_ACCESS_TOKEN ||
      env.THREADS_PRIMARY_ACCESS_TOKEN ||
      env.THREADS_ACCESS_TOKEN ||
      ""
    ).trim(),
    apiVersion: env.THREADS_API_VERSION || "v1.0",
    httpTimeoutMs: Number(env.THREADS_HTTP_TIMEOUT_MS) || 30000,
    pollMaxAttempts: Number(env.THREADS_POLL_MAX_ATTEMPTS) || 25,
    pollIntervalMs: Number(env.THREADS_POLL_INTERVAL_MS) || 3000
  };

  return {
    [VIDEO_TARGETS.PINTEREST_DREAMLY]: pinterestDreamlyConfig,
    [VIDEO_TARGETS.YOUTUBE_DREAMLY]: youtubeDreamlyConfig,
    [VIDEO_TARGETS.INSTAGRAM_DREAMLY]: instagramDreamlyConfig,
    [VIDEO_TARGETS.FACEBOOK_DREAMLY]: facebookDreamlyConfig,
    [VIDEO_TARGETS.THREADS_DREAMLY]: threadsDreamlyConfig,
    [VIDEO_TARGETS.INSTAGRAM_LIFEMODE]: instagramLifemodeConfig,
    [VIDEO_TARGETS.FACEBOOK_LIFEMODE]: facebookLifemodeConfig,
    [VIDEO_TARGETS.YOUTUBE_LIFEMODE]: youtubeLifemodeConfig,
    [VIDEO_TARGETS.PINTEREST_LIFEMODE]: pinterestLifemodeConfig
  };
}

module.exports = {
  VIDEO_TARGETS,
  ALL_TARGET_IDS,
  TARGET_ALIASES,
  canonicalizeTargetId,
  loadVideoTargetsConfig
};
