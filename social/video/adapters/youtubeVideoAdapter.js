/**
 * YouTube Video Adapter for Dreamly AI
 *
 * Implements YouTube Data API v3 video upload flow with OAuth2 auto-refresh,
 * Shorts-compatible metadata, and token persistence in Redis.
 */

const { BaseVideoAdapter } = require("./baseVideoAdapter");
const { getVideoTokenState, saveVideoTokenState } = require("../videoState");

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_API_URL = "https://www.googleapis.com/youtube/v3/channels";
const YOUTUBE_UPLOAD_API_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

class YouTubeVideoAdapter extends BaseVideoAdapter {
  constructor(targetId = "youtube_dreamly") {
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
    if (!config?.clientId) {
      errors.push(`Missing clientId for YouTube (${this.targetId})`);
    }
    if (!config?.clientSecret) {
      errors.push(`Missing clientSecret for YouTube (${this.targetId})`);
    }
    if (!config?.refreshToken) {
      errors.push(`Missing refreshToken for YouTube (${this.targetId})`);
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
    const tokenState = redis ? await getVideoTokenState(redis, "youtube", this.targetId) : {};
    const now = Date.now();

    const isExpiringSoon = tokenState.expiresAt
      ? tokenState.expiresAt - now < YOUTUBE_TOKEN_REFRESH_THRESHOLD_MS
      : false;

    if (!force && tokenState.accessToken && !isExpiringSoon) {
      return { success: true, accessToken: tokenState.accessToken };
    }

    const clientId = config.clientId;
    const clientSecret = config.clientSecret;
    const refreshToken = tokenState.refreshToken || config.refreshToken;

    if (!refreshToken || !clientId || !clientSecret) {
      if (tokenState.accessToken && !force) {
        return { success: true, accessToken: tokenState.accessToken };
      }
      return {
        success: false,
        error: { message: `Missing YouTube credentials for token refresh (${this.targetId})`, status: 401 }
      };
    }

    try {
      const res = await this.fetchWithTimeout(
        fetchFn,
        GOOGLE_OAUTH_TOKEN_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
          }).toString()
        },
        config.httpTimeoutMs || 30000
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.access_token) {
        return {
          success: false,
          error: this.sanitizeError(data.error_description || data.error || "YouTube token refresh rejected", res.status)
        };
      }

      const expiresInSec = Number(data.expires_in) || 3600;
      const newExpiresAt = now + expiresInSec * 1000;

      if (redis) {
        await saveVideoTokenState(redis, "youtube", this.targetId, {
          accessToken: data.access_token,
          refreshToken,
          expiresAt: newExpiresAt
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
   * Health check verifying API connectivity and channel identification.
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
        `${YOUTUBE_CHANNELS_API_URL}?part=snippet&mine=true`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenRes.accessToken}`,
            Accept: "application/json"
          }
        },
        config.httpTimeoutMs || 30000
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        return {
          healthy: false,
          error: this.sanitizeError(data.error || data, res.status),
          isAuthError: res.status === 401
        };
      }

      const channelItem = data.items?.[0];
      return {
        healthy: true,
        details: {
          channelId: channelItem?.id || config.channelId || "(authenticated)",
          channelTitle: channelItem?.snippet?.title || "(channel connected)",
          privacyStatus: config.privacyStatus || "public",
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
   * Publishes video to YouTube via resumable upload session.
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

    // 2. Obtain valid access token
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

    // 3. Validate video media item
    const mediaItem = manifest.media?.[0];
    if (!mediaItem || !mediaItem.url) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: { message: `Missing video media item URL for YouTube upload (${this.targetId})` }
      };
    }

    // 4. Format YouTube Shorts snippet & status metadata
    const ytCopy = manifest.captions?.youtube || {};
    const rawTitle = ytCopy.title || manifest.metadata?.exactSourceTitle || "Dreamly AI Dream Meaning";
    const title = rawTitle.slice(0, 100);

    const description = ytCopy.description || manifest.captions?.facebook || "";
    const tags = Array.isArray(ytCopy.tags) && ytCopy.tags.length > 0
      ? ytCopy.tags
      : ["Dreamly AI", "dream meaning", "Shorts", "dream interpretation", "dreams"];

    const metadata = {
      snippet: {
        title,
        description,
        tags,
        categoryId: config.categoryId || "24",
        defaultLanguage: "en",
        defaultAudioLanguage: "en"
      },
      status: {
        privacyStatus: config.privacyStatus || "public",
        selfDeclaredMadeForKids: false
      }
    };

    // 5. Initiate Resumable Upload Session
    let uploadUrl;
    try {
      const sessionRes = await this.fetchWithTimeout(
        fetchFn,
        `${YOUTUBE_UPLOAD_API_URL}?uploadType=resumable&part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenRes.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            Accept: "application/json"
          },
          body: JSON.stringify(metadata)
        },
        config.httpTimeoutMs || 30000
      );

      // Handle 401 token expiry retry (once)
      if (sessionRes.status === 401) {
        const refreshAttempt = await this.ensureValidAccessToken({ config, redis, fetchFn, force: true });
        if (refreshAttempt.success) {
          tokenRes = refreshAttempt;
          const retrySessionRes = await this.fetchWithTimeout(
            fetchFn,
            `${YOUTUBE_UPLOAD_API_URL}?uploadType=resumable&part=snippet,status`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tokenRes.accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "video/mp4",
                Accept: "application/json"
              },
              body: JSON.stringify(metadata)
            },
            config.httpTimeoutMs || 30000
          );

          if (!retrySessionRes.ok) {
            const errData = await retrySessionRes.json().catch(() => ({}));
            return {
              success: false,
              status: "FAILED",
              targetId: this.targetId,
              postId: null,
              error: this.sanitizeError(errData.error || errData, retrySessionRes.status)
            };
          }

          uploadUrl = retrySessionRes.headers.get("location") || retrySessionRes.headers.get("Location");
        } else {
          return {
            success: false,
            status: "FAILED",
            targetId: this.targetId,
            postId: null,
            error: refreshAttempt.error
          };
        }
      } else if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: this.sanitizeError(errData.error || errData, sessionRes.status)
        };
      } else {
        uploadUrl = sessionRes.headers.get("location") || sessionRes.headers.get("Location");
      }

      if (!uploadUrl) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: { message: `YouTube upload session initialization returned no Location header (${this.targetId})` }
        };
      }
    } catch (sessionErr) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: this.sanitizeError(sessionErr, null)
      };
    }

    // 6. Acquire Video Binary Payload
    let videoBuffer;
    try {
      const videoRes = await fetchFn(mediaItem.url);
      if (!videoRes.ok) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: { message: `Failed to fetch source video from ${mediaItem.url}: HTTP ${videoRes.status}` }
        };
      }
      videoBuffer = await videoRes.arrayBuffer();
    } catch (fetchMediaErr) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: { message: `Failed to read video asset: ${fetchMediaErr.message}` }
      };
    }

    // 7. Upload Video Binary Payload via PUT
    try {
      const uploadRes = await fetchFn(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(videoBuffer.byteLength),
          Accept: "application/json"
        },
        body: videoBuffer
      });

      const uploadData = await uploadRes.json().catch(() => ({}));

      if (!uploadRes.ok && uploadRes.status !== 201) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: this.sanitizeError(uploadData.error || uploadData, uploadRes.status)
        };
      }

      const videoId = uploadData.id;
      if (!videoId) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: { message: `YouTube upload completed but response contained no video ID (${this.targetId})` }
        };
      }

      return {
        success: true,
        status: "PUBLISHED",
        targetId: this.targetId,
        postId: String(videoId),
        publishedAt: uploadData.snippet?.publishedAt || new Date().toISOString(),
        error: null
      };
    } catch (uploadTransportErr) {
      // Ambiguous write guard: transport failed after session was initialized and bytes were sent
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        targetId: this.targetId,
        postId: null,
        error: this.sanitizeError(uploadTransportErr, null),
        reconciliationData: {
          reason: "AMBIGUOUS_YOUTUBE_UPLOAD_TRANSPORT_FAILURE",
          uploadUrl,
          title,
          targetId: this.targetId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

module.exports = {
  YouTubeVideoAdapter,
  GOOGLE_OAUTH_TOKEN_URL,
  YOUTUBE_CHANNELS_API_URL,
  YOUTUBE_UPLOAD_API_URL
};
