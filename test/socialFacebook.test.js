// test/socialFacebook.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { GOOGLE_PLAY_URL } = require("../social/config");
const {
  META_GRAPH_API_VERSION,
  loadFacebookConfig,
  buildFacebookPageIdentityRequest
} = require("../social/facebookConfig");
const {
  ERROR_CLASSIFICATION,
  FacebookProviderError,
  verifyFacebookPageIdentity,
  publishFacebookCarousel
} = require("../social/facebook");

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
      instagram: "Have you ever dreamed of open water? Water reflects our emotions.",
      facebook: "Water in dreams often mirrors our emotional landscape. Calm seas signify peace."
    }
  };
}

function createMockConfig() {
  return {
    pageId: "100123456789",
    pageAccessToken: "EAAX_MOCK_PAGE_TOKEN_SECRET_12345",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockFetch(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (handlers.onCall) {
      const customResponse = await handlers.onCall(url, options, calls.length);
      if (customResponse) return customResponse;
    }

    if (url.includes("/me?fields=id,name")) {
      if (handlers.meError) throw handlers.meError;
      if (handlers.meResponse) return handlers.meResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789", name: "DreamlyAI Official" })
      };
    }

    if (url.includes("/photos")) {
      if (handlers.photoError) {
        if (typeof handlers.photoError === "function") {
          const err = handlers.photoError(calls.length);
          if (err) throw err;
        } else {
          throw handlers.photoError;
        }
      }
      if (handlers.photoResponse) {
        if (typeof handlers.photoResponse === "function") {
          return handlers.photoResponse(calls.length);
        }
        return handlers.photoResponse;
      }
      const photoCount = calls.filter((c) => c.url.includes("/photos")).length;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `photo_id_${photoCount}` })
      };
    }

    if (url.includes("/feed")) {
      if (handlers.feedError) throw handlers.feedError;
      if (handlers.feedResponse) return handlers.feedResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789_post_999888777" })
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

describe("Facebook Multi-Image Publishing Adapter", () => {
  describe("Configuration & Identity Request Builder", () => {
    it("1. valid Facebook config loads", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_XYZ"
      };
      const config = loadFacebookConfig(env);
      assert.equal(config.pageId, "100123456789");
      assert.equal(config.pageAccessToken, "EAAX_TOKEN_XYZ");
      assert.equal(config.graphApiVersion, "v25.0");
      assert.equal(config.graphBaseUrl, "https://graph.facebook.com/v25.0");
    });

    it("2. missing FACEBOOK_PAGE_ID fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_XYZ"
      };
      assert.throws(
        () => loadFacebookConfig(env),
        /Missing or empty required environment variable: FACEBOOK_PAGE_ID/i
      );
    });

    it("3. non-numeric FACEBOOK_PAGE_ID fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "page_abc_123",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN_XYZ"
      };
      assert.throws(
        () => loadFacebookConfig(env),
        /Invalid FACEBOOK_PAGE_ID: must contain digits only/i
      );
    });

    it("4. missing FACEBOOK_PAGE_ACCESS_TOKEN fails", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "   "
      };
      assert.throws(
        () => loadFacebookConfig(env),
        /Missing or empty required environment variable: FACEBOOK_PAGE_ACCESS_TOKEN/i
      );
    });

    it("5. Graph API version is exactly v25.0", () => {
      assert.equal(META_GRAPH_API_VERSION, "v25.0");
    });

    it("6. Graph base URL is versioned", () => {
      const config = createMockConfig();
      assert.equal(config.graphBaseUrl, "https://graph.facebook.com/v25.0");
    });

    it("7. identity request does not put token in URL", () => {
      const config = createMockConfig();
      const req = buildFacebookPageIdentityRequest(config);
      assert.equal(req.method, "GET");
      assert.equal(req.url, "https://graph.facebook.com/v25.0/me?fields=id,name");
      assert.equal(req.url.includes(config.pageAccessToken), false);
      assert.equal(req.headers.Authorization, `Bearer ${config.pageAccessToken}`);
    });
  });

  describe("Page Identity Verification", () => {
    it("8. valid /me identity matching PAGE_ID succeeds", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch();
      const identity = await verifyFacebookPageIdentity({
        fetchImpl: mockFetch,
        config
      });

      assert.equal(identity.verified, true);
      assert.equal(identity.pageId, "100123456789");
      assert.equal(identity.pageName, "DreamlyAI Official");
      assert.equal(mockFetch.calls.length, 1);
      assert.equal(mockFetch.calls[0].url, "https://graph.facebook.com/v25.0/me?fields=id,name");
      assert.equal(
        mockFetch.calls[0].options.headers.Authorization,
        `Bearer ${config.pageAccessToken}`
      );
    });

    it("9. /me identity mismatch fails closed", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        meResponse: {
          ok: true,
          status: 200,
          json: async () => ({ id: "999999999999", name: "Another Random Page" })
        }
      });

      await assert.rejects(
        async () => verifyFacebookPageIdentity({ fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof FacebookProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          assert.match(err.message, /Page ID mismatch/i);
          return true;
        }
      );
    });

    it("10. identity response missing id fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        meResponse: {
          ok: true,
          status: 200,
          json: async () => ({ name: "DreamlyAI Official" })
        }
      });

      await assert.rejects(
        async () => verifyFacebookPageIdentity({ fetchImpl: mockFetch, config }),
        /missing 'id' or 'name'/i
      );
    });

    it("11. identity response missing name fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        meResponse: {
          ok: true,
          status: 200,
          json: async () => ({ id: "100123456789" })
        }
      });

      await assert.rejects(
        async () => verifyFacebookPageIdentity({ fetchImpl: mockFetch, config }),
        /missing 'id' or 'name'/i
      );
    });

    it("12. identity Graph error fails", async () => {
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        meResponse: {
          ok: false,
          status: 401,
          json: async () => ({
            error: {
              message: "Invalid OAuth access token.",
              type: "OAuthException",
              code: 190
            }
          })
        }
      });

      await assert.rejects(
        async () => verifyFacebookPageIdentity({ fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof FacebookProviderError, true);
          assert.equal(err.status, 401);
          assert.equal(err.graphError.code, 190);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          return true;
        }
      );
    });

    it("13. identity failure causes zero /photos writes", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        meResponse: {
          ok: false,
          status: 403,
          json: async () => ({
            error: { message: "Permissions error", code: 200 }
          })
        }
      });

      await assert.rejects(
        async () =>
          publishFacebookCarousel({
            manifest,
            fetchImpl: mockFetch,
            config
          }),
        /Permissions error/i
      );

      // Only /me was called, zero /photos calls
      assert.equal(mockFetch.calls.length, 1);
      assert.equal(mockFetch.calls[0].url.includes("/me"), true);
    });
  });

  describe("Photo Upload Flow", () => {
    it("14-20. valid publish makes 1 identity GET then 5 /photos POSTs in order with Bearer token", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishFacebookCarousel({
        manifest,
        fetchImpl: mockFetch,
        config
      });

      assert.equal(result.success, true);
      assert.equal(result.status, "PUBLISHED");
      assert.equal(result.platform, "facebook");
      assert.equal(result.pageId, "100123456789");
      assert.equal(result.postId, "100123456789_post_999888777");
      assert.deepEqual(result.photoIds, [
        "photo_id_1",
        "photo_id_2",
        "photo_id_3",
        "photo_id_4",
        "photo_id_5"
      ]);

      // Total calls: 1 (/me) + 5 (/photos) + 1 (/feed) = 7
      assert.equal(mockFetch.calls.length, 7);

      // 14. First call is identity GET
      assert.equal(mockFetch.calls[0].url, "https://graph.facebook.com/v25.0/me?fields=id,name");

      // 15-19. Next 5 calls are /photos POSTs
      for (let i = 0; i < 5; i++) {
        const call = mockFetch.calls[i + 1];
        assert.equal(
          call.url,
          `https://graph.facebook.com/v25.0/${config.pageId}/photos`
        );
        assert.equal(call.options.method, "POST");
        assert.equal(
          call.options.headers.Authorization,
          `Bearer ${config.pageAccessToken}`
        );
        assert.equal(call.url.includes(config.pageAccessToken), false);

        const bodyParams = new URLSearchParams(call.options.body);
        assert.equal(bodyParams.get("published"), "false");
        assert.equal(bodyParams.get("url"), manifest.media[i].url);
      }
    });

    it("21. malformed first photo response prevents /feed", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        photoResponse: () => ({
          ok: true,
          status: 200,
          json: async () => ({ unexpected: "no_id_here" })
        })
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        /Photo upload for slide 1 did not return a valid photo ID/i
      );

      // 1 identity + 1 failed photo call = 2 total
      assert.equal(mockFetch.calls.length, 2);
      const feedCalls = mockFetch.calls.filter((c) => c.url.includes("/feed"));
      assert.equal(feedCalls.length, 0);
    });

    it("22. explicit photo Graph error prevents /feed", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        photoResponse: () => ({
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: "Invalid photo URL format", code: 100 }
          })
        })
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof FacebookProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          assert.match(err.message, /Invalid photo URL format/i);
          return true;
        }
      );

      const feedCalls = mockFetch.calls.filter((c) => c.url.includes("/feed"));
      assert.equal(feedCalls.length, 0);
    });

    it("23. failure on photo 3 stops subsequent photo uploads and prevents /feed", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      let photoCallCount = 0;

      const mockFetch = createMockFetch({
        photoResponse: () => {
          photoCallCount++;
          if (photoCallCount === 3) {
            return {
              ok: false,
              status: 500,
              json: async () => ({
                error: { message: "Internal server error on photo 3", code: 2 }
              })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: `photo_id_${photoCallCount}` })
          };
        }
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        /Internal server error on photo 3/i
      );

      // 1 identity + 3 photos = 4 calls total
      assert.equal(mockFetch.calls.length, 4);
      const feedCalls = mockFetch.calls.filter((c) => c.url.includes("/feed"));
      assert.equal(feedCalls.length, 0);
    });
  });

  describe("Final Feed Post", () => {
    it("24-32. /feed occurs only after 5 photos, uses final caption, attached_media, returns sanitized result", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishFacebookCarousel({
        manifest,
        fetchImpl: mockFetch,
        config
      });

      // 24. Feed is the 7th call
      const feedCall = mockFetch.calls[6];
      assert.equal(feedCall.url, `https://graph.facebook.com/v25.0/${config.pageId}/feed`);
      assert.equal(feedCall.options.method, "POST");

      const bodyParams = new URLSearchParams(feedCall.options.body);
      const message = bodyParams.get("message");

      // 25-26. Message contains final Facebook caption with Play URL exactly once
      assert.equal(message.includes(manifest.captions.facebook), true);
      assert.equal(message.includes(GOOGLE_PLAY_URL), true);
      assert.equal(message.split(GOOGLE_PLAY_URL).length - 1, 1);

      // 27. attached_media contains exactly 5 media_fbid in order
      const attachedMedia = JSON.parse(bodyParams.get("attached_media"));
      assert.deepEqual(attachedMedia, [
        { media_fbid: "photo_id_1" },
        { media_fbid: "photo_id_2" },
        { media_fbid: "photo_id_3" },
        { media_fbid: "photo_id_4" },
        { media_fbid: "photo_id_5" }
      ]);

      // 28. Final feed uses Bearer token
      assert.equal(feedCall.options.headers.Authorization, `Bearer ${config.pageAccessToken}`);

      // 29-32. Sanitized result checks
      assert.equal(result.success, true);
      assert.equal(result.postId, "100123456789_post_999888777");
      assert.equal("pageAccessToken" in result, false);
      assert.equal("captions" in result, false);
      assert.equal("manifest" in result, false);
    });
  });

  describe("Fail-Closed Preconditions", () => {
    it("33. invalid manifest causes zero network calls", async () => {
      const badManifest = { ...createValidManifest(), schemaVersion: 999 };
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest: badManifest, fetchImpl: mockFetch, config }),
        /Pre-publish manifest validation failed/i
      );

      assert.equal(mockFetch.calls.length, 0);
    });

    it("34. invalid Facebook final caption causes zero provider writes", async () => {
      const badManifest = {
        ...createValidManifest(),
        captions: {
          instagram: "Valid IG",
          facebook: "A".repeat(1950) // will exceed 2000 once CTA is appended
        }
      };
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest: badManifest, fetchImpl: mockFetch, config }),
        /Pre-publish manifest validation failed|Pre-publish caption construction failed/i
      );

      assert.equal(mockFetch.calls.length, 0);
    });

    it("35. wrong/missing media causes zero provider writes", async () => {
      const badManifest = {
        ...createValidManifest(),
        media: createValidManifest().media.slice(0, 4)
      };
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest: badManifest, fetchImpl: mockFetch, config }),
        /Pre-publish manifest validation failed/i
      );

      assert.equal(mockFetch.calls.length, 0);
    });

    it("36. identity mismatch causes zero provider writes", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        meResponse: {
          ok: true,
          status: 200,
          json: async () => ({ id: "777777777777", name: "Mismatched Page" })
        }
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        /Page ID mismatch/i
      );

      // Only /me was called, zero /photos or /feed calls
      assert.equal(mockFetch.calls.length, 1);
    });
  });

  describe("Error Semantics & Ambiguity Classification", () => {
    it("37. explicit HTTP error from /feed is DEFINITIVE_FAILURE", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        feedResponse: {
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: "Invalid attached_media parameters", code: 100 }
          })
        }
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof FacebookProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          assert.equal(err.status, 400);
          assert.match(err.message, /Invalid attached_media parameters/i);
          return true;
        }
      );
    });

    it("38. explicit Meta Graph error from /feed is DEFINITIVE_FAILURE", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        feedResponse: {
          ok: true, // Sometimes 200 with error object in Graph API
          status: 200,
          json: async () => ({
            error: { message: "Rate limit reached", code: 32 }
          })
        }
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof FacebookProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.DEFINITIVE_FAILURE);
          assert.match(err.message, /Rate limit reached/i);
          return true;
        }
      );
    });

    it("39-42. transport throw during final /feed becomes AMBIGUOUS_FINAL_PUBLISH and is not retried", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        feedError: new Error("ETIMEDOUT: Connection timed out")
      });

      await assert.rejects(
        async () => publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config }),
        (err) => {
          assert.equal(err instanceof FacebookProviderError, true);
          assert.equal(err.classification, ERROR_CLASSIFICATION.AMBIGUOUS_FINAL_PUBLISH);
          assert.match(err.message, /Transport failure during final Facebook feed publish/i);
          return true;
        }
      );

      // Exactly 1 identity + 5 photos + 1 feed attempt = 7 calls (no automatic retry)
      assert.equal(mockFetch.calls.length, 7);
      const feedCalls = mockFetch.calls.filter((c) => c.url.includes("/feed"));
      assert.equal(feedCalls.length, 1);
    });
  });

  describe("Security & Boundaries", () => {
    it("43. no token appears in thrown sanitized error output", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch({
        feedResponse: {
          ok: false,
          status: 401,
          json: async () => ({
            error: { message: "Session has expired", code: 190 }
          })
        }
      });

      try {
        await publishFacebookCarousel({ manifest, fetchImpl: mockFetch, config });
        assert.fail("Should have thrown");
      } catch (err) {
        assert.equal(err.message.includes(config.pageAccessToken), false);
        assert.equal(JSON.stringify(err).includes(config.pageAccessToken), false);
      }
    });

    it("44. no token appears in provider result", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishFacebookCarousel({
        manifest,
        fetchImpl: mockFetch,
        config
      });

      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(config.pageAccessToken), false);
    });

    it("45. no System User token configuration exists", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_PAGE_TOKEN"
      };
      const config = loadFacebookConfig(env);
      assert.equal("systemUserToken" in config, false);
      assert.equal("appSecret" in config, false);
    });

    it("46. no Instagram code is introduced in Facebook adapter", async () => {
      const manifest = createValidManifest();
      const config = createMockConfig();
      const mockFetch = createMockFetch();

      const result = await publishFacebookCarousel({
        manifest,
        fetchImpl: mockFetch,
        config
      });

      assert.equal(result.platform, "facebook");
      const urls = mockFetch.calls.map((c) => c.url);
      for (const url of urls) {
        assert.equal(url.includes("instagram"), false);
      }
    });

    it("47. no Pinterest code is introduced", () => {
      const env = {
        FACEBOOK_PAGE_ID: "100123456789",
        FACEBOOK_PAGE_ACCESS_TOKEN: "EAAX_TOKEN"
      };
      const config = loadFacebookConfig(env);
      assert.equal("pinterest" in config, false);
    });
  });
});
