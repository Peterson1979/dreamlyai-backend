/**
 * Dreamly AI Video Social Run Endpoint Tests (/api/video-run)
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const videoRunHandler = require("../api/video-run");

function createMockReqRes({
  method = "POST",
  headers = {},
  body = {},
  query = {},
  injectedRedis = null,
  injectedAdapters = null
} = {}) {
  const req = {
    method,
    headers,
    body,
    query,
    _injectedRedis: injectedRedis,
    _injectedAdapters: injectedAdapters
  };

  let statusCode = 200;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getJSON() {
      return jsonResponse;
    }
  };

  return { req, res };
}

describe("Video Social Run HTTP Endpoint (/api/video-run)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("1. Rejects disallowed HTTP methods with 405", async () => {
    process.env.CRON_SECRET = "test_cron_secret_123";
    const { req, res } = createMockReqRes({
      method: "PUT",
      headers: { authorization: "Bearer test_cron_secret_123" }
    });

    await videoRunHandler(req, res);
    assert.equal(res.getStatusCode(), 405);
    assert.equal(res.getJSON().success, false);
  });

  it("2. Fails closed with 401 when CRON_SECRET is unconfigured or Authorization header is invalid", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.TOKEN_STATUS_SECRET;

    const { req: req1, res: res1 } = createMockReqRes({
      headers: { authorization: "Bearer any_token" }
    });
    await videoRunHandler(req1, res1);
    assert.equal(res1.getStatusCode(), 401);

    process.env.CRON_SECRET = "correct_secret_999";

    const { req: req2, res: res2 } = createMockReqRes({
      headers: { authorization: "Bearer wrong_secret" }
    });
    await videoRunHandler(req2, res2);
    assert.equal(res2.getStatusCode(), 401);

    const { req: req3, res: res3 } = createMockReqRes({
      headers: {}
    });
    await videoRunHandler(req3, res3);
    assert.equal(res3.getStatusCode(), 401);
  });

  it("3. Successfully executes dry-run with valid CRON_SECRET authorization", async () => {
    process.env.CRON_SECRET = "super_secret_cron_token";

    const { req, res } = createMockReqRes({
      method: "POST",
      headers: { authorization: "Bearer super_secret_cron_token" },
      query: { dryRun: "true", date: "2026-09-28" }
    });

    await videoRunHandler(req, res);
    assert.equal(res.getStatusCode(), 200);
    const body = res.getJSON();
    assert.equal(body.success, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.publishDate, "2026-09-28");
    assert.equal(body.sequenceNumber, 1);
    assert.equal(body.videoFileName, "1.mp4");
  });

  it("4. Rejects invalid date format with 400", async () => {
    process.env.CRON_SECRET = "super_secret_cron_token";

    const { req, res } = createMockReqRes({
      method: "POST",
      headers: { authorization: "Bearer super_secret_cron_token" },
      query: { date: "invalid-date-format" }
    });

    await videoRunHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });
});
