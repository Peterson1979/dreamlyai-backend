/**
 * Facebook Video Adapter for Dreamly AI
 *
 * Implements Meta Graph API Facebook Page Video publishing workflow:
 * Uses POST /{page-id}/videos with file_url and description.
 * Never uses photo carousel or image endpoints.
 */

const { BaseVideoAdapter } = require("./baseVideoAdapter");

class FacebookVideoAdapter extends BaseVideoAdapter {
  constructor(targetId = "facebook_lifemode") {
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
    if (!config?.pageId) {
      errors.push(`Missing Page ID for Facebook Video (${this.targetId})`);
    }
    if (!config?.pageAccessToken) {
      errors.push(`Missing Page Access Token for Facebook Video (${this.targetId})`);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Health check verifying Facebook Page identity.
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
    const pageId = config.pageId;
    const token = config.pageAccessToken;
    const url = `${baseUrl}/${encodeURIComponent(pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`;

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
          name: data.name || "(Page connected)",
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
   * Resolves active Page Access Token if system user token is configured.
   */
  async resolveActivePageToken({ baseUrl, pageId, configuredToken, config, fetchFn = fetch }) {
    if (!configuredToken || !pageId) return configuredToken;
    const url = `${baseUrl}/${encodeURIComponent(pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(configuredToken)}`;
    try {
      const res = await this.fetchWithTimeout(fetchFn, url, { method: "GET" }, config?.httpTimeoutMs || 15000);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && typeof data.access_token === "string" && data.access_token.trim().length > 0) {
        return data.access_token.trim();
      }
    } catch (_) {
      // Fall back to configuredToken on timeout or error
    }
    return configuredToken;
  }

  /**
   * Publishes video to Facebook Page via /{pageId}/videos.
   * @param {object} params
   * @param {object} params.manifest
   * @param {object} params.config
   * @param {Function} [params.fetchFn=fetch]
   * @returns {Promise<object>}
   */
  async publish({ manifest, config, fetchFn = fetch }) {
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
        error: { message: `Missing media item URL for Facebook Video (${this.targetId})` }
      };
    }

    const baseUrl = this.getBaseUrl(config);
    const pageId = config.pageId;
    const configuredToken = config.pageAccessToken;
    const caption = manifest.captions?.facebook || "";
    const timeoutMs = config.httpTimeoutMs || 30000;

    const token = await this.resolveActivePageToken({
      baseUrl,
      pageId,
      configuredToken,
      config,
      fetchFn
    });

    const url = `${baseUrl}/${encodeURIComponent(pageId)}/videos`;

    try {
      const res = await this.fetchWithTimeout(
        fetchFn,
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            file_url: mediaItem.url,
            description: caption,
            access_token: token
          }).toString()
        },
        timeoutMs
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error || (!data.id && !data.post_id)) {
        return {
          success: false,
          status: "FAILED",
          targetId: this.targetId,
          postId: null,
          error: this.sanitizeError(data.error || new Error("Failed to publish video to Facebook Page"), res.status)
        };
      }

      const confirmedPostId = String(data.post_id || data.id);
      return {
        success: true,
        status: "PUBLISHED",
        targetId: this.targetId,
        postId: confirmedPostId,
        publishedAt: new Date().toISOString(),
        error: null
      };
    } catch (transportErr) {
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        targetId: this.targetId,
        postId: null,
        error: this.sanitizeError(transportErr, null),
        reconciliationData: {
          reason: "AMBIGUOUS_FACEBOOK_VIDEO_TRANSPORT_FAILURE",
          pageId,
          targetId: this.targetId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

module.exports = {
  FacebookVideoAdapter
};
