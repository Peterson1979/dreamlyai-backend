/**
 * Threads Video Adapter for Dreamly AI
 *
 * Implements Meta Threads Graph API video publishing workflow:
 * 1. Create Video media container (media_type: "VIDEO")
 * 2. Poll container status until FINISHED
 * 3. Publish container via threads_publish endpoint
 */

const { BaseVideoAdapter } = require("./baseVideoAdapter");
const { formatThreadsCaption } = require("../../captions");
const {
  loadThreadsConfig,
  validateThreadsConfig,
  DEFAULT_THREADS_API_VERSION,
  THREADS_GRAPH_BASE_URL
} = require("../../threadsConfig");

class ThreadsVideoAdapter extends BaseVideoAdapter {
  constructor(targetId = "threads_dreamly") {
    super(targetId);
    this.targetId = targetId;
  }

  getBaseUrl(config) {
    const version = config?.apiVersion || DEFAULT_THREADS_API_VERSION;
    return `${THREADS_GRAPH_BASE_URL}/${version}`;
  }

  /**
   * Validates target configuration.
   * @param {object} config
   * @returns {{ valid: boolean, errors: Array<string> }}
   */
  validateConfig(config) {
    const errors = [];
    if (!config?.userId) {
      errors.push(`Missing Threads User ID for Threads Video (${this.targetId})`);
    }
    if (!config?.accessToken) {
      errors.push(`Missing Threads Access Token for Threads Video (${this.targetId})`);
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Health check verifying Threads User identity.
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
    const userId = config.userId;
    const token = config.accessToken;
    const url = `${baseUrl}/${encodeURIComponent(userId)}?fields=id,username&access_token=${encodeURIComponent(token)}`;

    try {
      const res = await this.fetchWithTimeout(fetchFn, url, { method: "GET" }, config.httpTimeoutMs || 30000);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        const isAuth = res.status === 401 || data.error?.code === 190;
        return {
          healthy: false,
          error: this.sanitizeError(data.error || new Error(`Threads API error ${res.status}`), res.status),
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
   * Waits for Threads container readiness via bounded polling.
   */
  async waitForContainerReady({ baseUrl, token, containerId, timeoutMs = 30000, fetchFn = fetch, sleepFn, pollMaxAttempts = 25, pollIntervalMs = 3000 }) {
    const sleep = typeof sleepFn === "function" ? sleepFn : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const statusUrl = `${baseUrl}/${encodeURIComponent(containerId)}?fields=id,status,error_message&access_token=${encodeURIComponent(token)}`;

    for (let attempt = 1; attempt <= pollMaxAttempts; attempt++) {
      try {
        const res = await this.fetchWithTimeout(fetchFn, statusUrl, { method: "GET" }, timeoutMs);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          const isAuth = res.status === 401 || data.error?.code === 190;
          return {
            ready: false,
            status: isAuth ? "AUTH_FAILED" : "FAILED",
            error: this.sanitizeError(data.error || new Error("Failed to check Threads container status"), res.status)
          };
        }

        const status = (data.status || data.status_code || "").toUpperCase();

        if (status === "FINISHED") {
          return { ready: true, data };
        }

        if (status === "ERROR" || status === "EXPIRED") {
          return {
            ready: false,
            status: "FAILED",
            error: {
              message: `Threads video processing failed with status '${status}': ${data.error_message || "Unknown error"}`,
              statusCode: status
            }
          };
        }

        if (attempt < pollMaxAttempts) {
          if (pollIntervalMs > 0) {
            await sleep(pollIntervalMs);
          }
        } else {
          return {
            ready: false,
            status: "FAILED",
            error: {
              message: `Threads container readiness polling timed out after ${pollMaxAttempts} attempts (status: ${status || "IN_PROGRESS"})`
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
      error: { message: `Threads container ${containerId} polling exceeded max attempts` }
    };
  }

  /**
   * Resolves caption for Threads video publication.
   * @param {object} manifest
   * @returns {string}
   */
  resolveCaption(manifest) {
    const rawCaption =
      manifest?.captions?.threads ||
      manifest?.captions?.instagram ||
      manifest?.captions?.facebook ||
      manifest?.captions?.youtube?.description ||
      manifest?.captions?.pinterest?.description ||
      "";

    return formatThreadsCaption({ baseCaption: rawCaption });
  }

  /**
   * Publishes a video to Threads.
   * @param {object} params
   * @param {object} params.manifest
   * @param {object} params.config
   * @param {Function} [params.fetchFn=fetch]
   * @param {Function} [params.sleepFn]
   * @returns {Promise<object>}
   */
  async publish({ manifest, config, fetchFn = fetch, sleepFn }) {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        status: "CONFIG_ERROR",
        error: { message: validation.errors.join("; ") }
      };
    }

    const videoUrl = manifest?.media?.[0]?.url;
    if (!videoUrl || typeof videoUrl !== "string") {
      return {
        success: false,
        status: "FAILED",
        error: { message: `Missing valid video URL in manifest.media[0].url for target ${this.targetId}` }
      };
    }

    const baseUrl = this.getBaseUrl(config);
    const userId = config.userId;
    const token = config.accessToken;
    const timeoutMs = config.httpTimeoutMs || 30000;
    const pollMaxAttempts = config.pollMaxAttempts || 25;
    const pollIntervalMs = config.pollIntervalMs || 3000;
    const caption = this.resolveCaption(manifest);

    // 1. Create Threads Video Container
    let containerId = null;
    const createUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads`;

    try {
      const createRes = await this.fetchWithTimeout(
        fetchFn,
        createUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            media_type: "VIDEO",
            video_url: videoUrl,
            text: caption,
            access_token: token
          }).toString()
        },
        timeoutMs
      );

      const createData = await createRes.json().catch(() => ({}));

      if (!createRes.ok || createData.error || !createData.id) {
        const isAuth = createRes.status === 401 || createData.error?.code === 190;
        return {
          success: false,
          status: isAuth ? "AUTH_FAILED" : "FAILED",
          error: this.sanitizeError(createData.error || new Error("Failed to create Threads video container"), createRes.status)
        };
      }

      containerId = String(createData.id);
    } catch (createErr) {
      return {
        success: false,
        status: "FAILED",
        error: this.sanitizeError(createErr, null)
      };
    }

    // 2. Poll for container readiness
    const readiness = await this.waitForContainerReady({
      baseUrl,
      token,
      containerId,
      timeoutMs,
      fetchFn,
      sleepFn,
      pollMaxAttempts,
      pollIntervalMs
    });

    if (!readiness.ready) {
      return {
        success: false,
        status: readiness.status || "FAILED",
        containerId,
        error: readiness.error
      };
    }

    // 3. Publish container via threads_publish
    const publishUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads_publish`;
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
        const isAuth = pubRes.status === 401 || pubData.error?.code === 190;
        return {
          success: false,
          status: isAuth ? "AUTH_FAILED" : "FAILED",
          containerId,
          error: this.sanitizeError(pubData.error || new Error("Failed to publish Threads video container"), pubRes.status)
        };
      }

      return {
        success: true,
        status: "PUBLISHED",
        targetId: this.targetId,
        postId: String(pubData.id),
        containerId,
        publishedAt: new Date().toISOString()
      };
    } catch (transportErr) {
      // Ambiguous write transport error
      return {
        success: false,
        status: "RECONCILIATION_REQUIRED",
        targetId: this.targetId,
        containerId,
        error: this.sanitizeError(transportErr, null),
        reconciliationData: {
          reason: "AMBIGUOUS_THREADS_TRANSPORT_FAILURE",
          containerId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

module.exports = {
  ThreadsVideoAdapter
};
