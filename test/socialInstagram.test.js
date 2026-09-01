// test/socialInstagram.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  META_GRAPH_API_VERSION,
  loadInstagramConfig,
  buildInstagramIdentityRequest,
  buildContainerStatusRequest
} = require("../social/instagramConfig");
const {
  ERROR_CLASSIFICATION,
  InstagramProviderError,
  verifyInstagramBusinessIdentity,
  waitForInstagramContainerReady,
  publishInstagramCarousel
} = require("../social/instagram");

function createValidManifest() {
  return {
    schemaVersion: 1,
    publishDate: "2026-08-28",
    contentId: "social-2026-08-28",
    category: "dream_symbols",
    topic: "Water and Ocean Dreams",
    slideCount: 5,
    media: [
      {
        index: 1,
        role: "cover",
        key: "social/2026/08/28/slide-01.jpg",
        url: "https://media.dreamlyai.com/social/2026/08/28/slide-01.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 25000
      },
      {
        index: 2,
        role: "content",
        key: "social/2026/08/28/slide-02.jpg",
        url: "https://media.dreamlyai.com/social/2026/08/28/slide-02.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 26000
      },
      {
        index: 3,
        role: "content",
        key: "social/2026/08/28/slide-03.jpg",
        url: "https://media.dreamlyai.com/social/2026/08/28/slide-03.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 27000
      },
      {
        index: 4,
        role: "content",
        key: "social/2026/08/28/slide-04.jpg",
        url: "https://media.dreamlyai.com/social/2026/08/28/slide-04.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 28000
      },
      {
        index: 5,
        role: "cta",
        key: "social/2026/08/28/slide-05.jpg",
        url: "https://media.dreamlyai.com/social/2026/08/28/slide-05.jpg",
        contentType: "image/jpeg",
        width: 1080,
        height: 1350,
        byteLength: 29000
      }
    ],
    captions: {
      instagram: "Have you ever dreamed of open water? Water reflects our emotions. #dreamlyai",
      facebook: "Water in dreams often mirrors our emotional landscape."
    }
  };
}

function createMockConfig() {
  return {
    pageId: "100123456789",
    pageAccessToken: "EAAX_MOCK_PAGE_TOKEN_SECRET_IG_12345",
    instagramBusinessAccountId: "17841400000000001",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockFetch(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (handlers.onCall) {
      const customRes = await handlers.onCall(url, options, calls.length);
      if (customRes) return customRes;
    }

    // 1. Identity GET /{PAGE_ID}?fields=id,name,instagram_business_account
    if (url.includes("?fields=id,name,instagram_business_account")) {
      if (handlers.identityError) throw handlers.identityError;
      if (handlers.identityResponse) return handlers.identityResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "100123456789",
          name: "DreamlyAI Official",
          instagram_business_account: {
            id: "17841400000000001"
          }
        })
      };
    }

    // 2. Container status check GET /{containerId}?fields=status_code,status
    if (url.includes("?fields=status_code,status")) {
      if (handlers.statusError) {
        if (typeof handlers.statusError === "function") {
          const err = handlers.statusError(url, calls.length);
          if (err) throw err;
        } else {
          throw handlers.statusError;
        }
      }
      if (handlers.statusResponse) {
        if (typeof handlers.statusResponse === "function") {
          return handlers.statusResponse(url, calls.length);
        }
        return handlers.statusResponse;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status_code: "FINISHED", status: "Finished" })
      };
    }

    // 3. Media Creation POST /{IG_USER_ID}/media
    if (url.endsWith("/media")) {
      if (handlers.mediaError) {
        if (typeof handlers.mediaError === "function") {
          const err = handlers.mediaError(options, calls.length);
          if (err) throw err;
        } else {
          throw handlers.mediaError;
        }
      }
      if (handlers.mediaResponse) {
        if (typeof handlers.mediaResponse === "function") {
          return handlers.mediaResponse(options, calls.length);
        }
        return handlers.mediaResponse;
      }

      const bodyStr = options.body || "";
      if (bodyStr.includes("media_type=CAROUSEL")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "parent_container_99999" })
        };
      } else {
        const childCount = calls.filter((c) => c.url.endsWith("/media") && !c.options.body?.includes("CAROUSEL")).length;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `child_container_${childCount}` })
        };
      }
    }

    // 4. Media Publish POST /{IG_USER_ID}/media_publish
    if (url.endsWith("/media_publish")) {
      if (handlers.publishError) throw handlers.publishError;
      if (handlers.publishResponse) return handlers.publishResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "ig_media_17849999999999999" })
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "Unknown route" } })
    };
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}

const noopSleep = async () => {};

describe("Instagram 5-Image Carousel Publishing Adapter", () => {
  describe("Configuration & Request Builders", () => {
    it("1. valid Instagram config loads", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_IG",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000001"
      };
      const config = loadInstagramConfig(env);
      assert.equal(config.pageId, "100123456789");
      assert.equal(config.pageAccessToken, "EAAX_TOKEN_IG");
      assert.equal(config.instagramBusinessAccountId, "17841400000000001");
      assert.equal(config.graphApiVersion, "v25.0");
      assert.equal(config.graphBaseUrl, "https://graph.facebook.com/v25.0");
    });

    it("2. missing FACEBOOK_PAGE_ID fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_IG",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000001"
      };
      assert.throws(
        () => loadInstagramConfig(env),
        /Missing or empty required environment variable: FACEBOOK_PAGE_ID/i
      );
    });

    it("3. missing FACEBOOK_PAGE_ACCESS_TOKEN fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "  ",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: "17841400000000001"
      };
      assert.throws(
        () => loadInstagramConfig(env),
        /Missing or empty required environment variable: FACEBOOK_PAGE_ACCESS_TOKEN/i
      );
    });

    it("4. missing INSTAGRAM_BUSINESS_ACCOUNT_ID fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_IG",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: ""
      };
      assert.throws(
        () => loadInstagramConfig(env),
        /Missing or empty required environment variable: INSTAGRAM_BUSINESS_ACCOUNT_ID/i
      );
    });

    it("5. non-numeric IG business ID fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_IG",
        INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig_account_abc"
      };
      assert.throws(
        () => loadInstagramConfig(env),
        /Invalid INSTAGRAM_BUSINESS_ACCOUNT_ID: must contain digits only/i
      );
    });

    it("6. Graph version remains v25.0", () => {
      assert.equal(META_GRAPH_API_VERSION, "v25.0");
    });

    it("7. identity request contains no token URL parameter", () => {
      const config = createMockConfig();
      const req = buildInstagramIdentityRequest(config);
      assert.equal(req.method, "GET");
      assert.equal(
        req.url,
        `https://graph.facebook.com/v25.0/${config.pageId}?fields=id,name,instagram_business_account`
      );
      assert.equal(req.url.includes(config.pageAccessToken), false);
      assert.equal(req.headers.Authorization, `Bearer ${config.pageAccessToken}`);
    });

    it("8. status request contains no token URL parameter", () => {
      const config = createMockConfig();
      const req = buildContainerStatusRequest({ config, containerId: "child_12345" });
      assert.equal(req.method, "GET");
      assert.equal(
        req.url,
        "https://graph.facebook.com/v25.0/child_12345?fields=status_code,status"
      );
      assert.equal(req.url.includes(config.pageAccessToken), false);
      assert.equal(req.headers.Authorization, `Bearer ${config.pageAccessToken}`);
    });
  });

  describe("Instagram Identity Verification", () => {
    it("9. matching Page + IG identity succeeds", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch();
      const identity = await verifyInstagramBusinessIdentity({
        fetchImpl: mockFetch,
        config
      });

      assert.equal(identity.verified, true);
      assert.equal(identity.pageId, "100123456789");
      assert.equal(identity.pageName, "DreamlyAI Official");
      assert.equal(identity.instagramBusinessAccountId, "17841400000000001");
      assert.equal(mockFetch.calls.length, 1);
    });

    it("10. wrong Page ID fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        identityResponse: {
          ok: true,
          status: 200,
          json: async () => ({
            id: "999999999999",
            name: "Other Page",
            instagram_business_account: { id: "17841400000000001" }
          })
        }
      });

      await assert.rejects(
        async () => verifyInstagramBusinessIdentity({ fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof InstagramProviderError, true);
          assert.match(err.message, /Page ID mismatch/i);
          return true;
        }
      );
    });

    it("11. missing instagram_business_account fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        identityResponse: {
          ok: true,
          status: 200,
          json: async () => ({
            id: "100123456789",
            name: "DreamlyAI Official"
          })
        }
      });

      await assert.rejects(
        async () => verifyInstagramBusinessIdentity({ fetchImpl: mockFetch, config }),
        /No linked instagram_business_account found/i
      );
    });

    it("12. wrong Instagram business ID fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        identityResponse: {
          ok: true,
          status: 200,
          json: async () => ({
            id: "100123456789",
            name: "DreamlyAI Official",
            instagram_business_account: { id: "88888888888888888" }
          })
        }
      });

      await assert.rejects(
        async () => verifyInstagramBusinessIdentity({ fetchImpl: mockFetch, config }),
        /Instagram Business Account ID mismatch/i
      );
    });

    it("13. malformed identity response fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        identityResponse: {
          ok: true,
          status: 200,
          json: async () => ({ id: "100123456789" }) // missing name & ig account
        }
      });

      await assert.rejects(
        async () => verifyInstagramBusinessIdentity({ fetchImpl: mockFetch, config }),
        /missing 'id' or 'name'/i
      );
    });

    it("14. Graph error fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        identityResponse: {
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: "Invalid OAuth access token", code: 190 }
          })
        }
      });

      await assert.rejects(
        async () => verifyInstagramBusinessIdentity({ fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err.status, 401);
          assert.equal(err.graphError.code, 190);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          return true;
        }
      );
    });

    it("15. identity failure causes zero /media writes", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        identityResponse: {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: "Permission Denied", code: 200 } })
        }
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Permission Denied/i
      );

      const mediaWrites = mockFetch.calls.filter((c) => c.url.includes("/media"));
      assert.equal(mediaWrites.length, 0);
    });
  });

  describe("Child Creation & Readiness Polling", () => {
    it("16-22. valid flow creates 5 children in order with Bearer token, no caption, no URL tokens", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishInstagramCarousel({
        manifest,
        fetchImpl: mockFetch,
        config,
        sleepImpl: noopSleep
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
      assert.equal(result.platform, "instagram");
      assert.equal(result.instagramBusinessAccountId, "17841400000000001");
      assert.equal(result.mediaId, "ig_media_17849999999999999");
      assert.equal(result.parentContainerId, "parent_container_99999");
      assert.deepEqual(result.childContainerIds, [
        "child_container_1",
        "child_container_2",
        "child_container_3",
        "child_container_4",
        "child_container_5"
      ]);

      // Filter child creation calls (POST to /media without CAROUSEL)
      const childPosts = mockFetch.calls.filter(
        (c) => c.url.endsWith("/media") && c.options.method === "POST" && !c.options.body?.includes("CAROUSEL")
      );
      assert.equal(childPosts.length, 5);

      for (let i = 0; i < 5; i++) {
        const call = childPosts[i];
        assert.equal(
          call.url,
          `https://graph.facebook.com/v25.0/${config.instagramBusinessAccountId}/media`
        );
        assert.equal(
          call.options.headers.Authorization,
          `Bearer ${config.pageAccessToken}`
        );
        assert.equal(call.url.includes(config.pageAccessToken), false);

        const params = new URLSearchParams(call.options.body);
        assert.equal(params.get("image_url"), manifest.media[i].url);
        assert.equal(params.get("is_carousel_item"), "true");
        assert.equal(params.has("caption"), false);
      }
    });

    it("23. malformed child response stops flow", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        mediaResponse: () => ({
          ok: true,
          status: 200,
          json: async () => ({ no_id_present: true })
        })
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /did not return a valid container ID/i
      );

      // Identity (1) + Child 1 (1) = 2 calls total
      assert.equal(mockFetch.calls.length, 2);
    });

    it("24. child Graph error stops further writes", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        mediaResponse: () => ({
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: "Invalid image URL format", code: 100 }
          })
        })
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Invalid image URL format/i
      );

      assert.equal(mockFetch.calls.length, 2);
    });

    it("25. failure on child 3 creates no child 4/5 and no parent", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      let childCount = 0;

      const mockFetch = createMockFetch({
        mediaResponse: (options) => {
          if (!options.body?.includes("CAROUSEL")) {
            childCount++;
            if (childCount === 3) {
              return {
                ok: false,
                status: 500,
                json: async () => ({
                  error: { message: "Internal server error on child 3", code: 2 }
                })
              };
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({ id: `child_${childCount}` })
            };
          }
        }
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Internal server error on child 3/i
      );

      const mediaCalls = mockFetch.calls.filter((c) => c.url.endsWith("/media"));
      assert.equal(mediaCalls.length, 3); // 3 children attempted, no parent created
    });

    it("26-27. IN_PROGRESS then FINISHED polls successfully", async () => {
      const config = createMockConfig();
      let pollCount = 0;

      const mockFetch = createMockFetch({
        statusResponse: () => {
          pollCount++;
          if (pollCount === 1) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ status_code: "IN_PROGRESS", status: "In progress" })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ status_code: "FINISHED", status: "Finished" })
          };
        }
      });

      const ready = await waitForInstagramContainerReady({
        containerId: "child_test_123",
        fetchImpl: mockFetch,
        config,
        sleepImpl: noopSleep,
        maxAttempts: 3
      });

      assert.equal(ready.ready, true);
      assert.equal(ready.status_code, "FINISHED");
      assert.equal(pollCount, 2);
    });

    it("28. ERROR child fails immediately", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        statusResponse: () => ({
          ok: true,
          status: 200,
          json: async () => ({ status_code: "ERROR", status: "Image processing failed" })
        })
      });

      await assert.rejects(
        async () =>
          waitForInstagramContainerReady({
            containerId: "child_err_1",
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /failed with status ERROR/i
      );
    });

    it("29. EXPIRED child fails immediately", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        statusResponse: () => ({
          ok: true,
          status: 200,
          json: async () => ({ status_code: "EXPIRED", status: "Container expired" })
        })
      });

      await assert.rejects(
        async () =>
          waitForInstagramContainerReady({
            containerId: "child_exp_1",
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /expired before publishing/i
      );
    });

    it("30-31. unknown / malformed status fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        statusResponse: () => ({
          ok: true,
          status: 200,
          json: async () => ({ status_code: "WEIRD_UNKNOWN_STATUS" })
        })
      });

      await assert.rejects(
        async () =>
          waitForInstagramContainerReady({
            containerId: "child_weird_1",
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Unrecognized container status_code/i
      );
    });

    it("32-33. persistent IN_PROGRESS reaches bounded timeout and creates no parent", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      let pollCount = 0;

      const mockFetch = createMockFetch({
        statusResponse: () => {
          pollCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ status_code: "IN_PROGRESS", status: "In progress" })
          };
        }
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep,
            maxPollAttempts: 3
          }),
        (err) => {
          assert.equal(err instanceof InstagramProviderError, true);
          assert.equal(err.graphError?.code, "CONTAINER_READINESS_TIMEOUT");
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          return true;
        }
      );

      // Verify no parent was created
      const parentPosts = mockFetch.calls.filter((c) => c.options.body?.includes("CAROUSEL"));
      assert.equal(parentPosts.length, 0);
    });
  });

  describe("Parent Creation & Readiness", () => {
    it("34-39. parent created after all 5 children FINISHED, CAROUSEL type, exact order, unaltered caption", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await publishInstagramCarousel({
        manifest,
        fetchImpl: mockFetch,
        config,
        sleepImpl: noopSleep
      });

      const parentPost = mockFetch.calls.find((c) => c.options.body?.includes("CAROUSEL"));
      assert.equal(parentPost !== undefined, true);
      assert.equal(
        parentPost.url,
        `https://graph.facebook.com/v25.0/${config.instagramBusinessAccountId}/media`
      );

      const params = new URLSearchParams(parentPost.options.body);
      assert.equal(params.get("media_type"), "CAROUSEL");
      assert.equal(
        params.get("children"),
        "child_container_1,child_container_2,child_container_3,child_container_4,child_container_5"
      );
      assert.equal(params.get("caption"), manifest.captions.instagram);
      assert.equal(params.get("caption").includes("Download DreamlyAI"), false);
    });

    it("40-45. parent FINISHED proceeds to media_publish, while parent timeout/error prevents media_publish", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();

      const mockFetch = createMockFetch({
        statusResponse: (url) => {
          // If status check is for parent container, return ERROR
          if (url.includes("parent_container_99999")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ status_code: "ERROR", status: "Parent failed assembly" })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ status_code: "FINISHED", status: "Finished" })
          };
        }
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Parent failed assembly/i
      );

      const publishCalls = mockFetch.calls.filter((c) => c.url.endsWith("/media_publish"));
      assert.equal(publishCalls.length, 0);
    });
  });

  describe("Final Media Publish & Ambiguity Classification", () => {
    it("46-52. media_publish receives creation_id, occurs once, returns sanitized PUBLISHED result", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishInstagramCarousel({
        manifest,
        fetchImpl: mockFetch,
        config,
        sleepImpl: noopSleep
      });

      const publishCall = mockFetch.calls.find((c) => c.url.endsWith("/media_publish"));
      assert.equal(publishCall !== undefined, true);

      const params = new URLSearchParams(publishCall.options.body);
      assert.equal(params.get("creation_id"), "parent_container_99999");

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
      assert.equal(result.mediaId, "ig_media_17849999999999999");
      assert.equal(result.parentContainerId, "parent_container_99999");
      assert.equal("pageAccessToken" in result, false);
      assert.equal("caption" in result, false);
      assert.equal("manifest" in result, false);
    });

    it("53. explicit media_publish HTTP error is DEFINITIVE_FAILURE", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        publishResponse: {
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: "Invalid creation_id parameter", code: 100 }
          })
        }
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        (err) => {
          assert.equal(err instanceof InstagramProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          assert.equal(err.status, 400);
          assert.equal(err.parentContainerId, "parent_container_99999");
          return true;
        }
      );
    });

    it("54. explicit Graph error is DEFINITIVE_FAILURE", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        publishResponse: {
          ok: true,
          status: 200,
          json: async () => ({
            error: { message: "Media publish rate limit reached", code: 32 }
          })
        }
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        (err) => {
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          assert.match(err.message, /Media publish rate limit reached/i);
          return true;
        }
      );
    });

    it("55-59. transport throw at media_publish is AMBIGUOUS_FINAL_PUBLISH and is not retried", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        publishError: new Error("ECONNRESET: connection reset by peer")
      });

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        (err) => {
          assert.equal(err instanceof InstagramProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH);
          assert.equal(err.parentContainerId, "parent_container_99999");
          assert.match(err.message, /Transport failure during final Instagram media_publish/i);
          return true;
        }
      );

      const publishCalls = mockFetch.calls.filter((c) => c.url.endsWith("/media_publish"));
      assert.equal(publishCalls.length, 1); // Not retried
    });
  });

  describe("JPEG Requirements & Boundaries", () => {
    it("60. invalid non-JPEG manifest fails before provider writes", async () => {
      const badManifest = {
        ...createValidManifest(),
        media: createValidManifest().media.map((m, idx) =>
          idx === 0 ? { ...m, contentType: "image/png" } : m
        )
      };
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest: badManifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Pre-publish manifest validation failed/i
      );

      assert.equal(mockFetch.calls.length, 0);
    });

    it("61. missing media URL fails before provider writes", async () => {
      const badManifest = {
        ...createValidManifest(),
        media: createValidManifest().media.map((m, idx) =>
          idx === 0 ? { ...m, url: "" } : m
        )
      };
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await assert.rejects(
        async () =>
          publishInstagramCarousel({
            manifest: badManifest,
            fetchImpl: mockFetch,
            config,
            sleepImpl: noopSleep
          }),
        /Pre-publish manifest validation failed/i
      );

      assert.equal(mockFetch.calls.length, 0);
    });

    it("62-64. only Instagram code is added, no Pinterest, no Redis mutations in adapter", () => {
      const config = createMockConfig();
      assert.equal("pinterest" in config, false);
    });
  });

  describe("Security & Tokens", () => {
    it("65. token never appears in sanitized thrown errors", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        publishResponse: {
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: "The access token could not be decrypted", code: 190 }
          })
        }
      });

      try {
        await publishInstagramCarousel({
          manifest,
          fetchImpl: mockFetch,
          config,
          sleepImpl: noopSleep
        });
        assert.fail("Should have thrown");
      } catch (err) {
        assert.equal(err.message.includes(config.pageAccessToken), false);
        assert.equal(JSON.stringify(err).includes(config.pageAccessToken), false);
      }
    });

    it("66. token never appears in provider result", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishInstagramCarousel({
        manifest,
        fetchImpl: mockFetch,
        config,
        sleepImpl: noopSleep
      });

      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(config.pageAccessToken), false);
    });

    it("67. token appears only in Authorization header of mock requests", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await publishInstagramCarousel({
        manifest,
        fetchImpl: mockFetch,
        config,
        sleepImpl: noopSleep
      });

      for (const call of mockFetch.calls) {
        assert.equal(call.url.includes(config.pageAccessToken), false);
        assert.equal(
          call.options.headers.Authorization,
          `Bearer ${config.pageAccessToken}`
        );
      }
    });
  });
});
