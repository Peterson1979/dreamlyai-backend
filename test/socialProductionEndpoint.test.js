// test/socialProductionEndpoint.test.js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const socialRunHandler = require("../api/social-run");
const { getUtcPublishDate, verifyCronAuthorization } = require("../api/social-run");
const { MockRedis } = require("./helpers/mockRedis");
const { setRedisClient, resetRedisClient } = require("../utils/redisClient");
const { setMockProviders, resetMockProviders } = require("../utils/providers");
const { DAILY_RUN_STATUS } = require("../social/dailyRun");

function createValidCreativeFixture() {
  return {
    topic: "Water and Ocean Dreams",
    slides: [
      {
        role: "cover",
        headline: "What Does Water in Your Dreams Mean?",
        subheadline: "Explore what vast oceans and calm rivers might reflect about waking life."
      },
      {
        role: "content",
        title: "Emotional Reflection",
        body: "Water often serves as a metaphor for deep feelings, representing periods of calm or turbulence."
      },
      {
        role: "content",
        title: "Clarity and Depth",
        body: "Clear water can symbolize mental clarity, while murky water may suggest unresolved thoughts."
      },
      {
        role: "content",
        title: "Flow and Adaptation",
        body: "Rushing rivers could reflect how you navigate life transitions and current challenges."
      },
      {
        role: "cta",
        headline: "Reflect on Your Dreams",
        body: "Track dream themes and deepen self-awareness using DreamlyAI today."
      }
    ],
    captions: {
      instagram: "Have you noticed water appearing in your dreams lately? #dreamlyai #dreams #sleepscience",
      facebook: "Water in dreams often mirrors our emotional state and inner thoughts."
    }
  };
}

class MockS3Client {
  constructor() {
    this.sentCommands = [];
  }

  async send(command) {
    this.sentCommands.push(command);
    return { $metadata: { httpStatusCode: 200 } };
  }
}

function createMockR2Config() {
  return {
    accountId: "mock-account-id-12345",
    accessKeyId: "mock-access-key-id",
    secretAccessKey: "mock-secret-access-key",
    bucketName: "dreamlyai-social",
    publicBaseUrl: "https://media.dreamlyai.com",
    endpoint: "https://mock-account-id-12345.r2.cloudflarestorage.com",
    region: "auto"
  };
}

function createMockFacebookConfig() {
  return {
    pageId: "100123456789",
    pageAccessToken: "EAAX_MOCK_PAGE_TOKEN_SECRET_FB_12345",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockInstagramConfig() {
  return {
    pageId: "100123456789",
    pageAccessToken: "EAAX_MOCK_PAGE_TOKEN_SECRET_IG_12345",
    instagramBusinessAccountId: "200987654321",
    graphApiVersion: "v25.0",
    graphBaseUrl: "https://graph.facebook.com/v25.0"
  };
}

function createMockFetch() {
  let fbPhotoCount = 0;
  let igChildCount = 0;

  return async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || "GET";

    if (urlStr.includes("graph.facebook.com/v25.0/me") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789", name: "DreamlyAI Official" })
      };
    }

    if (urlStr.includes("/100123456789/photos") && method === "POST") {
      fbPhotoCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `fb_photo_${fbPhotoCount}` })
      };
    }

    if (urlStr.includes("/100123456789/feed") && method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "100123456789_post98765" })
      };
    }

    if (urlStr.includes("/100123456789?fields=id,name,instagram_business_account") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "100123456789",
          name: "DreamlyAI",
          instagram_business_account: { id: "200987654321" }
        })
      };
    }

    if (urlStr.includes("/200987654321/media_publish") && method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "ig_media_post_777888999" })
      };
    }

    if (urlStr.endsWith("/200987654321/media") && method === "POST") {
      const params = new URLSearchParams(options.body || "");
      if (params.get("media_type") === "CAROUSEL") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "ig_parent_container_123" })
        };
      }
      igChildCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `ig_child_${igChildCount}` })
      };
    }

    if (urlStr.includes("?fields=status_code,status") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status_code: "FINISHED", status: "Ready" })
      };
    }

    throw new Error(`Unhandled mock fetch request to URL: ${urlStr}`);
  };
}

function createMockReqRes({
  method = "POST",
  headers = {},
  body = {},
  query = {},
  injected = {}
} = {}) {
  const req = {
    method,
    headers: { ...headers },
    body,
    query,
    ...injected
  };

  const res = {
    statusCode: 200,
    headersSent: false,
    _headers: {},
    _json: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, val) {
      this._headers[name.toLowerCase()] = val;
      return this;
    },
    json(data) {
      this._json = data;
      return this;
    }
  };

  return { req, res };
}

describe("DreamlyAI Social Production HTTP Endpoint", () => {
  const TEST_CRON_SECRET = "test-super-secret-cron-token-xyz-123456";
  let mockRedis;
  let mockR2Client;
  let mockR2Config;
  let mockFbConfig;
  let mockIgConfig;
  let mockFetch;
  let mockGenerator;
  let origEnv;

  beforeEach(() => {
    origEnv = { ...process.env };
    process.env.CRON_SECRET = TEST_CRON_SECRET;

    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
    mockR2Client = new MockS3Client();
    mockR2Config = createMockR2Config();
    mockFbConfig = createMockFacebookConfig();
    mockIgConfig = createMockInstagramConfig();
    mockFetch = createMockFetch();
    mockGenerator = async () => JSON.stringify(createValidCreativeFixture());
    resetMockProviders();
  });

  afterEach(() => {
    process.env = origEnv;
    resetMockProviders();
    resetRedisClient();
  });

  function getValidInjections() {
    return {
      _injectedRedis: mockRedis,
      _injectedGenerateText: mockGenerator,
      _injectedR2Client: mockR2Client,
      _injectedR2Config: mockR2Config,
      _injectedFetchImpl: mockFetch,
      _injectedFacebookConfig: mockFbConfig,
      _injectedInstagramConfig: mockIgConfig,
      _injectedSleepImpl: async () => {}
    };
  }

  describe("HTTP Method Restriction", () => {
    it("1. GET request is rejected with 405 Method Not Allowed", async () => {
      const { req, res } = createMockReqRes({
        method: "GET",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` }
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 405);
      assert.equal(res._json.success, false);
      assert.equal(res._json.error.includes("Only POST is accepted"), true);
    });

    it("2. Other unsupported HTTP methods (PUT, DELETE, PATCH) are rejected with 405", async () => {
      for (const badMethod of ["PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]) {
        const { req, res } = createMockReqRes({
          method: badMethod,
          headers: { authorization: `Bearer ${TEST_CRON_SECRET}` }
        });

        await socialRunHandler(req, res);

        assert.equal(res.statusCode, 405);
        assert.equal(res._json.success, false);
      }
    });
  });

  describe("Authentication & Authorization", () => {
    it("3. Missing Authorization header is rejected with 401", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: {}
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res._json.success, false);
      assert.equal(res._json.error.includes("Missing Authorization header"), true);
    });

    it("4. Invalid Authorization token is rejected with 401", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: "Bearer invalid-wrong-token-999" }
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res._json.success, false);
    });

    it("5. Unconfigured CRON_SECRET in environment fails closed with 401", async () => {
      delete process.env.CRON_SECRET;

      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: "Bearer anything" }
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res._json.success, false);
      assert.equal(res._json.error.includes("CRON_SECRET is not configured"), true);
    });

    it("6. Secret in query parameter is rejected (not accepted as authentication)", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        query: { secret: TEST_CRON_SECRET, cron_secret: TEST_CRON_SECRET },
        headers: {} // No Authorization header
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res._json.success, false);
    });
  });

  describe("Date Handling & Execution", () => {
    it("7. Valid POST with default date derivation executes pipeline for current UTC date", async () => {
      const expectedUtcDate = new Date().toISOString().slice(0, 10);

      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        body: {},
        injected: getValidInjections()
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res._json.success, true);
      assert.equal(res._json.status, DAILY_RUN_STATUS.COMPLETED);
      assert.equal(res._json.publishDate, expectedUtcDate);
      assert.equal(res._json.contentId, `social-${expectedUtcDate}`);
      assert.equal(res._json.preparation.status, "PREPARED");
      assert.equal(res._json.publishing.facebook.status, "PUBLISHED");
      assert.equal(res._json.publishing.instagram.status, "PUBLISHED");
    });

    it("8. Valid POST with explicit publishDate in request body executes for that date", async () => {
      const customDate = "2026-10-31";
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        body: { publishDate: customDate },
        injected: getValidInjections()
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res._json.success, true);
      assert.equal(res._json.publishDate, customDate);
      assert.equal(res._json.contentId, `social-${customDate}`);
    });

    it("9. Invalid publishDate in body returns 400 Bad Request", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        body: { publishDate: "bad-date-format" },
        injected: getValidInjections()
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res._json.success, false);
      assert.equal(res._json.error.includes("Invalid publishDate in request body"), true);
    });
  });

  describe("Security, Sanitization & Boundaries", () => {
    it("10. Secret never appears in response body, headers, or JSON", async () => {
      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        injected: getValidInjections()
      });

      await socialRunHandler(req, res);

      const resStr = JSON.stringify(res._json);
      assert.equal(resStr.includes(TEST_CRON_SECRET), false);
      assert.equal(resStr.includes("EAAX_MOCK_PAGE_TOKEN"), false);
      assert.equal(resStr.includes("mock-secret-access-key"), false);
    });

    it("11. Pipeline failure returns clean sanitized result with 200 status", async () => {
      // Simulate storage upload failure in pipeline
      mockR2Client.send = async () => {
        throw new Error("S3 mock storage network timeout");
      };

      const { req, res } = createMockReqRes({
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        body: { publishDate: "2026-08-28" },
        injected: getValidInjections()
      });

      await socialRunHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res._json.success, false);
      assert.equal(res._json.status, "PREPARATION_FAILED");
      assert.equal(res._json.preparation.status, "FAILED");
      assert.equal(res._json.publishing.facebook.status, "SKIPPED");
      assert.equal(res._json.publishing.instagram.status, "SKIPPED");
    });

    it("12. Unexpected exception in handler returns sanitized 500 without stack trace", async () => {
      // Create a corrupted req object that causes JSON serialization / execution to throw in handler
      const throwingReq = {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        get body() {
          throw new Error("Corrupted stream failure with secret sk-sensitive-internal-token-999");
        }
      };
      const res = {
        statusCode: 200,
        _json: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this._json = data;
          return this;
        }
      };

      const logged = [];
      const originalConsoleError = console.error;
      console.error = (...args) => logged.push(args.join(" "));
      try {
        await socialRunHandler(throwingReq, res);
      } finally {
        console.error = originalConsoleError;
      }

      assert.equal(res.statusCode, 500);
      assert.equal(res._json.success, false);
      assert.equal(res._json.status, "SERVER_ERROR");
      const resStr = JSON.stringify(res._json);
      assert.equal(resStr.includes("sk-sensitive-internal-token-999"), false);
      assert.equal(logged.join(" ").includes("sk-sensitive-internal-token-999"), false);
      assert.equal(logged.join(" ").includes("Corrupted stream failure"), false);
    });

    it("13. vercel.json exists and defines exactly one cron job for /api/social-run", () => {
      const vercelConfigPath = path.resolve(__dirname, "../vercel.json");
      assert.equal(fs.existsSync(vercelConfigPath), true);

      const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
      assert.equal(Array.isArray(vercelConfig.crons), true);
      assert.equal(vercelConfig.crons.length, 1);
      assert.equal(vercelConfig.crons[0].path, "/api/social-run");
      assert.equal(vercelConfig.crons[0].schedule, "0 7 * * *");
    });

    it("14. getUtcPublishDate helper produces valid YYYY-MM-DD", () => {
      const utcDate = getUtcPublishDate();
      assert.match(utcDate, /^\d{4}-\d{2}-\d{2}$/);
    });

    it("15. verifyCronAuthorization accepts valid authorization header format", () => {
      const validReq = { headers: { authorization: `Bearer ${TEST_CRON_SECRET}` } };
      assert.equal(verifyCronAuthorization(validReq).ok, true);

      const invalidReq = { headers: { authorization: "Bearer wrong-token" } };
      assert.equal(verifyCronAuthorization(invalidReq).ok, false);
    });
  });
});
