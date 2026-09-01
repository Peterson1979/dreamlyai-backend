/**
 * Instagram 5-Image Carousel Publishing Adapter for DreamlyAI Social Pipeline
 *
 * Implements Facebook Login Page token auth, Instagram Business Account identity verification,
 * sequential 5-child image container creation with bounded FINISHED readiness polling,
 * parent CAROUSEL container creation, parent FINISHED polling, and final media_publish with
 * fail-closed ambiguity classification (DEFINITIVE_FAILURE vs AMBIGUOUS_FINAL_PUBLISH).
 */

const {
  loadInstagramConfig,
  buildInstagramIdentityRequest,
  buildContainerStatusRequest
} = require("./instagramConfig");
const { validateManifest } = require("./manifest");
const { buildPlatformCaptions } = require("./captions");

const ERROR_CLASSIFICATION = Object.freeze({
  DEFINITIVE_FAILURE: "DEFINITIVE_FAILURE",
  AMBIGUOUS_FINAL_PUBLISH: "AMBIGUOUS_FINAL_PUBLISH"
});

/**
 * Custom error class for Instagram provider failures.
 */
class InstagramProviderError extends Error {
  constructor(
    message,
    {
      classification = ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      status,
      graphError,
      parentContainerId,
      cause
    } = {}
  ) {
    super(message);
    this.name = "InstagramProviderError";
    this.classification = classification;
    this.status = status;
    this.graphError = graphError;
    this.parentContainerId = parentContainerId;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Sanitized fetch helper executing Graph API requests.
 * @param {Function} fetchImpl
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object>}
 */
async function executeGraphRequest(fetchImpl, url, options = {}) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (err) {
    throw new InstagramProviderError(`Graph API network error: ${err.message}`, {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      cause: err
    });
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new InstagramProviderError(
      `Graph API returned invalid JSON (HTTP ${response.status})`,
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
          message: data.error.message || "Unknown Graph API error",
          type: data.error.type,
          code: data.error.code,
          error_subcode: data.error.error_subcode
        }
      : undefined;

    throw new InstagramProviderError(
      `Graph API request failed (HTTP ${response.status}): ${
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
 * Verifies that the Page Access Token belongs to the configured Page and linked Instagram Business Account.
 * @param {object} params
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} params.config
 * @returns {Promise<{ verified: boolean, pageId: string, pageName: string, instagramBusinessAccountId: string }>}
 */
async function verifyInstagramBusinessIdentity({
  fetchImpl = globalThis.fetch,
  config
} = {}) {
  if (!config || typeof config !== "object") {
    throw new InstagramProviderError(
      "Missing config in verifyInstagramBusinessIdentity",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  const request = buildInstagramIdentityRequest(config);
  const data = await executeGraphRequest(fetchImpl, request.url, {
    method: request.method,
    headers: request.headers
  });

  if (
    !data ||
    typeof data.id !== "string" ||
    data.id.trim().length === 0 ||
    typeof data.name !== "string" ||
    data.name.trim().length === 0
  ) {
    throw new InstagramProviderError(
      "Instagram identity verification failed: missing 'id' or 'name' in response",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  if (data.id !== config.pageId) {
    throw new InstagramProviderError(
      `Page ID mismatch: configured '${config.pageId}', received '${data.id}'`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  if (
    !data.instagram_business_account ||
    typeof data.instagram_business_account.id !== "string" ||
    data.instagram_business_account.id.trim().length === 0
  ) {
    throw new InstagramProviderError(
      `No linked instagram_business_account found on Facebook Page '${config.pageId}'`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  if (data.instagram_business_account.id !== config.instagramBusinessAccountId) {
    throw new InstagramProviderError(
      `Instagram Business Account ID mismatch: configured '${config.instagramBusinessAccountId}', page linked to '${data.instagram_business_account.id}'`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  return {
    verified: true,
    pageId: config.pageId,
    pageName: data.name,
    instagramBusinessAccountId: config.instagramBusinessAccountId
  };
}

/**
 * Polls container status until it reaches FINISHED or fails closed.
 * @param {object} params
 * @param {string} params.containerId
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} params.config
 * @param {Function} [params.sleepImpl]
 * @param {number} [params.maxAttempts=5]
 * @param {number} [params.pollIntervalMs=1000]
 * @returns {Promise<{ ready: boolean, status_code: "FINISHED", containerId: string }>}
 */
async function waitForInstagramContainerReady({
  containerId,
  fetchImpl = globalThis.fetch,
  config,
  sleepImpl,
  maxAttempts = 5,
  pollIntervalMs = 1000
} = {}) {
  const sleep =
    sleepImpl ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const request = buildContainerStatusRequest({ config, containerId });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await executeGraphRequest(fetchImpl, request.url, {
      method: request.method,
      headers: request.headers
    });

    const statusCode = data?.status_code;

    if (statusCode === "FINISHED") {
      return {
        ready: true,
        status_code: "FINISHED",
        containerId
      };
    }

    if (statusCode === "IN_PROGRESS") {
      if (attempt < maxAttempts) {
        await sleep(pollIntervalMs);
        continue;
      }
      throw new InstagramProviderError(
        `Container '${containerId}' readiness check timed out while IN_PROGRESS after ${maxAttempts} attempts`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
          graphError: {
            code: "CONTAINER_READINESS_TIMEOUT"
          }
        }
      );
    }

    if (statusCode === "ERROR") {
      throw new InstagramProviderError(
        `Container '${containerId}' failed with status ERROR: ${
          data.status || "Unknown error"
        }`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
          graphError: {
            code: "CONTAINER_ERROR",
            message: data.status
          }
        }
      );
    }

    if (statusCode === "EXPIRED") {
      throw new InstagramProviderError(
        `Container '${containerId}' expired before publishing (status EXPIRED)`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
          graphError: {
            code: "CONTAINER_EXPIRED"
          }
        }
      );
    }

    if (statusCode === "PUBLISHED") {
      throw new InstagramProviderError(
        `Invalid pre-publication container status for container '${containerId}': PUBLISHED`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
        }
      );
    }

    throw new InstagramProviderError(
      `Unrecognized container status_code for container '${containerId}': '${statusCode}'`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  throw new InstagramProviderError(
    `Container '${containerId}' readiness check exhausted attempts`,
    {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      graphError: {
        code: "CONTAINER_READINESS_TIMEOUT"
      }
    }
  );
}

/**
 * Publishes a 5-image carousel to Instagram.
 * @param {object} params
 * @param {object} params.manifest Valid publication manifest
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} [params.config] Loaded Instagram config
 * @param {Function} [params.sleepImpl] Injected sleep function for tests
 * @param {number} [params.maxPollAttempts=5]
 * @param {number} [params.pollIntervalMs=1000]
 * @returns {Promise<{ success: boolean, status: "PUBLISHED", platform: "instagram", instagramBusinessAccountId: string, mediaId: string, parentContainerId: string, childContainerIds: string[] }>}
 */
async function publishInstagramCarousel({
  manifest,
  fetchImpl = globalThis.fetch,
  config = loadInstagramConfig(),
  sleepImpl,
  maxPollAttempts = 5,
  pollIntervalMs = 1000
} = {}) {
  // 1. Pre-write validation
  const manVal = validateManifest(manifest);
  if (!manVal.valid) {
    throw new InstagramProviderError(
      `Pre-publish manifest validation failed: ${manVal.errors.join("; ")}`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  let captions;
  try {
    captions = buildPlatformCaptions(manifest);
  } catch (captionErr) {
    throw new InstagramProviderError(
      `Pre-publish caption construction failed: ${captionErr.message}`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        cause: captionErr
      }
    );
  }

  const caption = captions.instagram;

  if (!Array.isArray(manifest.media) || manifest.media.length !== 5) {
    throw new InstagramProviderError(
      `Manifest must contain exactly 5 media items, found ${manifest.media?.length}`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  for (const item of manifest.media) {
    if (!item.url || !item.url.startsWith("https://")) {
      throw new InstagramProviderError(
        `All media URLs must use HTTPS, found '${item.url}'`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
        }
      );
    }
    if (item.contentType !== "image/jpeg") {
      throw new InstagramProviderError(
        `Instagram carousel items must use contentType 'image/jpeg', found '${item.contentType}'`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
        }
      );
    }
  }

  // 2. Identity Verification
  await verifyInstagramBusinessIdentity({ fetchImpl, config });

  // 3. Step 1 & 2 — Create 5 child image containers and wait for each to reach FINISHED
  const childContainerIds = [];
  const mediaEndpoint = `${config.graphBaseUrl}/${config.instagramBusinessAccountId}/media`;

  for (let i = 0; i < manifest.media.length; i++) {
    const item = manifest.media[i];
    const childBody = new URLSearchParams({
      image_url: item.url,
      is_carousel_item: "true"
    });

    const childData = await executeGraphRequest(fetchImpl, mediaEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.pageAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: childBody.toString()
    });

    if (
      !childData ||
      typeof childData.id !== "string" ||
      childData.id.trim().length === 0
    ) {
      throw new InstagramProviderError(
        `Child container creation for slide ${item.index} did not return a valid container ID`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
        }
      );
    }

    const childId = childData.id.trim();

    // Bounded readiness polling for child
    await waitForInstagramContainerReady({
      containerId: childId,
      fetchImpl,
      config,
      sleepImpl,
      maxAttempts: maxPollAttempts,
      pollIntervalMs
    });

    childContainerIds.push(childId);
  }

  // 4. Step 3 — Create parent CAROUSEL container
  const parentBody = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childContainerIds.join(","),
    caption: caption
  });

  const parentData = await executeGraphRequest(fetchImpl, mediaEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: parentBody.toString()
  });

  if (
    !parentData ||
    typeof parentData.id !== "string" ||
    parentData.id.trim().length === 0
  ) {
    throw new InstagramProviderError(
      "Parent CAROUSEL container creation did not return a valid container ID",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  const parentContainerId = parentData.id.trim();

  // 5. Step 4 — Wait for parent container FINISHED
  await waitForInstagramContainerReady({
    containerId: parentContainerId,
    fetchImpl,
    config,
    sleepImpl,
    maxAttempts: maxPollAttempts,
    pollIntervalMs
  });

  // 6. Step 5 — Final media publish
  const publishEndpoint = `${config.graphBaseUrl}/${config.instagramBusinessAccountId}/media_publish`;
  const publishBody = new URLSearchParams({
    creation_id: parentContainerId
  });

  let publishResponse;
  try {
    publishResponse = await fetchImpl(publishEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.pageAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: publishBody.toString()
    });
  } catch (transportErr) {
    // Critical: Transport failure during final media_publish is ambiguous
    throw new InstagramProviderError(
      `Transport failure during final Instagram media_publish: ${transportErr.message}`,
      {
        classification: ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH,
        parentContainerId,
        cause: transportErr
      }
    );
  }

  let publishData;
  try {
    publishData = await publishResponse.json();
  } catch (parseErr) {
    throw new InstagramProviderError(
      `Instagram media_publish returned unparseable JSON (HTTP ${publishResponse.status})`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        status: publishResponse.status,
        parentContainerId,
        cause: parseErr
      }
    );
  }

  if (!publishResponse.ok || (publishData && publishData.error)) {
    const graphError = publishData?.error
      ? {
          message: publishData.error.message || "Unknown Graph API error",
          type: publishData.error.type,
          code: publishData.error.code,
          error_subcode: publishData.error.error_subcode
        }
      : undefined;

    throw new InstagramProviderError(
      `Instagram media_publish failed (HTTP ${publishResponse.status}): ${
        graphError?.message || "Non-2xx response"
      }`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        status: publishResponse.status,
        parentContainerId,
        graphError
      }
    );
  }

  if (
    !publishData ||
    typeof publishData.id !== "string" ||
    publishData.id.trim().length === 0
  ) {
    throw new InstagramProviderError(
      "Instagram media_publish did not return a valid media ID",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        parentContainerId
      }
    );
  }

  return {
    success: true,
    status: "PUBLISHED",
    platform: "instagram",
    instagramBusinessAccountId: config.instagramBusinessAccountId,
    mediaId: publishData.id,
    parentContainerId,
    childContainerIds
  };
}

module.exports = {
  ERROR_CLASSIFICATION,
  InstagramProviderError,
  verifyInstagramBusinessIdentity,
  waitForInstagramContainerReady,
  publishInstagramCarousel
};
