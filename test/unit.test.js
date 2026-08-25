// test/unit.test.js
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateInterpretationRequest,
  normalizeLanguageCode,
  SUPPORTED_LANGUAGES,
} = require("../utils/validation");
const { buildInterpretationPrompt } = require("../utils/prompt");
const {
  estimateConservativeTokens,
  calculateRequestReservation,
} = require("../utils/tokenEstimator");
const { buildEmergencyPayload, getEmergencyReflectionText } = require("../utils/emergency");
const { computeRequestHash, acquireInFlightLock } = require("../utils/idempotency");
const { checkRateLimit, hashIp } = require("../utils/rateLimiter");
const {
  reserveTokens,
  reconcileReservation,
  refundReservation,
  getBudgetStatus,
} = require("../utils/budget");
const { setRedisClient } = require("../utils/redisClient");
const { MockRedis } = require("./helpers/mockRedis");
const config = require("../utils/config");
const tokenStatusHandler = require("../api/token-status");

describe("Unit Tests - DreamlyAI Backend Phase 3C.2", () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
    delete process.env.TOKEN_STATUS_SECRET;
  });

  describe("1. Validation & Boundary Controls", () => {
    it("boundary test: 2999 characters dream narrative is accepted", () => {
      const res = validateInterpretationRequest({
        dreamNarrative: "A".repeat(2999),
        language: "en",
      });
      assert.equal(res.isValid, true);
    });

    it("boundary test: 3000 characters dream narrative is accepted", () => {
      const res = validateInterpretationRequest({
        dreamNarrative: "A".repeat(3000),
        language: "en",
      });
      assert.equal(res.isValid, true);
    });

    it("boundary test: 3001 characters dream narrative is rejected with dream_too_long", () => {
      const res = validateInterpretationRequest({
        dreamNarrative: "A".repeat(3001),
        language: "en",
      });
      assert.equal(res.isValid, false);
      assert.equal(res.error, "dream_too_long");
    });

    it("boundary test: symbols up to 500 chars accepted, 501 rejected", () => {
      assert.equal(
        validateInterpretationRequest({ dreamNarrative: "Valid", symbols: "S".repeat(500) }).isValid,
        true
      );
      assert.equal(
        validateInterpretationRequest({ dreamNarrative: "Valid", symbols: "S".repeat(501) }).isValid,
        false
      );
    });

    it("boundary test: emotions up to 500 chars accepted, 501 rejected", () => {
      assert.equal(
        validateInterpretationRequest({ dreamNarrative: "Valid", emotions: "E".repeat(500) }).isValid,
        true
      );
      assert.equal(
        validateInterpretationRequest({ dreamNarrative: "Valid", emotions: "E".repeat(501) }).isValid,
        false
      );
    });

    it("rejects non-object or array payloads", () => {
      assert.equal(validateInterpretationRequest(null).isValid, false);
      assert.equal(validateInterpretationRequest("string").isValid, false);
      assert.equal(validateInterpretationRequest([]).isValid, false);
    });

    it("rejects missing or empty dream narrative", () => {
      assert.equal(validateInterpretationRequest({ dreamNarrative: "" }).isValid, false);
      assert.equal(validateInterpretationRequest({ dreamNarrative: "   " }).isValid, false);
      assert.equal(validateInterpretationRequest({}).isValid, false);
    });

    it("accepts all 32 supported languages verified from Android client", () => {
      const allCodes = Object.keys(SUPPORTED_LANGUAGES);
      assert.equal(allCodes.length, 32);

      for (const code of allCodes) {
        const res = validateInterpretationRequest({
          dreamNarrative: "Valid dream text",
          language: code,
        });
        assert.equal(res.isValid, true, `Language code '${code}' must be accepted`);
        assert.equal(res.sanitized.language, code);
      }
    });

    it("normalizes BCP-47 and Android regional aliases (pt-BR, zh-CN, bn-IN, en-US, in, etc.)", () => {
      const aliases = [
        { input: "pt-BR", expected: "pt" },
        { input: "pt_br", expected: "pt" },
        { input: "pt-rBR", expected: "pt" },
        { input: "zh-CN", expected: "zh" },
        { input: "zh-TW", expected: "zh" },
        { input: "bn-IN", expected: "bn" },
        { input: "bn-rIN", expected: "bn" },
        { input: "en-US", expected: "en" },
        { input: "es-MX", expected: "es" },
        { input: "fr-CA", expected: "fr" },
        { input: "de-AT", expected: "de" },
        { input: "in", expected: "id" }, // Android legacy Indonesian code
      ];

      for (const { input, expected } of aliases) {
        const normalized = normalizeLanguageCode(input);
        assert.equal(normalized, expected, `Alias '${input}' must normalize to '${expected}'`);

        const res = validateInterpretationRequest({
          dreamNarrative: "Valid dream",
          language: input,
        });
        assert.equal(res.isValid, true);
        assert.equal(res.sanitized.language, expected);
      }
    });

    it("rejects unsupported language codes", () => {
      const res = validateInterpretationRequest({
        dreamNarrative: "I saw a tree",
        language: "klingon_xyz",
      });
      assert.equal(res.isValid, false);
      assert.equal(res.error, "unsupported_language");
    });
  });

  describe("2. Token Estimator & Dynamic Reservation", () => {
    it("short input does not reserve the old fixed 700 tokens", () => {
      const shortPrompt = "Dream: Flying over a lake.";
      const groqReserve = calculateRequestReservation("groq", shortPrompt, "en");
      assert.ok(groqReserve < 650);
      assert.notEqual(groqReserve, 700);
    });

    it("maximum 3000-char Hungarian dream calculates safe conservative upper bound", () => {
      const maxDream = "Á".repeat(3000);
      const prompt = buildInterpretationPrompt({
        dreamNarrative: maxDream,
        symbols: "felhő",
        emotions: "öröm",
        languageName: "Hungarian",
      });

      const groqReserve = calculateRequestReservation("groq", prompt, "hu");
      assert.ok(groqReserve > 2500, `Expected reservation > 2500, got ${groqReserve}`);
    });

    it("CJK, Arabic, Indic, Cyrillic, and Emojis are calculated with conservative multipliers", () => {
      const cjk = estimateConservativeTokens("我梦见了龙 🐉", "zh");
      const arabic = estimateConservativeTokens("حلمت بالطيران 🌙", "ar");
      const cyrillic = estimateConservativeTokens("Мне снился полет ✨", "ru");
      const indic = estimateConservativeTokens("मैंने एक सपना देखा 🌸", "hi");

      assert.ok(cjk > 10);
      assert.ok(arabic > 10);
      assert.ok(cyrillic > 10);
      assert.ok(indic > 10);
    });
  });

  describe("3. Prompt Construction", () => {
    it("builds concise single prompt with 150-180 word target, section budgets, and non-repetition rules", () => {
      const prompt = buildInterpretationPrompt({
        dreamNarrative: "Walking in a pine forest.",
        symbols: "trees, wind",
        emotions: "peace",
        languageName: "German",
      });

      assert.ok(prompt.includes("Respond entirely in German."));
      assert.ok(prompt.includes("Target a total length of 150-180 words."));
      assert.ok(prompt.includes("1. Summary (20-25 words"));
      assert.ok(prompt.includes("2. Detailed Analysis (40-50 words"));
      assert.ok(prompt.includes("3. Symbols (20-25 words"));
      assert.ok(prompt.includes("4. Emotions (15-20 words"));
      assert.ok(prompt.includes("5. Event Sequence (15-20 words"));
      assert.ok(prompt.includes("6. Possible Meaning (30-40 words"));
      assert.ok(prompt.includes("Do not repeat interpretations across sections"));
      assert.ok(prompt.includes("natural headings translated into German"));
      assert.ok(prompt.includes("Dream: Walking in a pine forest."));
      assert.ok(prompt.includes("Symbols: trees, wind"));
      assert.ok(prompt.includes("Emotions: peace"));
    });
  });

  describe("4. Emergency Mode & Localization", () => {
    it("returns zero-token deterministic reflection payload", () => {
      const emergency = buildEmergencyPayload({
        reason: "budget_exhausted",
        language: "en",
      });

      assert.equal(emergency.type, "emergency");
      assert.equal(emergency.mode, "reflection_common_dreams");
      assert.equal(emergency.provider, "emergency");
      assert.equal(emergency.reason, "budget_exhausted");
      assert.ok(emergency.delta.includes("AI interpretation is temporarily unavailable."));
    });

    it("provides localized Hungarian reflection text", () => {
      const text = getEmergencyReflectionText("hu");
      assert.ok(text.includes("Az AI álomértelmezés jelenleg átmenetileg nem elérhető."));
    });

    it("provides localized German reflection text", () => {
      const text = getEmergencyReflectionText("de");
      assert.ok(text.includes("Die KI-Traumdeutung ist vorübergehend nicht verfügbar."));
    });

    it("provides localized French reflection text", () => {
      const text = getEmergencyReflectionText("fr");
      assert.ok(text.includes("L'interprétation des rêves par IA est temporairement indisponible."));
    });

    it("provides localized Spanish reflection text", () => {
      const text = getEmergencyReflectionText("es");
      assert.ok(text.includes("La interpretación de sueños con IA no está disponible temporalmente."));
    });
  });

  describe("5. Idempotency & In-Flight Lock", () => {
    it("acquires lock and blocks duplicate in-flight requests", async () => {
      const reqData = { dreamNarrative: "Moon flight", language: "en" };
      const lock1 = await acquireInFlightLock(reqData);
      assert.equal(lock1.acquired, true);

      const lock2 = await acquireInFlightLock(reqData);
      assert.equal(lock2.acquired, false);

      await lock1.release();

      const lock3 = await acquireInFlightLock(reqData);
      assert.equal(lock3.acquired, true);
      await lock3.release();
    });

    it("owner token safety: old expired owner cannot delete a newer owner's lock", async () => {
      const reqData = { dreamNarrative: "Owner collision check", language: "en" };
      const lock1 = await acquireInFlightLock(reqData);
      assert.equal(lock1.acquired, true);

      // Simulate lock1 expiring and request 2 acquiring with a new owner token
      const hash = computeRequestHash(reqData);
      const lockKey = `lock:req:${hash}`;
      await mockRedis.set(lockKey, "NEW_OWNER_UUID_777");

      // Old request 1 attempts to release
      await lock1.release();

      // Verify newer lock is preserved
      const stored = await mockRedis.get(lockKey);
      assert.equal(stored, "NEW_OWNER_UUID_777");
    });
  });

  describe("6. Rate Limiting", () => {
    it("allows requests within per-IP limit", async () => {
      const ip = "192.168.1.10";
      const check = await checkRateLimit(ip);
      assert.equal(check.allowed, true);
    });

    it("enforces per-IP limit when ceiling is hit", async () => {
      const ip = "10.0.0.99";
      for (let i = 0; i < config.AI_PER_IP_RPM_LIMIT; i++) {
        const res = await checkRateLimit(ip);
        assert.equal(res.allowed, true);
      }

      const blocked = await checkRateLimit(ip);
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.reason, "IP_RATE_LIMIT_EXCEEDED");
    });
  });

  describe("7. Budget & Token Reservation", () => {
    it("reserves tokens dynamically and records in daily and total counters", async () => {
      const res = await reserveTokens("groq", 1200);
      assert.equal(res.allowed, true);

      const status = await getBudgetStatus();
      assert.equal(status.groq.usedTokens, 1200);
      assert.equal(status.total.usedTokens, 1200);
    });

    it("reconciles actual token usage after completion", async () => {
      await reserveTokens("groq", 1200);
      await reconcileReservation("groq", 1200, 450);

      const status = await getBudgetStatus();
      assert.equal(status.groq.usedTokens, 450);
      assert.equal(status.total.usedTokens, 450);
    });

    it("refunds reservation when cancelled before dispatch", async () => {
      await reserveTokens("groq", 800);
      await refundReservation("groq", 800);

      const status = await getBudgetStatus();
      assert.equal(status.groq.usedTokens, 0);
      assert.equal(status.total.usedTokens, 0);
    });

    it("blocks reservation when Groq daily limit is reached", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await mockRedis.set(`budget:groq:tokens:${today}`, String(config.GROQ_DAILY_TOKEN_LIMIT));

      const res = await reserveTokens("groq", 500);
      assert.equal(res.allowed, false);
      assert.equal(res.reason, "GROQ_DAILY_BUDGET_EXCEEDED");
    });

    it("blocks reservation when Total daily limit is reached", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await mockRedis.set(`budget:total:tokens:${today}`, String(config.AI_TOTAL_DAILY_TOKEN_LIMIT));

      const res = await reserveTokens("groq", 500);
      assert.equal(res.allowed, false);
      assert.equal(res.reason, "TOTAL_DAILY_BUDGET_EXCEEDED");
    });
  });

  describe("8. Token Status Auth Fail-Closed", () => {
    it("fails closed with 401 when TOKEN_STATUS_SECRET is not configured", async () => {
      delete process.env.TOKEN_STATUS_SECRET;

      let status = 0;
      let body = null;
      const req = { method: "GET", headers: {} };
      const res = {
        status: (code) => {
          status = code;
          return { json: (d) => (body = d) };
        },
      };

      await tokenStatusHandler(req, res);
      assert.equal(status, 401);
      assert.equal(body.error, "unauthorized");
    });

    it("fails closed with 401 when TOKEN_STATUS_SECRET is empty string", async () => {
      process.env.TOKEN_STATUS_SECRET = "   ";

      let status = 0;
      const req = { method: "GET", headers: { authorization: "Bearer " } };
      const res = {
        status: (code) => {
          status = code;
          return { json: () => {} };
        },
      };

      await tokenStatusHandler(req, res);
      assert.equal(status, 401);
    });

    it("succeeds with 200 when valid Bearer token matches configured secret", async () => {
      process.env.TOKEN_STATUS_SECRET = "production_admin_secret_456";

      let status = 0;
      let body = null;
      const req = {
        method: "GET",
        headers: { authorization: "Bearer production_admin_secret_456" },
      };
      const res = {
        status: (code) => {
          status = code;
          return { json: (d) => (body = d) };
        },
      };

      await tokenStatusHandler(req, res);
      assert.equal(status, 200);
      assert.ok(body.groq);
      assert.ok(body.gemini);
      assert.ok(body.total);
    });
  });
});
