/**
 * Facebook Multi-Image Publishing Adapter for DreamlyAI Social Pipeline
 *
 * Implements Page identity verification, 5-slide unpublished photo uploads,
 * multi-image feed creation, and fail-closed error classification (DEFINITIVE_FAILURE vs AMBIGUOUS_FINAL_PUBLISH).
 */

const {
  loadFacebookConfig,
  buildFacebookPageIdentityRequest
} = require("./facebookConfig");
const { validateManifest } = require("./manifest");
const { buildPlatformCaptions } = require("./captions");

const ERROR_CLASSIFICATION = Object.freeze({
  DEFINITIVE_FAILURE: "DEFINITIVE_FAILURE",
  AMBIGUOUS_FINAL_PUBLISH: "AMBIGUOUS_FINAL_PUBLISH"
});

/**
 * Custom error class for Facebook provider failures with deterministic classification.
 */
class FacebookProviderError extends Error {
  constructor(
    message,
    {
      classification = ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      status,
      graphError,
      cause
    } = {}
  ) {
    super(message);
    this.name = "FacebookProviderError";
    this.classification = classification;
    this.status = status;
    this.graphError = graphError;
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
    throw new FacebookProviderError(`Graph API network error: ${err.message}`, {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
      cause: err
    });
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new FacebookProviderError(
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

    throw new FacebookProviderError(
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
 * Verifies that the provided Page Access Token belongs to the configured FACEBOOK_PAGE_ID.
 * @param {object} params
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} params.config
 * @returns {Promise<{ verified: boolean, pageId: string, pageName: string }>}
 */
async function verifyFacebookPageIdentity({
  fetchImpl = globalThis.fetch,
  config
} = {}) {
  if (!config || typeof config !== "object") {
    throw new FacebookProviderError("Missing config in verifyFacebookPageIdentity", {
      classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
    });
  }

  const request = buildFacebookPageIdentityRequest(config);
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
    throw new FacebookProviderError(
      "Facebook Page identity verification failed: missing 'id' or 'name' in response",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  if (data.id !== config.pageId) {
    throw new FacebookProviderError(
      `Facebook Page ID mismatch: configured '${config.pageId}', token belongs to Page '${data.id}' ('${data.name}')`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  return {
    verified: true,
    pageId: config.pageId,
    pageName: data.name
  };
}

/**
 * Publishes a 5-image carousel to Facebook using unpublished photos and a multi-image feed post.
 * @param {object} params
 * @param {object} params.manifest Valid publication manifest
 * @param {Function} [params.fetchImpl=globalThis.fetch]
 * @param {object} [params.config] Loaded Facebook config
 * @returns {Promise<{ success: boolean, status: "PUBLISHED", platform: "facebook", pageId: string, postId: string, photoIds: string[] }>}
 */
async function publishFacebookCarousel({
  manifest,
  fetchImpl = globalThis.fetch,
  config = loadFacebookConfig()
} = {}) {
  // 1. Pre-write validation
  const manVal = validateManifest(manifest);
  if (!manVal.valid) {
    throw new FacebookProviderError(
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
    throw new FacebookProviderError(
      `Pre-publish caption construction failed: ${captionErr.message}`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        cause: captionErr
      }
    );
  }

  const message = captions.facebook;

  if (!Array.isArray(manifest.media) || manifest.media.length !== 5) {
    throw new FacebookProviderError(
      `Manifest must contain exactly 5 media items, found ${manifest.media?.length}`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  for (const item of manifest.media) {
    if (!item.url || !item.url.startsWith("https://")) {
      throw new FacebookProviderError(
        `All media URLs must use HTTPS, found '${item.url}'`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
        }
      );
    }
  }

  // 2. Verify Page token identity before ANY photo writes
  await verifyFacebookPageIdentity({ fetchImpl, config });

  // 3. Step 1 — Upload 5 unpublished photos in order
  const photoIds = [];
  for (let i = 0; i < manifest.media.length; i++) {
    const item = manifest.media[i];
    const photoEndpoint = `${config.graphBaseUrl}/${config.pageId}/photos`;
    const photoBody = new URLSearchParams({
      url: item.url,
      published: "false"
    });

    const photoData = await executeGraphRequest(fetchImpl, photoEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.pageAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: photoBody.toString()
    });

    if (
      !photoData ||
      typeof photoData.id !== "string" ||
      photoData.id.trim().length === 0
    ) {
      throw new FacebookProviderError(
        `Photo upload for slide ${item.index} did not return a valid photo ID`,
        {
          classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
        }
      );
    }

    photoIds.push(photoData.id);
  }

  // 4. Step 2 — Create multi-image feed post
  const attachedMedia = photoIds.map((id) => ({ media_fbid: id }));
  const feedEndpoint = `${config.graphBaseUrl}/${config.pageId}/feed`;
  const feedBody = new URLSearchParams({
    message,
    attached_media: JSON.stringify(attachedMedia)
  });

  let feedResponse;
  try {
    feedResponse = await fetchImpl(feedEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.pageAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: feedBody.toString()
    });
  } catch (transportErr) {
    // Critical: Transport failure on final publish is ambiguous
    throw new FacebookProviderError(
      `Transport failure during final Facebook feed publish: ${transportErr.message}`,
      {
        classification: ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH,
        cause: transportErr
      }
    );
  }

  let feedData;
  try {
    feedData = await feedResponse.json();
  } catch (parseErr) {
    throw new FacebookProviderError(
      `Facebook feed endpoint returned invalid JSON (HTTP ${feedResponse.status})`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        status: feedResponse.status,
        cause: parseErr
      }
    );
  }

  if (!feedResponse.ok || (feedData && feedData.error)) {
    const graphError = feedData?.error
      ? {
          message: feedData.error.message || "Unknown Graph API error",
          type: feedData.error.type,
          code: feedData.error.code,
          error_subcode: feedData.error.error_subcode
        }
      : undefined;

    throw new FacebookProviderError(
      `Facebook feed publishing failed (HTTP ${feedResponse.status}): ${
        graphError?.message || "Non-2xx response"
      }`,
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE,
        status: feedResponse.status,
        graphError
      }
    );
  }

  if (
    !feedData ||
    typeof feedData.id !== "string" ||
    feedData.id.trim().length === 0
  ) {
    throw new FacebookProviderError(
      "Facebook feed publishing did not return a valid post ID",
      {
        classification: ERROR_CLASSIFICATION.DEFINITIVE_FAILURE
      }
    );
  }

  return {
    success: true,
    status: "PUBLISHED",
    platform: "facebook",
    pageId: config.pageId,
    postId: feedData.id,
    photoIds
  };
}

module.exports = {
  ERROR_CLASSIFICATION,
  FacebookProviderError,
  verifyFacebookPageIdentity,
  publishFacebookCarousel
};
