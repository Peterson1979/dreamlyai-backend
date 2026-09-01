// test/socialStorage.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildPreparedContent } = require("../social/contentSchema");
const { renderCarousel } = require("../social/renderer");
const {
  loadR2Config,
  buildSlideStorageKey,
  buildPublicMediaUrl
} = require("../social/storageConfig");
const {
  createR2Client,
  uploadRenderedCarousel,
  validateRenderedCarousel
} = require("../social/storage");

function createMockEnv(overrides = {}) {
  return {
    R2_ACCOUNT_ID: "mock_account_12345",
    R2_ACCESS_KEY_ID: "mock_access_key_abcde",
    R2_SECRET_ACCESS_KEY: "mock_secret_key_xyz987",
    R2_BUCKET_NAME: "dreamlyai-social-media",
    R2_PUBLIC_BASE_URL: "https://media.dreamlyai.com",
    ...overrides
  };
}

function createValidCreativePayload() {
  return {
    topic: "Water and Ocean Dreams",
    slides: [
      {
        role: "cover",
        headline: "What Does It Mean When You Dream of Oceans?",
        subheadline: "Explore the psychological symbolism of deep water in dreams."
      },
      {
        role: "content",
        title: "Calm Waters & Peace",
        body: "Tranquil oceans in dreams may reflect inner emotional clarity and a sense of calm in waking life."
      },
      {
        role: "content",
        title: "Turbulent Waves & Stress",
        body: "High waves and stormy seas can symbolize feeling overwhelmed by recent emotional challenges."
      },
      {
        role: "content",
        title: "Diving into the Depths",
        body: "Exploring underwater realms might suggest readiness to uncover subconscious thoughts and memories."
      },
      {
        role: "cta",
        headline: "Track Your Dreams Tonight",
        body: "Reflect on your nighttime thoughts and journal with DreamlyAI."
      }
    ],
    captions: {
      instagram: "Have you ever dreamed of open water? Water often reflects our emotional state. What was your most memorable water dream? #dreamlyai #dreamsymbols",
      facebook: "Water in dreams often mirrors our emotional landscape. Calm seas may signify clarity, while stormy waters can indicate stress. What have your dreams looked like lately?"
    }
  };
}

class MockS3Client {
  constructor(options = {}) {
    this.sentCommands = [];
    this.shouldFailOnIndex = options.shouldFailOnIndex ?? null;
    this.failureError = options.failureError ?? new Error("Mock S3 PutObject failure");
  }

  async send(command) {
    if (this.shouldFailOnIndex !== null && this.sentCommands.length === this.shouldFailOnIndex) {
      throw this.failureError;
    }
    this.sentCommands.push(command);
    return {
      $metadata: { httpStatusCode: 200 }
    };
  }
}

describe("Cloudflare R2 Storage Layer", () => {
  describe("Configuration & Environment Loading", () => {
    it("1. loadR2Config accepts complete valid injected env", () => {
      const env = createMockEnv();
      const config = loadR2Config(env);

      assert.equal(config.accountId, "mock_account_12345");
      assert.equal(config.accessKeyId, "mock_access_key_abcde");
      assert.equal(config.secretAccessKey, "mock_secret_key_xyz987");
      assert.equal(config.bucketName, "dreamlyai-social-media");
      assert.equal(config.publicBaseUrl, "https://media.dreamlyai.com");
      assert.equal(config.endpoint, "https://mock_account_12345.r2.cloudflarestorage.com");
      assert.equal(config.region, "auto");
    });

    it("2. missing R2_ACCOUNT_ID fails", () => {
      const env = createMockEnv({ R2_ACCOUNT_ID: "" });
      assert.throws(
        () => loadR2Config(env),
        /Missing or empty required environment variable: R2_ACCOUNT_ID/i
      );
    });

    it("3. missing R2_ACCESS_KEY_ID fails", () => {
      const env = createMockEnv({ R2_ACCESS_KEY_ID: "   " });
      assert.throws(
        () => loadR2Config(env),
        /Missing or empty required environment variable: R2_ACCESS_KEY_ID/i
      );
    });

    it("4. missing R2_SECRET_ACCESS_KEY fails", () => {
      const env = createMockEnv();
      delete env.R2_SECRET_ACCESS_KEY;
      assert.throws(
        () => loadR2Config(env),
        /Missing or empty required environment variable: R2_SECRET_ACCESS_KEY/i
      );
    });

    it("5. missing R2_BUCKET_NAME fails", () => {
      const env = createMockEnv({ R2_BUCKET_NAME: "" });
      assert.throws(
        () => loadR2Config(env),
        /Missing or empty required environment variable: R2_BUCKET_NAME/i
      );
    });

    it("6. missing R2_PUBLIC_BASE_URL fails", () => {
      const env = createMockEnv({ R2_PUBLIC_BASE_URL: "" });
      assert.throws(
        () => loadR2Config(env),
        /Missing or empty required environment variable: R2_PUBLIC_BASE_URL/i
      );
    });

    it("7. public base URL must use HTTPS", () => {
      const env = createMockEnv({ R2_PUBLIC_BASE_URL: "http://media.dreamlyai.com" });
      assert.throws(
        () => loadR2Config(env),
        /Invalid R2_PUBLIC_BASE_URL.*HTTPS/i
      );
    });

    it("8. public base URL trailing slash is normalized", () => {
      const env = createMockEnv({ R2_PUBLIC_BASE_URL: "https://media.dreamlyai.com///" });
      const config = loadR2Config(env);
      assert.equal(config.publicBaseUrl, "https://media.dreamlyai.com");
    });
  });

  describe("Deterministic Storage Keys & Public URLs", () => {
    it("9. storage key for 2026-08-28 slide 1 is exactly: social/2026/08/28/slide-01.jpg", () => {
      const key = buildSlideStorageKey("2026-08-28", 1);
      assert.equal(key, "social/2026/08/28/slide-01.jpg");
    });

    it("10. slide 5 key is exactly: social/2026/08/28/slide-05.jpg", () => {
      const key = buildSlideStorageKey("2026-08-28", 5);
      assert.equal(key, "social/2026/08/28/slide-05.jpg");
    });

    it("11. invalid date fails", () => {
      assert.throws(() => buildSlideStorageKey("invalid-date", 1), /Invalid publishDate/i);
      assert.throws(() => buildSlideStorageKey("2026-02-31", 1), /Invalid publishDate/i);
      assert.throws(() => buildSlideStorageKey("", 1), /Invalid publishDate/i);
    });

    it("12. invalid slide index fails", () => {
      assert.throws(() => buildSlideStorageKey("2026-08-28", 0), /Invalid slideIndex/i);
      assert.throws(() => buildSlideStorageKey("2026-08-28", 6), /Invalid slideIndex/i);
      assert.throws(() => buildSlideStorageKey("2026-08-28", 1.5), /Invalid slideIndex/i);
      assert.throws(() => buildSlideStorageKey("2026-08-28", "1"), /Invalid slideIndex/i);
    });
  });

  describe("Mocked S3/R2 Upload & Contract Verification", () => {
    it("13-20. valid rendered carousel causes exactly 5 mocked PutObject sends in order with correct metadata and return structure", async () => {
      const preparedContent = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });

      const renderedCarousel = await renderCarousel(preparedContent);
      const mockClient = new MockS3Client();
      const config = loadR2Config(createMockEnv());

      const result = await uploadRenderedCarousel({
        preparedContent,
        renderedCarousel,
        client: mockClient,
        config
      });

      // 13. exactly 5 PutObject sends
      assert.equal(mockClient.sentCommands.length, 5);

      // 14. PutObject calls happen in slide order 1..5
      // 15. each PutObject uses ContentType image/jpeg
      // 16. each key is deterministic
      // 17. each PutObject contains expected deterministic metadata
      const expectedKeys = [
        "social/2026/08/28/slide-01.jpg",
        "social/2026/08/28/slide-02.jpg",
        "social/2026/08/28/slide-03.jpg",
        "social/2026/08/28/slide-04.jpg",
        "social/2026/08/28/slide-05.jpg"
      ];
      const expectedRoles = ["cover", "content", "content", "content", "cta"];

      for (let i = 0; i < 5; i++) {
        const cmdInput = mockClient.sentCommands[i].input;
        assert.equal(cmdInput.Bucket, "dreamlyai-social-media");
        assert.equal(cmdInput.Key, expectedKeys[i]);
        assert.equal(cmdInput.ContentType, "image/jpeg");
        assert.equal(cmdInput.CacheControl, "public, max-age=31536000");
        assert.equal(Buffer.isBuffer(cmdInput.Body), true);
        assert.deepEqual(cmdInput.Metadata, {
          "content-id": "social-2026-08-28",
          "publish-date": "2026-08-28",
          "slide-index": String(i + 1),
          "slide-role": expectedRoles[i]
        });
      }

      // 18. returned result contains exactly 5 media records
      assert.equal(result.provider, "cloudflare-r2");
      assert.equal(result.slideCount, 5);
      assert.equal(result.media.length, 5);

      // 19. returned URLs are correct
      for (let i = 0; i < 5; i++) {
        const media = result.media[i];
        assert.equal(media.index, i + 1);
        assert.equal(media.role, expectedRoles[i]);
        assert.equal(media.key, expectedKeys[i]);
        assert.equal(media.url, `https://media.dreamlyai.com/${expectedKeys[i]}`);
        assert.equal(media.contentType, "image/jpeg");
        assert.equal(media.width, 1080);
        assert.equal(media.height, 1350);
        assert.equal(typeof media.byteLength, "number");
        assert.equal(media.byteLength > 10000, true);

        // 20. no raw Buffers in final storage result
        assert.equal("buffer" in media, false);
      }
      assert.equal("credentials" in result, false);
      assert.equal("accessKeyId" in result, false);
    });

    it("21. malformed preparedContent results in zero client sends", async () => {
      const preparedContent = {
        schemaVersion: 1,
        publishDate: "2026-08-28",
        contentId: "social-2026-08-28",
        category: "invalid_category",
        slideCount: 5,
        creative: createValidCreativePayload()
      };

      const validPrepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const renderedCarousel = await renderCarousel(validPrepared);
      const mockClient = new MockS3Client();
      const config = loadR2Config(createMockEnv());

      await assert.rejects(
        async () =>
          uploadRenderedCarousel({
            preparedContent,
            renderedCarousel,
            client: mockClient,
            config
          }),
        /Pre-upload validation failed/i
      );

      assert.equal(mockClient.sentCommands.length, 0);
    });

    it("22. malformed carousel results in zero client sends", async () => {
      const validPrepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const mockClient = new MockS3Client();
      const config = loadR2Config(createMockEnv());

      const malformedCarousel = {
        width: 1080,
        height: 1350,
        format: "jpeg",
        slideCount: 4, // wrong count
        slides: []
      };

      await assert.rejects(
        async () =>
          uploadRenderedCarousel({
            preparedContent: validPrepared,
            renderedCarousel: malformedCarousel,
            client: mockClient,
            config
          }),
        /Invalid renderedCarousel slideCount/i
      );

      assert.equal(mockClient.sentCommands.length, 0);
    });

    it("23. malformed single slide results in zero client sends", async () => {
      const validPrepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const renderedCarousel = await renderCarousel(validPrepared);

      // Corrupt slide 3 buffer
      const corruptedCarousel = {
        ...renderedCarousel,
        slides: renderedCarousel.slides.map((s, idx) =>
          idx === 2 ? { ...s, byteLength: 50 } : s
        )
      };

      const mockClient = new MockS3Client();
      const config = loadR2Config(createMockEnv());

      await assert.rejects(
        async () =>
          uploadRenderedCarousel({
            preparedContent: validPrepared,
            renderedCarousel: corruptedCarousel,
            client: mockClient,
            config
          }),
        /Slide byteLength mismatch|Slide buffer too small/i
      );

      assert.equal(mockClient.sentCommands.length, 0);
    });

    it("24. upload failure is propagated and success is not returned", async () => {
      const validPrepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const renderedCarousel = await renderCarousel(validPrepared);

      // Mock failure on 3rd upload
      const mockClient = new MockS3Client({ shouldFailOnIndex: 2 });
      const config = loadR2Config(createMockEnv());

      await assert.rejects(
        async () =>
          uploadRenderedCarousel({
            preparedContent: validPrepared,
            renderedCarousel,
            client: mockClient,
            config
          }),
        /Mock S3 PutObject failure/i
      );

      assert.equal(mockClient.sentCommands.length, 2);
    });

    it("25. same valid input creates the same storage keys/public URLs on repeated runs", async () => {
      const validPrepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative: createValidCreativePayload()
      });
      const renderedCarousel = await renderCarousel(validPrepared);

      const clientA = new MockS3Client();
      const clientB = new MockS3Client();
      const config = loadR2Config(createMockEnv());

      const resA = await uploadRenderedCarousel({
        preparedContent: validPrepared,
        renderedCarousel,
        client: clientA,
        config
      });

      const resB = await uploadRenderedCarousel({
        preparedContent: validPrepared,
        renderedCarousel,
        client: clientB,
        config
      });

      assert.deepEqual(resA, resB);
    });
  });
});
