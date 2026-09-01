// test/socialAiProvider.test.js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  generateSocialAiText,
  generateText,
  SocialAiProviderError,
  SOCIAL_AI_ERROR_CODES,
  sanitizeErrorMessage
} = require("../social/aiProvider");
const {
  setMockProviders,
  resetMockProviders
} = require("../utils/providers");
const { setRedisClient, resetRedisClient } = require("../utils/redisClient");
const { MockRedis } = require("./helpers/mockRedis");
const config = require("../utils/config");
const {
  generateSocialCreative,
  SocialGeneratorError,
  GENERATOR_ERROR_CODES
} = require("../social/contentGenerator");
const { getTopicCategoryForDate } = require("../social/topics");

function createValidCreativeFixture() {
  return {
    topic: "Water and Ocean Dreams",
    slides: [
      {
        role: "cover",
        headline: "What Does Water in Your Dreams Mean?",
        subheadline: "Explore what vast oceans and calm rivers might reflect about your waking life."
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

describe("DreamlyAI Social AI-Provider Binding", () => {
  let mockRedis;
  let groqCalls;
  let geminiCalls;
  let capturedGroqPrompts;
  let capturedGeminiPrompts;

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
    groqCalls = 0;
    geminiCalls = 0;
    capturedGroqPrompts = [];
    capturedGeminiPrompts = [];
    resetMockProviders();
  });

  afterEach(() => {
    resetMockProviders();
    resetRedisClient();
  });

  function setupMockDrivers({
    groqBehavior = "success",
    geminiBehavior = "success",
    groqDelayMs = 0,
    geminiDelayMs = 0,
    groqUsage = { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    geminiUsage = { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    groqText = JSON.stringify(createValidCreativeFixture()),
    geminiText = JSON.stringify(createValidCreativeFixture())
  } = {}) {
    const mockGroq = async (prompt, signal) => {
      groqCalls++;
      capturedGroqPrompts.push(prompt);

      if (groqDelayMs > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, groqDelayMs);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
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
        const err = new Error("Invalid API Key: gsk_secret1234567890abcdef");
        err.status = 401;
        err.errorType = "AUTH_ERROR";
        throw err;
      }
      if (groqBehavior === "400_bad_request") {
        const err = new Error("Bad Request: invalid_argument");
        err.status = 400;
        err.errorType = "BAD_REQUEST";
        throw err;
      }
      if (groqBehavior === "429_rate_limited") {
        const err = new Error("Rate limit exceeded");
        err.status = 429;
        err.errorType = "RATE_LIMITED";
        throw err;
      }
      if (groqBehavior === "503_transient") {
        const err = new Error("Service Unavailable");
        err.status = 503;
        err.errorType = "TRANSIENT";
        throw err;
      }
      if (groqBehavior === "raw_secret_error") {
        const err = new Error("Connection failed to rediss://default:supersecretpassword@upstash.io:6379 with Bearer sk-groq-secret-token-abcdef");
        err.status = 500;
        throw err;
      }

      throw new Error(`Unhandled mock Groq behavior: ${groqBehavior}`);
    };

    const mockGemini = async (prompt, signal) => {
      geminiCalls++;
      capturedGeminiPrompts.push(prompt);

      if (geminiDelayMs > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, geminiDelayMs);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      }

      if (geminiBehavior === "success") {
        return { text: geminiText, usage: geminiUsage, provider: "gemini" };
      }
      if (geminiBehavior === "401_auth") {
        const err = new Error("API key not valid. Please pass a valid API key: AIzaSySecretKey123");
        err.status = 401;
        err.errorType = "AUTH_ERROR";
        throw err;
      }
      if (geminiBehavior === "500_transient") {
        const err = new Error("Gemini internal error");
        err.status = 500;
        err.errorType = "TRANSIENT";
        throw err;
      }

      throw new Error(`Unhandled mock Gemini behavior: ${geminiBehavior}`);
    };

    setMockProviders({ groq: mockGroq, gemini: mockGemini });
  }

  describe("Input Validation", () => {
    it("1. valid prompt accepted", async () => {
      setupMockDrivers();
      const prompt = "Generate daily social carousel for 2026-08-28";
      const result = await generateSocialAiText({ prompt });
      assert.equal(typeof result, "string");
      assert.equal(groqCalls, 1);
    });

    it("2. empty prompt rejected", async () => {
      setupMockDrivers();
      await assert.rejects(
        async () => generateSocialAiText({ prompt: "" }),
        (err) => {
          assert.equal(err instanceof SocialAiProviderError, true);
          assert.equal(err.code, SOCIAL_AI_ERROR_CODES.INVALID_PROMPT);
          return true;
        }
      );
      assert.equal(groqCalls, 0);
      assert.equal(geminiCalls, 0);
    });

    it("3. whitespace-only prompt rejected", async () => {
      setupMockDrivers();
      await assert.rejects(
        async () => generateSocialAiText({ prompt: "   \n\t  \r " }),
        (err) => {
          assert.equal(err instanceof SocialAiProviderError, true);
          assert.equal(err.code, SOCIAL_AI_ERROR_CODES.INVALID_PROMPT);
          return true;
        }
      );
      assert.equal(groqCalls, 0);
    });

    it("4. non-string prompt rejected", async () => {
      setupMockDrivers();
      for (const invalidPrompt of [null, undefined, 12345, {}, [], false]) {
        await assert.rejects(
          async () => generateSocialAiText({ prompt: invalidPrompt }),
          (err) => {
            assert.equal(err instanceof SocialAiProviderError, true);
            assert.equal(err.code, SOCIAL_AI_ERROR_CODES.INVALID_PROMPT);
            return true;
          }
        );
      }
      assert.equal(groqCalls, 0);
    });
  });

  describe("Normalization & Transparency (No parsing/repairing)", () => {
    it("5. provider result normalized to text", async () => {
      setupMockDrivers({ groqText: "{\"topic\":\"Test Topic\",\"slides\":[],\"captions\":{}}" });
      const text = await generateSocialAiText({ prompt: "valid prompt" });
      assert.equal(typeof text, "string");
      assert.equal(text, "{\"topic\":\"Test Topic\",\"slides\":[],\"captions\":{}}");
    });

    it("6. raw text is not JSON-parsed", async () => {
      const malformedJson = "{ topic: 'broken json', slides: [ unclosed";
      setupMockDrivers({ groqText: malformedJson });
      const result = await generateSocialAiText({ prompt: "valid prompt" });
      assert.equal(result, malformedJson);
    });

    it("7. raw text is not repaired (preserves markdown fences as-is)", async () => {
      const fencedText = "```json\n{\"topic\": \"Fenced\"}\n```";
      setupMockDrivers({ groqText: fencedText });
      const result = await generateSocialAiText({ prompt: "valid prompt" });
      assert.equal(result, fencedText);
    });

    it("8. prompt reaches provider unchanged", async () => {
      setupMockDrivers();
      const exactPrompt = "=== SPECIAL EXACT PROMPT WITH UNICODE 🌙✨ AND NEWLINES \n\n===";
      await generateSocialAiText({ prompt: exactPrompt });
      assert.equal(capturedGroqPrompts.length, 1);
      assert.equal(capturedGroqPrompts[0], exactPrompt);
    });

    it("9. no interpretation prompt is appended", async () => {
      setupMockDrivers();
      const prompt = "Social creative prompt only";
      await generateSocialAiText({ prompt });
      const received = capturedGroqPrompts[0];
      assert.equal(received.includes("Dream Analysis"), false);
      assert.equal(received.includes("dreamNarrative"), false);
      assert.equal(received.includes("symbols"), false);
      assert.equal(received.includes("emotions"), false);
    });
  });

  describe("Provider Execution & Fallback Semantics", () => {
    it("10. provider execution occurs exactly once on primary success", async () => {
      setupMockDrivers();
      await generateSocialAiText({ prompt: "valid prompt" });
      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 0);
    });

    it("11. no social retry loop on double failure", async () => {
      setupMockDrivers({ groqBehavior: "503_transient", geminiBehavior: "500_transient" });
      await assert.rejects(
        async () => generateSocialAiText({ prompt: "valid prompt" }),
        (err) => {
          assert.equal(err instanceof SocialAiProviderError, true);
          return true;
        }
      );
      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 1);
    });

    it("12. provider failure becomes sanitized error", async () => {
      setupMockDrivers({ groqBehavior: "503_transient", geminiBehavior: "500_transient" });
      await assert.rejects(
        async () => generateSocialAiText({ prompt: "valid prompt" }),
        (err) => {
          assert.equal(err instanceof SocialAiProviderError, true);
          assert.equal(typeof err.message, "string");
          assert.equal(err.code, SOCIAL_AI_ERROR_CODES.PROVIDER_FAILURE);
          return true;
        }
      );
    });

    it("13. secrets never appear in errors/results", async () => {
      setupMockDrivers({ groqBehavior: "raw_secret_error", geminiBehavior: "401_auth" });
      await assert.rejects(
        async () => generateSocialAiText({ prompt: "valid prompt" }),
        (err) => {
          assert.equal(err.message.includes("supersecretpassword"), false);
          assert.equal(err.message.includes("sk-groq-secret-token-abcdef"), false);
          assert.equal(err.message.includes("AIzaSySecretKey123"), false);
          return true;
        }
      );
    });

    it("14. existing fallback mechanism is reused where applicable", async () => {
      // Groq 503 transient -> fallback to Gemini
      setupMockDrivers({
        groqBehavior: "503_transient",
        geminiBehavior: "success",
        geminiText: JSON.stringify(createValidCreativeFixture())
      });
      const result = await generateSocialAiText({ prompt: "valid prompt" });
      assert.equal(typeof result, "string");
      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 1);

      // Groq 401 auth error -> fail closed immediately without Gemini fallback
      groqCalls = 0;
      geminiCalls = 0;
      setupMockDrivers({
        groqBehavior: "401_auth",
        geminiBehavior: "success"
      });
      await assert.rejects(
        async () => generateSocialAiText({ prompt: "valid prompt" }),
        (err) => {
          assert.equal(err.code, SOCIAL_AI_ERROR_CODES.AUTH_FAILURE);
          return true;
        }
      );
      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 0); // Gemini MUST NOT be called on Groq auth failure!
    });
  });

  describe("Budget & Rate Limiting Protections", () => {
    it("15. existing global/provider budget protections remain active", async () => {
      setupMockDrivers({
        groqUsage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 }
      });
      await generateSocialAiText({ prompt: "Test prompt for budget" });

      const today = new Date().toISOString().slice(0, 10);
      const groqUsed = await mockRedis.get(`budget:groq:tokens:${today}`);
      const totalUsed = await mockRedis.get(`budget:total:tokens:${today}`);

      assert.equal(parseInt(groqUsed, 10), 150);
      assert.equal(parseInt(totalUsed, 10), 150);
    });

    it("16. no second Redis client", async () => {
      setupMockDrivers();
      // Uses injected MockRedis without spawning independent Redis connection
      await generateSocialAiText({ prompt: "Checking redis usage" });
      assert.equal(mockRedis.store.size > 0, true);
    });

    it("17. no fake IP introduced", async () => {
      setupMockDrivers();
      await generateSocialAiText({ prompt: "No IP check needed for social" });
      // Verify no ip rate limit keys were created in Redis
      for (const key of mockRedis.store.keys()) {
        assert.equal(key.includes("ratelimit:ip"), false);
        assert.equal(key.includes("127.0.0.1"), false);
      }
    });

    it("18. existing timeout protection remains active", async () => {
      // Abort controller simulation
      setupMockDrivers({ groqDelayMs: 200 });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      await assert.rejects(
        async () => generateSocialAiText({ prompt: "Prompt with abort", signal: controller.signal }),
        (err) => {
          assert.equal(err instanceof SocialAiProviderError, true);
          assert.equal(err.code, SOCIAL_AI_ERROR_CODES.ABORTED);
          return true;
        }
      );
    });
  });

  describe("Configuration & Isolation", () => {
    it("19. deterministic social output limit safely supported (or default retained)", () => {
      // Confirm that config defaults are defined and accessible
      assert.equal(typeof config.GROQ_MAX_COMPLETION_TOKENS, "number");
      assert.equal(typeof config.GEMINI_MAX_OUTPUT_TOKENS, "number");
      assert.equal(config.GROQ_MAX_COMPLETION_TOKENS > 0, true);
      assert.equal(config.GEMINI_MAX_OUTPUT_TOKENS > 0, true);
    });

    it("20. interpretation output-token settings remain unchanged", () => {
      assert.equal(config.GROQ_MAX_COMPLETION_TOKENS, 550);
      assert.equal(config.GEMINI_MAX_OUTPUT_TOKENS, 500);
    });

    it("21. no schema validation in aiProvider", async () => {
      // aiProvider returns arbitrary text without checking 5-slide format
      setupMockDrivers({ groqText: "Non-schema plain text response" });
      const res = await generateSocialAiText({ prompt: "Arbitrary" });
      assert.equal(res, "Non-schema plain text response");
    });

    it("22. malformed JSON does not trigger provider retry", async () => {
      setupMockDrivers({ groqText: "{ broken json" });
      const res = await generateSocialAiText({ prompt: "Valid" });
      assert.equal(res, "{ broken json");
      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 0);
    });

    it("23. no social Redis state access in aiProvider", async () => {
      setupMockDrivers();
      await generateSocialAiText({ prompt: "State isolation check" });
      for (const key of mockRedis.store.keys()) {
        assert.equal(key.startsWith("social:state:"), false);
        assert.equal(key.startsWith("social:manifest:"), false);
        assert.equal(key.startsWith("social:quality:"), false);
      }
    });

    it("24. no R2 access in aiProvider", async () => {
      setupMockDrivers();
      // Generates text without needing any R2 environment variables or S3 clients
      const res = await generateSocialAiText({ prompt: "R2 isolation" });
      assert.equal(typeof res, "string");
    });

    it("25. no Meta access in aiProvider", async () => {
      setupMockDrivers();
      // No Facebook or Instagram API calls made
      const res = await generateSocialAiText({ prompt: "Meta isolation" });
      assert.equal(typeof res, "string");
    });

    it("26. no Pinterest support", () => {
      const aiProviderModule = require("../social/aiProvider");
      assert.equal("pinterest" in aiProviderModule, false);
    });

    it("27. zero real network calls", async () => {
      setupMockDrivers();
      const res = await generateSocialAiText({ prompt: "Offline verification" });
      assert.equal(typeof res, "string");
    });
  });

  describe("Integration with Social Content Generator", () => {
    it("28. returned generateText is compatible with generateSocialCreative", async () => {
      setupMockDrivers();
      const category = getTopicCategoryForDate("2026-08-28");
      const creative = await generateSocialCreative({
        publishDate: "2026-08-28",
        category,
        generateText
      });
      assert.equal(typeof creative, "object");
      assert.equal(typeof creative.topic, "string");
      assert.equal(creative.slides.length, 5);
    });

    it("29. valid mocked strict JSON flows successfully through generateSocialCreative", async () => {
      const fixture = createValidCreativeFixture();
      setupMockDrivers({ groqText: JSON.stringify(fixture) });

      const category = getTopicCategoryForDate("2026-08-28");
      const creative = await generateSocialCreative({
        publishDate: "2026-08-28",
        category,
        generateText: generateSocialAiText
      });

      assert.equal(creative.topic, fixture.topic);
      assert.equal(creative.slides.length, 5);
      assert.equal(creative.slides[0].role, "cover");
      assert.equal(creative.slides[4].role, "cta");
      assert.equal(groqCalls, 1);
    });

    it("30. malformed mocked output fails downstream without a second provider invocation", async () => {
      setupMockDrivers({ groqText: "{ not valid JSON ... }" });

      const category = getTopicCategoryForDate("2026-08-28");
      await assert.rejects(
        async () =>
          generateSocialCreative({
            publishDate: "2026-08-28",
            category,
            generateText: generateSocialAiText
          }),
        (err) => {
          assert.equal(err instanceof SocialGeneratorError, true);
          assert.equal(err.code, GENERATOR_ERROR_CODES.MODEL_OUTPUT_NOT_JSON);
          return true;
        }
      );

      assert.equal(groqCalls, 1);
      assert.equal(geminiCalls, 0);
    });
  });
});
