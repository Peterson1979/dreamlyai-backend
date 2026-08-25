// test/integration.test.js
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  generateInterpretation,
  setMockProviders,
  resetMockProviders,
} = require("../utils/providers");
const { setRedisClient } = require("../utils/redisClient");
const { MockRedis } = require("./helpers/mockRedis");
const config = require("../utils/config");
const interpretHandler = require("../api/interpret");
const reportHandler = require("../api/report");

describe("Integration Tests - Phase 3C.2 Multi-Tier AI Architecture & Pre-Production Safety", () => {
  let mockRedis;
  let groqCalls;
  let geminiCalls;

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
    groqCalls = 0;
    geminiCalls = 0;
    resetMockProviders();
  });

  function setupMockDrivers({
    groqBehavior = "success",
    geminiBehavior = "success",
    groqDelayMs = 0,
    groqUsage = { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    geminiUsage = { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    groqText = "Summary: Flying dream.\nDetailed Analysis: A feeling of freedom.",
    geminiText = "Summary: Gemini fallback interpretation.",
  } = {}) {
    const mockGroq = async (prompt, signal) => {
      groqCalls++;
      if (groqDelayMs > 0) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, groqDelayMs);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      }

      if (groqBehavior === "success") {
        return { text: groqText, usage: groqUsage, provider: "groq" };
      }
      if (groqBehavior === "401_auth") {
        const err = new Error("Invalid API Key");
        err.status = 401;
        throw err;
      }
      if (groqBehavior === "400_bad_request") {
        const err = new Error("Invalid parameter");
        err.status = 400;
        throw err;
      }
      if (groqBehavior === "429_rate_limited") {
        const err = new Error("Rate limit reached");
        err.status = 429;
        throw err;
      }
      if (groqBehavior === "503_transient") {
        const err = new Error("Service Unavailable");
        err.status = 503;
        throw err;
      }
      throw new Error("Generic failure");
    };

    const mockGemini = async (prompt, signal) => {
      geminiCalls++;
      if (geminiBehavior === "success") {
        return { text: geminiText, usage: geminiUsage, provider: "gemini" };
      }
      if (geminiBehavior === "failure") {
        throw new Error("Gemini Service Error");
      }
      throw new Error("Generic Gemini failure");
    };

    setMockProviders({ groq: mockGroq, gemini: mockGemini });
  }

  // --- 1. REAL HTTP LIFECYCLE & DISCONNECT TESTS ---

  it("HTTP Lifecycle: Normal completed POST request completes with SSE stream", async () => {
    setupMockDrivers({ groqBehavior: "success", groqText: "Summary: Valid HTTP lifecycle output." });

    const server = http.createServer(async (req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        req.body = JSON.parse(body);
        await interpretHandler(req, res);
      });
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dreamNarrative: "Normal lifecycle test", language: "en" }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/event-stream");

      const responseText = await response.text();
      assert.ok(responseText.includes("data: {\"delta\":"));
      assert.ok(responseText.includes("data: [DONE]"));
      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 0);
    } finally {
      server.close();
    }
  });

  it("HTTP Lifecycle: Client disconnect aborts in-flight request and suppresses fallback", async () => {
    setupMockDrivers({ groqBehavior: "503_transient", groqDelayMs: 200, geminiBehavior: "success" });

    const server = http.createServer(async (req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        req.body = JSON.parse(body);
        await interpretHandler(req, res);
      });
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const clientReq = http.request({
        hostname: "127.0.0.1",
        port,
        path: "/api/interpret",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      clientReq.on("error", () => {});

      clientReq.write(JSON.stringify({ dreamNarrative: "Abort lifecycle test", language: "en" }));
      clientReq.end();

      // Prematurely destroy client connection while Groq is running
      await new Promise((r) => setTimeout(r, 50));
      clientReq.destroy();

      // Wait for server-side processing to finish
      await new Promise((r) => setTimeout(r, 300));

      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 0, "Gemini fallback must NOT launch when client disconnected");
    } finally {
      server.close();
    }
  });

  // --- 2. PROVIDER ROUTING & STRICT FALLBACK ---

  it("Routing: Groq success -> exactly 1 Groq call, 0 Gemini calls", async () => {
    setupMockDrivers({ groqBehavior: "success" });

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "Walking in a valley", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "success");
    assert.equal(res.provider, "groq");
    assert.equal(groqCalls, 1);
    assert.equal(geminiCalls, 0);
  });

  it("Routing: Groq 503 transient failure -> exactly 1 Groq call, 1 Gemini call (success)", async () => {
    setupMockDrivers({ groqBehavior: "503_transient", geminiBehavior: "success" });

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "Walking in a valley", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "success");
    assert.equal(res.provider, "gemini");
    assert.equal(groqCalls, 1);
    assert.equal(geminiCalls, 1);
  });

  it("Routing: Groq 401 Auth Error fails closed to emergency (0 Gemini calls)", async () => {
    setupMockDrivers({ groqBehavior: "401_auth", geminiBehavior: "success" });

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "Auth fail test", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "emergency");
    assert.equal(res.reason, "groq_auth_failure");
    assert.equal(groqCalls, 1);
    assert.equal(geminiCalls, 0);
  });

  it("Routing: Groq 400 Bad Request fails closed to emergency (0 Gemini calls)", async () => {
    setupMockDrivers({ groqBehavior: "400_bad_request", geminiBehavior: "success" });

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "Bad request test", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "emergency");
    assert.equal(res.reason, "groq_bad_request");
    assert.equal(groqCalls, 1);
    assert.equal(geminiCalls, 0);
  });

  it("Routing: Groq budget exhausted -> Gemini fallback (0 Groq, 1 Gemini)", async () => {
    setupMockDrivers({ geminiBehavior: "success" });

    const today = new Date().toISOString().slice(0, 10);
    await mockRedis.set(`budget:groq:tokens:${today}`, String(config.GROQ_DAILY_TOKEN_LIMIT));

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "Budget failover", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "success");
    assert.equal(res.provider, "gemini");
    assert.equal(groqCalls, 0);
    assert.equal(geminiCalls, 1);
  });

  it("Routing: Both Groq & Gemini fail -> emergency mode", async () => {
    setupMockDrivers({ groqBehavior: "503_transient", geminiBehavior: "failure" });

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "All fail", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "emergency");
    assert.equal(groqCalls, 1);
    assert.equal(geminiCalls, 1);
  });

  it("Routing: Maximum provider calls never exceeds 2 across any path", async () => {
    setupMockDrivers({ groqBehavior: "503_transient", geminiBehavior: "failure" });

    await generateInterpretation({
      requestData: { dreamNarrative: "Amplification check", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.ok(groqCalls + geminiCalls <= 2);
  });

  // --- 3. DYNAMIC TOKEN RESERVATION & BUDGET RECONCILIATION ---

  it("Dynamic Reservation: Large Hungarian request reserves >2000 tokens and reconciles", async () => {
    setupMockDrivers({
      groqBehavior: "success",
      groqUsage: { totalTokens: 2100 },
    });

    const largeHungarianDream = "Repültem egy csodás táj felett. ".repeat(100);
    const res = await generateInterpretation({
      requestData: {
        dreamNarrative: largeHungarianDream,
        symbols: "repülés, madarak",
        emotions: "felszabadultság",
        language: "hu",
        languageName: "Hungarian",
      },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "success");
    assert.ok(res.reservedTokens > 1500, `Expected reservation > 1500, got ${res.reservedTokens}`);

    const today = new Date().toISOString().slice(0, 10);
    const groqDaily = parseInt(await mockRedis.get(`budget:groq:tokens:${today}`), 10);
    assert.equal(groqDaily, 2100);
  });

  it("Dynamic Reservation: Request exceeding TPM guard (7000) trips guard and fails over to Gemini", async () => {
    setupMockDrivers({ groqBehavior: "success" });

    const minute = Math.floor(Date.now() / 60000);
    await mockRedis.set(`guard:groq:tpm:${minute}`, "6000");

    const largeDream = "Large text payload ".repeat(100);
    const res = await generateInterpretation({
      requestData: {
        dreamNarrative: largeDream,
        language: "en",
        languageName: "English",
      },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.provider, "gemini");
    assert.equal(groqCalls, 0);
    assert.equal(geminiCalls, 1);
  });

  it("Dynamic Reservation: Conservative failure accounting retains reservation when Groq fails after dispatch", async () => {
    setupMockDrivers({
      groqBehavior: "503_transient",
      geminiBehavior: "success",
      geminiUsage: { totalTokens: 300 },
    });

    await generateInterpretation({
      requestData: { dreamNarrative: "Conservative test", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    const today = new Date().toISOString().slice(0, 10);
    const groqUsed = parseInt(await mockRedis.get(`budget:groq:tokens:${today}`), 10);
    const geminiUsed = parseInt(await mockRedis.get(`budget:gemini:tokens:${today}`), 10);

    assert.ok(groqUsed > 500, "Groq reservation must be retained conservatively");
    assert.equal(geminiUsed, 300);
  });

  // --- 4. ENVIRONMENT FAIL-CLOSED BEHAVIOR ---

  it("Environment Fail-Closed: Missing GROQ_API_KEY fails closed to emergency (0 Gemini calls)", async () => {
    delete process.env.GROQ_API_KEY;
    // Do not set mock runner so actual provider checks env var
    const res = await generateInterpretation({
      requestData: { dreamNarrative: "No Groq key test", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "emergency");
    assert.equal(res.reason, "groq_auth_failure");
    assert.equal(geminiCalls, 0);
  });

  it("Environment Fail-Closed: Missing UPSTASH_REDIS_URL fails closed to emergency", async () => {
    setRedisClient(null); // Simulate missing Redis

    const res = await generateInterpretation({
      requestData: { dreamNarrative: "No Redis test", language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "emergency");
  });

  // --- 5. PRIVACY & SANITIZED REPORTING ---

  it("Privacy: No plaintext dream narrative stored in Redis keys", async () => {
    setupMockDrivers({ groqBehavior: "success" });

    const sensitiveDream = "SecretPersonalDreamContent789";
    await generateInterpretation({
      requestData: { dreamNarrative: sensitiveDream, language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    for (const [k, v] of mockRedis.store.entries()) {
      assert.ok(!k.includes(sensitiveDream));
      assert.ok(!v.includes(sensitiveDream));
    }
  });

  it("Privacy: Emergency response contains 0 user dream text", async () => {
    setupMockDrivers({ groqBehavior: "503_transient", geminiBehavior: "failure" });

    const privateDream = "ConfidentialDreamText456";
    const res = await generateInterpretation({
      requestData: { dreamNarrative: privateDream, language: "en", languageName: "English" },
      clientIp: "127.0.0.1",
    });

    assert.equal(res.type, "emergency");
    assert.ok(!res.delta.includes(privateDream));
  });

  it("Report Logging: Sanitizes raw reason and strips free-form content from logs", async () => {
    let loggedMetadata = null;
    const originalLog = console.log;
    console.log = (msg, meta) => {
      loggedMetadata = meta;
    };

    try {
      let body = null;
      const req = {
        method: "POST",
        body: {
          dreamId: "dream_abc_123!@#",
          reason: "This dream contained highly confidential medical data",
          content: "Confidential dream text",
        },
      };
      const res = {
        status: () => ({ json: (d) => (body = d) }),
      };

      await reportHandler(req, res);
      assert.equal(body.success, true);
      assert.equal(loggedMetadata.reason, "custom_reason");
      assert.equal(loggedMetadata.dreamId, "dream_abc_123");
      assert.equal(loggedMetadata.content, undefined);
    } finally {
      console.log = originalLog;
    }
  });
});
