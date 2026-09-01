const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const socialMediaHandler = require("../api/social-media/[...path]");

const R2_CONFIG = Object.freeze({
  bucketName: "dreamlyai-social",
  accessKeyId: "must-not-be-returned",
  secretAccessKey: "must-not-be-returned"
});

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    }
  };
}

function createClient({ body = Buffer.from([0xff, 0xd8, 0xff]), error } = {}) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command);
      if (error) throw error;
      return { Body: body };
    }
  };
}

function request(path, client, method = "GET") {
  return {
    method,
    url: `/api/social-media/${path}`,
    query: { path: path.split("/") },
    _injectedR2Config: R2_CONFIG,
    _injectedR2Client: client
  };
}

describe("DreamlyAI Vercel R2 media proxy", () => {
  it("serves slide-01 through slide-05 as JPEGs", async () => {
    for (let index = 1; index <= 5; index++) {
      const client = createClient();
      const res = createResponse();

      await socialMediaHandler(
        request(`social/2026/08/28/slide-0${index}.jpg`, client),
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "image/jpeg");
      assert.deepEqual(res.body, Buffer.from([0xff, 0xd8, 0xff]));
      assert.equal(client.calls.length, 1);
      assert.equal(client.calls[0].input.Bucket, "dreamlyai-social");
      assert.equal(client.calls[0].input.Key, `social/2026/08/28/slide-0${index}.jpg`);
    }
  });

  it("rejects invalid paths without accessing R2", async () => {
    for (const path of [
      "social/2026/08/28/slide-00.jpg",
      "social/2026/08/28/slide-06.jpg",
      "social/2026/08/28/other.jpg",
      "other/2026/08/28/slide-01.jpg",
      "social/2026/08/28/slide-01.png",
      "social/2026/08/28/slide-01.jpg/extra"
    ]) {
      const client = createClient();
      const res = createResponse();
      await socialMediaHandler(request(path, client), res);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { success: false, error: "media_not_found" });
      assert.equal(client.calls.length, 0);
    }
  });

  it("rejects plain and encoded traversal attempts", async () => {
    for (const path of [
      "social/2026/08/28/../slide-01.jpg",
      "social/2026/08/%2e%2e/slide-01.jpg",
      "social/2026/08/%2E%2E%2Fslide-01.jpg",
      "social/2026/08/%252e%252e/slide-01.jpg",
      "social/2026/08/28/..%5cslide-01.jpg"
    ]) {
      const client = createClient();
      const res = createResponse();
      await socialMediaHandler(request(path, client), res);
      assert.equal(res.statusCode, 404);
      assert.equal(client.calls.length, 0);
    }
  });

  it("allows no non-GET method", async () => {
    const client = createClient();
    const res = createResponse();
    await socialMediaHandler(request("social/2026/08/28/slide-01.jpg", client, "POST"), res);
    assert.equal(res.statusCode, 405);
    assert.equal(client.calls.length, 0);
  });

  it("returns 404 for a missing R2 object", async () => {
    const client = createClient({ error: { name: "NoSuchKey" } });
    const res = createResponse();
    await socialMediaHandler(request("social/2026/08/28/slide-01.jpg", client), res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, error: "media_not_found" });
  });

  it("does not expose credentials or internal R2 errors", async () => {
    const secret = "r2-secret-must-not-leak";
    const client = createClient({ error: new Error(`R2 failure ${secret}`) });
    const res = createResponse();
    await socialMediaHandler(request("social/2026/08/28/slide-01.jpg", client), res);
    const serialized = JSON.stringify(res.body);
    assert.equal(res.statusCode, 500);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes("R2 failure"), false);
    assert.equal(serialized.includes("accessKeyId"), false);
  });

  it("does not use credentials supplied in the query string", async () => {
    const client = createClient();
    const res = createResponse();
    const req = request("social/2026/08/28/slide-01.jpg", client);
    req.url += "?accessKeyId=query-secret&secretAccessKey=query-secret";
    await socialMediaHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(client.calls[0].input.Key, "social/2026/08/28/slide-01.jpg");
    assert.equal(JSON.stringify(res.body).includes("query-secret"), false);
  });

  it("performs no R2 write operation", async () => {
    const client = createClient();
    const res = createResponse();
    await socialMediaHandler(request("social/2026/08/28/slide-01.jpg", client), res);
    assert.equal(client.calls[0].constructor.name, "GetObjectCommand");
    assert.equal(client.calls[0].input.Body, undefined);
  });
});
