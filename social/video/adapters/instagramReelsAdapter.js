/**
 * Instagram Reels Video Adapter for Dreamly AI
 *
 * Implements Meta Graph API Instagram Reels publishing workflow:
 * 1. Create Reels media container (media_type: "REELS")
 * 2. Poll container status until FINISHED
 * 3. Publish container via media_publish endpoint
 */

const { BaseVideoAdapter } = require("./baseVideoAdapter");

class InstagramReelsAdapter extends BaseVideoAdapter {
  constructor(targetId = "instagram_lifemode") {
    super(targetId);
    this.targetId = targetId;
  }

  getBaseUrl(config) {
    const version = config?.graphApiVersion || "v25.0";
    return `https://graph.facebook.com/${version}`;
  }

  /**
   * Validates target configuration.
   * @param {object} config
   * @returns {{ valid: boolean, errors: Array<string> }}
   */
  validateConfig(config) {
    const errors = [];
    if (!config?.businessAccountId) {
      errors.push(`Missing Instagram Business Account ID for Instagram Reels (${this.targetId})`);
    }
    if (!config?.pageAccessToken) {
      errors.push(`Missing Page Access Token for Instagram Reels (${this.targetId})`);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Health check verifying Instagram Business account identity.
   */
  async checkHealth({ config, fetchFn = fetch }) {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        healthy: false,
        error: { message: validation.errors.join("; "), status: 400 }
      };
    }

    const baseUrl = this.getBaseUrl(config);
    const accountId = config.businessAccountId;
    const token = config.pageAccessToken;
    const url = `${baseUrl}/${encodeURIComponent(accountId)}?fields=id,username&access_token=${encodeURIComponent(token)}`;

    try {
      const res = await this.fetchWithTimeout(fetchFn, url, { method: "GET" }, config.httpTimeoutMs || 30000);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        const isAuth = res.status === 401 || data.error?.code === 190;
        return {
          healthy: false,
          error: this.sanitizeError(data.error || new Error(`Meta API error ${res.status}`), res.status),
          isAuthError: isAuth
        };
      }

      return {
        healthy: true,
        details: {
          id: data.id,
          username: data.username || "(connected)",
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
   * Waits for Instagram container readiness via bounded polling.
   */
  async waitForContainerReady({ baseUrl, token, containerId, timeoutMs = 30000, fetchFn = fetch, sleepFn, pollMaxAttempts = 12, pollIntervalMs = 5000 }) {
    const sleep = typeof sleepFn === "function" ? sleepFn : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const statusUrl = `${baseUrl}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;

    for (let attempt = 1; attempt <= pollMaxAttempts; attempt++) {
      try {
        const res = await this.fetchWithTimeout(fetchFn, statusUrl, { method: "GET" }, timeoutMs);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          const isAuth = res.status === 401 || data.error?.code === 190;
          return {
            ready: false,
            status: isAuth ? "AUTH_FAILED" : "FAILED",
            error: this.sanitizeError(data.error || new Error("Failed to check container status"), res.status)
          };
        }

        const statusCode = data.status_code?.toUpperCase();

        if (statusCode === "FINISHED") {
          return { ready: true };
        }

        if (statusCode === "ERROR" || statusCode === "EXPIRED") {
          return {
            ready: false,
            status: "FAILED",
            error: {
              message: `Instagram video processing failed with status '${statusCode}': ${data.status || "Unknown error"}`,
              statusCode
            }
          };
        }

        // Status is IN_PROGRESS: wait and retry if attempts remain
        if (attempt < pollMaxAttempts) {
          if (pollIntervalMs > 0) {
            await sleep(pollIntervalMs);
          }
        } else {
          return {
            ready: false,
            status: "FAILED",
            error: {
              message: `Instagram container readiness polling timed out after ${pollMaxAttempts} attempts (status: ${statusCode || "IN_PROGRESS"})`
            }
          };
        }
      } catch (err) {
        if (attempt >= pollMaxAttempts) {
          return {
            ready: false,
            status: "FAILED",
            error: this.sanitizeError(err, null)
          };
        }
        if (pollIntervalMs > 0) {
          await sleep(pollIntervalMs);
        }
      }
    }

    return {
      ready: false,
      status: "FAILED",
      error: { message: `Instagram container readiness polling exhausted max attempts (${pollMaxAttempts})` }
    };
  }

  /**
   * Publishes video to Instagram as a Reel.
   * @param {object} params
   * @param {object} params.manifest
   * @param {object} params.config
   * @param {Function} [params.fetchFn=fetch]
   * @param {Function} [params.sleepFn]
   * @returns {Promise<object>}
   */
  async publish({ manifest, config, fetchFn = fetch, sleepFn }) {
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

    const mediaItem = manifest.media?.[0];
    if (!mediaItem || !mediaItem.url) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: { message: `Missing media item URL for Instagram Reels (${this.targetId})` }
      };
    }

    const baseUrl = this.getBaseUrl(config);
    const token = config.pageAccessToken;
    const accountId = config.businessAccountId;
    const caption = manifest.captions?.instagram || "";
    const timeoutMs = config.httpTimeoutMs || 30000;

    // 1. Create Reels Container
    const createUrl = `${baseUrl}/${encodeURIComponent(accountId)}/media`;
    let containerId = null;

    try {
      const createRes = await this.fetchWithTimeout(
        fetchFn,
        createUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            media_type: "REELS",
            video_url: mediaItem.url,
            caption,
            access_token: token
          }).toString()
        },
        timeoutMs
      );

      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || createData.error || !createData.id) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: this.sanitizeError(createData.error || new Error("Failed to create Instagram Reels container"), createRes.status)
        };
      }

      containerId = String(createData.id);
    } catch (createErr) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        error: this.sanitizeError(createErr, null)
      };
    }

    // 2. Poll for container processing readiness
    const readiness = await this.waitForContainerReady({
      baseUrl,
      token,
      containerId,
      timeoutMs,
      fetchFn,
      sleepFn,
      pollMaxAttempts: config.pollMaxAttempts || 12,
      pollIntervalMs: config.pollIntervalMs || 5000
    });

    if (!readiness.ready) {
      return {
        success: false,
        status: "FAILED",
        targetId: this.targetId,
        postId: null,
        containerId,
        error: readiness.error
      };
    }

    // 3. Publish Reels container
    const publishUrl = `${baseUrl}/${encodeURIComponent(accountId)}/media_publish`;

    try {
      const pubRes = await this.fetchWithTimeout(
        fetchFn,
        publishUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            creation_id: containerId,
            access_token: token
          }).toString()
        },
        timeoutMs
      );

      const pubData = await pubRes.json().catch(() => ({}));

      if (!pubRes.ok || pubData.error || !pubData.id) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          containerId,
          error: this.sanitizeError(pubData.error || new Error("Failed to publish Instagram Reels container"), pubRes.status)
        };
      }

      return {
        success: true,
        status: "PUBLISHED",
        targetId: this.targetId,
        postId: String(pubData.id),
        containerId,
        publishedAt: new Date().toISOString(),
        error: null
      };
    } catch (pubTransportErr) {
      // Ambiguous write guard: creation succeeded and publish was sent but connection dropped
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        targetId: this.targetId,
        postId: null,
        containerId,
        error: this.sanitizeError(pubTransportErr, null),
        reconciliationData: {
          reason: "AMBIGUOUS_INSTAGRAM_REELS_PUBLISH_TRANSPORT_FAILURE",
          containerId,
          accountId,
          targetId: this.targetId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

module.exports = {
  InstagramReelsAdapter
};
