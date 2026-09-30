/**
 * Threads Graph API Publishing Adapter for DreamlyAI Social Pipeline
 *
 * Implements Threads User Token auth, account verification, image carousel container creation
 * with bounded FINISHED readiness polling, parent CAROUSEL container creation, video publishing,
 * and final threads_publish with fail-closed ambiguity classification (DEFINITIVE_FAILURE vs AMBIGUOUS_FINAL_PUBLISH).
 */

const {
  loadThreadsConfig,
  validateThreadsConfig,
  redactSecrets,
  DEFAULT_THREADS_API_VERSION,
  THREADS_GRAPH_BASE_URL
} = require("./threadsConfig");
const { validateManifest } = require("./manifest");
const { formatThreadsCaption, THREADS_FINAL_CAPTION_MAX } = require("./captions");

const ERROR_CLASSIFICATION = Object.freeze({
  DEFINITIVE_FAILURE: "DEFINITIVE_FAILURE",
  AMBIGUOUS_FINAL_PUBLISH: "AMBIGUOUS_FINAL_PUBLISH"
});

/**
 * Custom error class for Threads provider failures.
 */
class ThreadsProviderError extends Error {
  constructor(
    message,
    {
      classification = ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      status,
      graphError,
      containerId,
      cause
    } = {}
  ) {
    super(message);
    this.name = "ThreadsProviderError";
    this.classification = classification;
    this.status = status;
    this.graphError = graphError;
    this.containerId = containerId;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Executes a raw Threads Graph API request with error parsing and timeout support.
 * @param {Function} fetchImpl
 * @param {string} url
 * @param {object} options
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<object>}
 */
async function executeGraphRequest(fetchImpl, url, options = {}, timeoutMs = 30000) {
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    response = await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
  } catch (err) {
    throw new ThreadsProviderError(`Threads Graph API network error: ${redactSecrets(err.message)}`, {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      cause: err
    });
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new ThreadsProviderError(
      `Threads Graph API returned invalid JSON (HTTP ${response.status})`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        status: response.status,
        cause: parseErr
      }
    );
  }

  if (!response.ok || (data && data.error)) {
    const graphError = data?.error
      ? {
          message: data.error.message || "Unknown Threads Graph API error",
          type: data.error.type,
          code: data.error.code,
          error_subcode: data.error.error_subcode
        }
      : undefined;

    throw new ThreadsProviderError(
      `Threads Graph API request failed (HTTP ${response.status}): ${
        graphError?.message || "Non-2xx response"
      }`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        status: response.status,
        graphError
      }
    );
  }

  return data;
}

/**
 * Verifies that the Threads credentials are valid and can reach user identity.
 * @param {object} params
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} params.config
 * @returns {Promise<{ verified: boolean, userId: string, username: string }>}
 */
async function verifyThreadsIdentity({ fetchImpl = globalThis.fetch, config } = {}) {
  const resolvedConfig = config || loadThreadsConfig();
  const validation = validateThreadsConfig(resolvedConfig);
  if (!validation.valid) {
    throw new ThreadsProviderError(
      `Invalid Threads configuration: ${validation.errors.join("; ")}`,
      { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
    );
  }

  const baseUrl = resolvedConfig.baseUrl || `${THREADS_GRAPH_BASE_URL}/${resolvedConfig.apiVersion || DEFAULT_THREADS_API_VERSION}`;
  const url = `${baseUrl}/${encodeURIComponent(resolvedConfig.userId)}?fields=id,username&access_token=${encodeURIComponent(resolvedConfig.accessToken)}`;

  const data = await executeGraphRequest(fetchImpl, url, { method: "GET" }, resolvedConfig.httpTimeoutMs || 30000);

  if (!data || !data.id) {
    throw new ThreadsProviderError("Failed to verify Threads identity: response missing id", {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
    });
  }

  return {
    verified: true,
    userId: String(data.id),
    username: data.username || "(connected)"
  };
}

/**
 * Bounded polling for Threads container status until FINISHED.
 * @param {object} params
 * @param {string} params.baseUrl
 * @param {string} params.token
 * @param {string} params.containerId
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {Function} [params.sleepImpl]
 * @param {number} [params.maxAttempts=15]
 * @param {number} [params.pollIntervalMs=2000]
 * @param {number} [params.timeoutMs=30000]
 * @returns {Promise<{ ready: boolean, data?: object }>}
 */
async function waitForContainerReady({
  baseUrl,
  token,
  containerId,
  fetchImpl = globalThis.fetch,
  sleepImpl,
  maxAttempts = 15,
  pollIntervalMs = 2000,
  timeoutMs = 30000
} = {}) {
  const sleep = typeof sleepImpl === "function" ? sleepImpl : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const statusUrl = `${baseUrl}/${encodeURIComponent(containerId)}?fields=id,status,error_message&access_token=${encodeURIComponent(token)}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await executeGraphRequest(fetchImpl, statusUrl, { method: "GET" }, timeoutMs);
    const status = (data?.status || data?.status_code || "").toUpperCase();

    if (status === "FINISHED") {
      return { ready: true, data };
    }

    if (status === "ERROR") {
      throw new ThreadsProviderError(
        `Threads container ${containerId} processing failed with ERROR: ${data?.error_message || "Unknown error"}`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
          containerId,
          graphError: data
        }
      );
    }

    if (status === "EXPIRED") {
      throw new ThreadsProviderError(
        `Threads container ${containerId} expired before publishing`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
          containerId,
          graphError: data
        }
      );
    }

    if (attempt < maxAttempts) {
      if (pollIntervalMs > 0) {
        await sleep(pollIntervalMs);
      }
    } else {
      throw new ThreadsProviderError(
        `Threads container ${containerId} readiness polling timed out after ${maxAttempts} attempts (status: ${status || "IN_PROGRESS"})`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
          containerId,
          graphError: data
        }
      );
    }
  }

  throw new ThreadsProviderError(`Threads container ${containerId} polling exceeded max attempts`, {
    classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
    containerId
  });
}

/**
 * Publishes a multi-image carousel to Threads.
 * @param {object} params
 * @param {object} params.manifest Valid publication manifest
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} [params.config]
 * @param {Function} [params.sleepImpl]
 * @param {number} [params.maxPollAttempts]
 * @param {number} [params.pollIntervalMs]
 * @returns {Promise<{ success: boolean, status: string, platform: string, postId: string, containerId: string, publishedAt: string }>}
 */
async function publishThreadsCarousel({
  manifest,
  fetchImpl = globalThis.fetch,
  config,
  sleepImpl,
  maxPollAttempts,
  pollIntervalMs
} = {}) {
  const resolvedConfig = config || loadThreadsConfig();
  const validation = validateThreadsConfig(resolvedConfig);
  if (!validation.valid) {
    throw new ThreadsProviderError(
      `Invalid Threads configuration: ${validation.errors.join("; ")}`,
      { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
    );
  }

  if (!manifest || typeof manifest !== "object") {
    throw new ThreadsProviderError("Manifest must be an object", {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
    });
  }

  if (!Array.isArray(manifest.media) || manifest.media.length < 2 || manifest.media.length > 10) {
    throw new ThreadsProviderError(
      `Manifest media must be an array with 2 to 10 items, received ${manifest?.media?.length}`,
      { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
    );
  }

  for (let i = 0; i < manifest.media.length; i++) {
    const item = manifest.media[i];
    if (!item || typeof item.url !== "string" || !item.url.startsWith("https://")) {
      throw new ThreadsProviderError(
        `Media item at index ${i} must have a valid HTTPS url`,
        { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
      );
    }
  }

  const baseUrl = resolvedConfig.baseUrl || `${THREADS_GRAPH_BASE_URL}/${resolvedConfig.apiVersion || DEFAULT_THREADS_API_VERSION}`;
  const userId = resolvedConfig.userId;
  const token = resolvedConfig.accessToken;
  const timeoutMs = resolvedConfig.httpTimeoutMs || 30000;
  const maxAttempts = maxPollAttempts || resolvedConfig.pollMaxAttempts || 15;
  const intervalMs = pollIntervalMs !== undefined ? pollIntervalMs : (resolvedConfig.pollIntervalMs || 2000);

  const rawCaption = manifest.captions?.threads || manifest.captions?.instagram || manifest.captions?.facebook || "";
  const caption = formatThreadsCaption({ baseCaption: rawCaption });

  // 1. Create item containers for each slide
  const childContainerIds = [];
  try {
    for (let idx = 0; idx < manifest.media.length; idx++) {
      const item = manifest.media[idx];
      const childUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads`;
      const childData = await executeGraphRequest(
        fetchImpl,
        childUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            media_type: "IMAGE",
            image_url: item.url,
            is_carousel_item: "true",
            access_token: token
          }).toString()
        },
        timeoutMs
      );

      if (!childData || !childData.id) {
        throw new ThreadsProviderError(
          `Failed to create Threads child container at index ${idx}: response missing id`,
          { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
        );
      }

      childContainerIds.push(String(childData.id));
    }
  } catch (err) {
    if (err instanceof ThreadsProviderError) throw err;
    throw new ThreadsProviderError(
      `Failed to create Threads child item containers: ${err.message}`,
      { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE, cause: err }
    );
  }

  // 2. Concurrently wait for all child containers to be FINISHED
  await Promise.all(
    childContainerIds.map((cid) =>
      waitForContainerReady({
        baseUrl,
        token,
        containerId: cid,
        fetchImpl,
        sleepImpl,
        maxAttempts,
        pollIntervalMs: intervalMs,
        timeoutMs
      })
    )
  );

  // 3. Create parent CAROUSEL container
  let parentContainerId;
  try {
    const parentUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads`;
    const parentData = await executeGraphRequest(
      fetchImpl,
      parentUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          media_type: "CAROUSEL",
          children: childContainerIds.join(","),
          text: caption,
          access_token: token
        }).toString()
      },
      timeoutMs
    );

    if (!parentData || !parentData.id) {
      throw new ThreadsProviderError(
        "Failed to create parent Threads carousel container: response missing id",
        { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
      );
    }

    parentContainerId = String(parentData.id);
  } catch (err) {
    if (err instanceof ThreadsProviderError) throw err;
    throw new ThreadsProviderError(
      `Failed to create parent Threads carousel container: ${err.message}`,
      { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE, cause: err }
    );
  }

  // 4. Wait for parent container to be FINISHED
  await waitForContainerReady({
    baseUrl,
    token,
    containerId: parentContainerId,
    fetchImpl,
    sleepImpl,
    maxAttempts,
    pollIntervalMs: intervalMs,
    timeoutMs
  });

  // 5. Final publish execution with fail-closed ambiguous error classification
  const publishUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads_publish`;
  let pubData;
  try {
    pubData = await executeGraphRequest(
      fetchImpl,
      publishUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: parentContainerId,
          access_token: token
        }).toString()
      },
      timeoutMs
    );
  } catch (err) {
    // Network/timeout failure during final publish is AMBIGUOUS
    throw new ThreadsProviderError(
      `Ambiguous write failure during Threads carousel publish: ${err.message}`,
      {
        classification: ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH,
        containerId: parentContainerId,
        cause: err
      }
    );
  }

  if (!pubData || !pubData.id) {
    throw new ThreadsProviderError(
      "Threads final publish response missing published post id",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        containerId: parentContainerId
      }
    );
  }

  return {
    success: true,
    status: "PUBLISHED",
    platform: "threads",
    postId: String(pubData.id),
    containerId: parentContainerId,
    publishedAt: new Date().toISOString()
  };
}

/**
 * Publishes a single video to Threads.
 * @param {object} params
 * @param {object} params.manifest Valid video manifest
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} [params.config]
 * @param {Function} [params.sleepImpl]
 * @param {number} [params.maxPollAttempts]
 * @param {number} [params.pollIntervalMs]
 * @returns {Promise<{ success: boolean, status: string, platform: string, postId: string, containerId: string, publishedAt: string }>}
 */
async function publishThreadsVideo({
  manifest,
  fetchImpl = globalThis.fetch,
  config,
  sleepImpl,
  maxPollAttempts,
  pollIntervalMs
} = {}) {
  const resolvedConfig = config || loadThreadsConfig();
  const validation = validateThreadsConfig(resolvedConfig);
  if (!validation.valid) {
    throw new ThreadsProviderError(
      `Invalid Threads configuration: ${validation.errors.join("; ")}`,
      { classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE }
    );
  }

  const videoUrl = manifest?.media?.[0]?.url;
  if (!videoUrl || typeof videoUrl !== "string") {
    throw new ThreadsProviderError("Manifest missing valid video URL in media[0].url", {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
    });
  }

  const baseUrl = resolvedConfig.baseUrl || `${THREADS_GRAPH_BASE_URL}/${resolvedConfig.apiVersion || DEFAULT_THREADS_API_VERSION}`;
  const userId = resolvedConfig.userId;
  const token = resolvedConfig.accessToken;
  const timeoutMs = resolvedConfig.httpTimeoutMs || 30000;
  const maxAttempts = maxPollAttempts || resolvedConfig.pollMaxAttempts || 25;
  const intervalMs = pollIntervalMs !== undefined ? pollIntervalMs : (resolvedConfig.pollIntervalMs || 3000);

  const rawCaption = manifest.captions?.threads || manifest.captions?.instagram || manifest.captions?.facebook || manifest.captions?.youtube?.description || "";
  const caption = formatThreadsCaption({ baseCaption: rawCaption });

  // 1. Create Video Container
  let containerId;
  try {
    const createUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads`;
    const createData = await executeGraphRequest(
      fetchImpl,
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

    if (!createData || !createData.id) {
      throw new ThreadsProviderError("Failed to create Threads video container: response missing id", {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      });
    }

    containerId = String(createData.id);
  } catch (err) {
    if (err instanceof ThreadsProviderError) throw err;
    throw new ThreadsProviderError(`Failed to create Threads video container: ${err.message}`, {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      cause: err
    });
  }

  // 2. Poll Video Container for FINISHED
  await waitForContainerReady({
    baseUrl,
    token,
    containerId,
    fetchImpl,
    sleepImpl,
    maxAttempts,
    pollIntervalMs: intervalMs,
    timeoutMs
  });

  // 3. Publish Video Container
  const publishUrl = `${baseUrl}/${encodeURIComponent(userId)}/threads_publish`;
  let pubData;
  try {
    pubData = await executeGraphRequest(
      fetchImpl,
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
  } catch (err) {
    throw new ThreadsProviderError(
      `Ambiguous write failure during Threads video publish: ${err.message}`,
      {
        classification: ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH,
        containerId,
        cause: err
      }
    );
  }

  if (!pubData || !pubData.id) {
    throw new ThreadsProviderError("Threads video final publish response missing published post id", {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      containerId
    });
  }

  return {
    success: true,
    status: "PUBLISHED",
    platform: "threads",
    postId: String(pubData.id),
    containerId,
    publishedAt: new Date().toISOString()
  };
}

/**
 * ThreadsAdapter class adhering to Dreamly AI and AI Zodiac adapter patterns.
 */
class ThreadsAdapter {
  constructor(options = {}) {
    const name = typeof options === "string" ? options : (options.name || "threads");
    this.name = name;
    this.targetId = name;
    this.options = typeof options === "object" ? options : {};
  }

  validateConfig(config) {
    return validateThreadsConfig(config || loadThreadsConfig());
  }

  async checkHealth({ config, fetchFn = globalThis.fetch } = {}) {
    try {
      const res = await verifyThreadsIdentity({ fetchImpl: fetchFn, config });
      return {
        healthy: true,
        details: {
          id: res.userId,
          username: res.username,
          targetId: this.targetId
        }
      };
    } catch (err) {
      return {
        healthy: false,
        error: {
          message: redactSecrets(err.message),
          status: err.status || 400
        }
      };
    }
  }

  async publish({ manifest, config, fetchFn = globalThis.fetch, sleepFn, pollOptions = {} }) {
    try {
      const isVideo = manifest.type === "video" || manifest.type === "VIDEO" || Array.isArray(manifest.media) && manifest.media[0]?.type?.includes("video");
      if (isVideo) {
        return await publishThreadsVideo({
          manifest,
          fetchImpl: fetchFn,
          config,
          sleepImpl: sleepFn,
          ...pollOptions
        });
      }

      return await publishThreadsCarousel({
        manifest,
        fetchImpl: fetchFn,
        config,
        sleepImpl: sleepFn,
        ...pollOptions
      });
    } catch (err) {
      if (err instanceof ThreadsProviderError) {
        if (err.classification === ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH) {
          return {
            success: false,
            status: "RECONCILIATION_REQUIRED",
            containerId: err.containerId,
            error: { message: redactSecrets(err.message), classification: err.classification }
          };
        }
      }
      return {
        success: false,
        status: "FAILED",
        containerId: err.containerId,
        error: { message: redactSecrets(err.message) }
      };
    }
  }
}

module.exports = {
  ERROR_CLASSIFICATION,
  ThreadsProviderError,
  verifyThreadsIdentity,
  waitForContainerReady,
  publishThreadsCarousel,
  publishThreadsVideo,
  ThreadsAdapter
};
