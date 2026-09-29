/**
 * Pinterest Video Adapter for Dreamly AI
 *
 * Implements Pinterest API v5 video Pin workflow:
 * 1. Register media upload (/media)
 * 2. Upload video payload to S3 upload_url
 * 3. Poll media status until processing succeeds
 * 4. Create Video Pin (/pins with media_source: video_id)
 *
 * Supports both Dreamly AI (@dreamlyai) and LifeMode (@lifemodehq) targets.
 */

const { BaseVideoAdapter } = require("./baseVideoAdapter");
const { getVideoTokenState, saveVideoTokenState } = require("../videoState");

const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5";
const PINTEREST_TOKEN_REFRESH_THRESHOLD_MS = 48 * 3600 * 1000; // 48 hours

class PinterestVideoAdapter extends BaseVideoAdapter {
  constructor(targetId = "pinterest_dreamly") {
    super(targetId);
    this.targetId = targetId;
  }

  /**
   * Validates target configuration.
   * @param {object} config
   * @returns {{ valid: boolean, errors: Array<string> }}
   */
  validateConfig(config) {
    const errors = [];
    if (!config?.accessToken && !config?.refreshToken) {
      errors.push(`Missing accessToken or refreshToken for Pinterest (${this.targetId})`);
    }
    if (!config?.boardId) {
      errors.push(`Missing boardId for Pinterest (${this.targetId})`);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Ensures a valid OAuth2 access token is available, refreshing if expired.
   * @param {object} params
   * @param {object} params.config
   * @param {object} [params.redis]
   * @param {Function} [params.fetchFn=fetch]
   * @param {boolean} [params.force=false]
   * @returns {Promise<{ success: boolean, accessToken?: string, error?: object }>}
   */
  async ensureValidAccessToken({ config, redis, fetchFn = fetch, force = false }) {
    const tokenState = redis ? await getVideoTokenState(redis, "pinterest", this.targetId) : {};
    const now = Date.now();

    const isExpiringSoon = tokenState.expiresAt
      ? tokenState.expiresAt - now < PINTEREST_TOKEN_REFRESH_THRESHOLD_MS
      : false;

    if (!force && tokenState.accessToken && !isExpiringSoon) {
      return { success: true, accessToken: tokenState.accessToken };
    }

    const refreshToken = tokenState.refreshToken || config.refreshToken;
    const appId = config.appId;
    const appSecret = config.appSecret;

    if (!refreshToken || !appId || !appSecret) {
      if (tokenState.accessToken && !force) {
        return { success: true, accessToken: tokenState.accessToken };
      }
      if (config.accessToken && !force) {
        return { success: true, accessToken: config.accessToken };
      }
      return {
        success: false,
        error: { message: `Missing Pinterest refresh token, app ID, or secret for token refresh (${this.targetId})`, status: 401 }
      };
    }

    try {
      const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
      const res = await this.fetchWithTimeout(
        fetchFn,
        `${PINTEREST_API_BASE_URL}/oauth/token`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken
          }).toString()
        },
        config.httpTimeoutMs || 30000
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.access_token) {
        return {
          success: false,
          error: this.sanitizeError(data.error || data || "Pinterest token refresh rejected", res.status)
        };
      }

      const expiresInSec = Number(data.expires_in) || (30 * 86400);
      const refreshExpiresInSec = Number(data.refresh_token_expires_in) || (60 * 86400);
      const newExpiresAt = now + expiresInSec * 1000;
      const newRefreshExpiresAt = now + refreshExpiresInSec * 1000;
      const newRefreshToken = data.refresh_token || refreshToken;

      if (redis) {
        await saveVideoTokenState(redis, "pinterest", this.targetId, {
          accessToken: data.access_token,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          refreshTokenExpiresAt: newRefreshExpiresAt
        });
      }

      return {
        success: true,
        accessToken: data.access_token
      };
    } catch (refreshErr) {
      return {
        success: false,
        error: this.sanitizeError(refreshErr, null)
      };
    }
  }

  /**
   * Health check verifying API connectivity and account info.
   */
  async checkHealth({ config, redis, fetchFn = fetch }) {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        healthy: false,
        error: { message: validation.errors.join("; "), status: 400 }
      };
    }

    const tokenRes = await this.ensureValidAccessToken({ config, redis, fetchFn });
    if (!tokenRes.success) {
      return {
        healthy: false,
        error: tokenRes.error,
        isAuthError: true
      };
    }

    try {
      const res = await this.fetchWithTimeout(
        fetchFn,
        `${PINTEREST_API_BASE_URL}/user_account`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenRes.accessToken}`
          }
        },
        config.httpTimeoutMs || 30000
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.code || data.message?.toLowerCase().includes("error")) {
        return {
          healthy: false,
          error: this.sanitizeError(data, res.status),
          isAuthError: res.status === 401
        };
      }

      return {
        healthy: true,
        details: {
          username: data.username || "(connected)",
          accountType: data.account_type || "business",
          boardId: config.boardId,
          targetId: this.targetId
        }
      };
    } catch (err) {
      return {
        healthy: false,
        error: this.sanitizeError(err, null)
      };
    }
  }

  /**
   * Publishes a video Pin via Pinterest API v5 /media and /pins endpoints.
   * @param {object} params
   * @param {object} params.manifest
   * @param {object} params.config
   * @param {object} [params.redis]
   * @param {Function} [params.fetchFn=fetch]
   * @returns {Promise<object>}
   */
  async publish({ manifest, config, redis, fetchFn = fetch }) {
    // 1. Validate configuration
    const configCheck = this.validateConfig(config);
    if (!configCheck.valid) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: { message: configCheck.errors.join("; "), status: 400 }
      };
    }

    // 2. Access Tier Safety Gate
    const isStandardTier = config.accessTier === "standard";
    if (!isStandardTier && !config.allowTrialPosting) {
      return {
        success: false,
        status: "SKIPPED",
        targetId: this.targetId,
        postId: null,
        error: {
          message: `Pinterest is in trial access tier (${this.targetId}) - public posting suppressed until Standard access is verified`,
          tier: config.accessTier
        }
      };
    }

    // 3. Obtain valid access token
    let tokenRes = await this.ensureValidAccessToken({ config, redis, fetchFn });
    if (!tokenRes.success) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: tokenRes.error
      };
    }

    // 4. Validate Media Item URL
    const mediaItem = manifest.media?.[0];
    if (!mediaItem || !mediaItem.url) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: { message: `Missing media item URL for Pinterest Pin (${this.targetId})` }
      };
    }

    const pinCopy = (this.targetId === "pinterest_lifemode" && manifest.captions?.pinterest_secondary)
      ? manifest.captions.pinterest_secondary
      : (manifest.captions?.pinterest || {});

    const boardId = config.boardId;
    let accessToken = tokenRes.accessToken;

    try {
      // Step A: Register media upload with Pinterest API v5
      const mediaRegisterRes = await this.fetchWithTimeout(
        fetchFn,
        `${PINTEREST_API_BASE_URL}/media`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ media_type: "video" })
        },
        config.httpTimeoutMs || 30000
      );

      // Handle 401 refresh
      if (mediaRegisterRes.status === 401) {
        const refreshAttempt = await this.ensureValidAccessToken({ config, redis, fetchFn, force: true });
        if (!refreshAttempt.success) {
          return {
            success: false,
            status: "FAILED",
            targetId: this.targetId,
            postId: null,
            error: refreshAttempt.error
          };
        }
        accessToken = refreshAttempt.accessToken;
      }

      const mediaData = await mediaRegisterRes.json().catch(() => ({}));
      if (!mediaRegisterRes.ok || !mediaData.media_id) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: this.sanitizeError(mediaData.error || mediaData, mediaRegisterRes.status)
        };
      }

      const mediaId = String(mediaData.media_id);
      const uploadUrl = mediaData.upload_url;
      const uploadParams = mediaData.upload_parameters || {};

      // Step B: Fetch video binary payload
      const videoRes = await fetchFn(mediaItem.url);
      if (!videoRes.ok) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: { message: `Failed to fetch video source from ${mediaItem.url}: HTTP ${videoRes.status}` }
        };
      }
      const videoBuffer = await videoRes.arrayBuffer();

      // Step C: Upload video to upload_url using FormData
      if (uploadUrl) {
        const formData = new FormData();
        for (const [k, v] of Object.entries(uploadParams)) {
          formData.append(k, String(v));
        }
        const blob = new Blob([videoBuffer], { type: "video/mp4" });
        formData.append("file", blob, "video.mp4");

        const s3UploadRes = await fetchFn(uploadUrl, {
          method: "POST",
          body: formData
        });

        if (!s3UploadRes.ok && s3UploadRes.status !== 204 && s3UploadRes.status !== 200) {
          return {
            success: false,
            status: "FAILED",
            targetId: this.targetId,
            postId: null,
            error: { message: `Pinterest S3 media upload failed with HTTP ${s3UploadRes.status} (${this.targetId})` }
          };
        }
      }

      // Step D: Poll media status until succeeded (or up to 6 attempts)
      for (let attempt = 1; attempt <= 6; attempt++) {
        const statusRes = await this.fetchWithTimeout(
          fetchFn,
          `${PINTEREST_API_BASE_URL}/media/${mediaId}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` }
          },
          config.httpTimeoutMs || 30000
        );

        if (statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          if (statusData.status === "succeeded") {
            break;
          } else if (statusData.status === "failed") {
            return {
              success: false,
              status: "FAILED",
              targetId: this.targetId,
              postId: null,
              error: { message: `Pinterest video processing failed on provider side (${this.targetId})` }
            };
          }
        }
      }

      // Step E: Create Video Pin via /pins
      const videoPinPayload = {
        board_id: boardId,
        title: (pinCopy.title || manifest.metadata?.exactSourceTitle || "").slice(0, 100),
        description: (pinCopy.description || "").slice(0, 500),
        link: pinCopy.link || manifest.destinationUrl || "",
        media_source: {
          source_type: "video_id",
          media_id: mediaId,
          cover_image_key_frame_time: 0
        }
      };

      const pinRes = await this.fetchWithTimeout(
        fetchFn,
        `${PINTEREST_API_BASE_URL}/pins`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(videoPinPayload)
        },
        config.httpTimeoutMs || 30000
      );

      const pinData = await pinRes.json().catch(() => ({}));
      if (!pinRes.ok || !pinData.id) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: this.sanitizeError(pinData, pinRes.status)
        };
      }

      return {
        success: true,
        status: "PUBLISHED",
        targetId: this.targetId,
        postId: String(pinData.id),
        publishedAt: new Date().toISOString(),
        error: null
      };

    } catch (videoPinErr) {
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        targetId: this.targetId,
        postId: null,
        error: this.sanitizeError(videoPinErr, null),
        reconciliationData: {
          reason: "AMBIGUOUS_PINTEREST_VIDEO_PIN_TRANSPORT_FAILURE",
          boardId,
          targetId: this.targetId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

module.exports = {
  PinterestVideoAdapter,
  PINTEREST_API_BASE_URL
};
