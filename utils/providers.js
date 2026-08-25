// utils/providers.js
const { Groq } = require("groq-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("./config");
const { reserveTokens, reconcileReservation, refundReservation } = require("./budget");
const { checkRateLimit } = require("./rateLimiter");
const { acquireInFlightLock } = require("./idempotency");
const { buildInterpretationPrompt } = require("./prompt");
const { calculateRequestReservation } = require("./tokenEstimator");
const { buildEmergencyPayload } = require("./emergency");

// Injectable mock drivers for deterministic offline tests
let mockGroqRunner = null;
let mockGeminiRunner = null;

function setMockProviders({ groq, gemini } = {}) {
  mockGroqRunner = groq || null;
  mockGeminiRunner = gemini || null;
}

function resetMockProviders() {
  mockGroqRunner = null;
  mockGeminiRunner = null;
}

/**
 * Executes a non-streaming completion call to Groq.
 * @param {string} prompt
 * @param {AbortSignal} [signal]
 */
async function generateWithGroq(prompt, signal) {
  try {
    if (mockGroqRunner) {
      return await mockGroqRunner(prompt, signal);
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      const err = new Error("GROQ_API_KEY is not configured.");
      err.status = 401;
      err.errorType = "AUTH_ERROR";
      throw err;
    }

    const groq = new Groq({ apiKey });

    const response = await groq.chat.completions.create(
      {
        model: config.GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        reasoning_effort: config.GROQ_REASONING_EFFORT,
        include_reasoning: false,
        max_completion_tokens: config.GROQ_MAX_COMPLETION_TOKENS,
        temperature: config.TEMPERATURE,
      },
      { signal }
    );

    const choice = response.choices?.[0];
    const text = choice?.message?.content || "";
    const usage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens || 0,
    };

    return {
      text: text.trim(),
      usage,
      provider: "groq",
    };
  } catch (err) {
    classifyProviderError(err);
    throw err;
  }
}

/**
 * Executes a non-streaming completion call to Google Gemini (fallback).
 * @param {string} prompt
 * @param {AbortSignal} [signal]
 */
async function generateWithGemini(prompt, signal) {
  try {
    if (mockGeminiRunner) {
      return await mockGeminiRunner(prompt, signal);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const err = new Error("GEMINI_API_KEY is not configured.");
      err.status = 401;
      err.errorType = "AUTH_ERROR";
      throw err;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: config.GEMINI_MODEL,
      generationConfig: {
        maxOutputTokens: config.GEMINI_MAX_OUTPUT_TOKENS,
        temperature: config.TEMPERATURE,
      },
    });

    const result = await model.generateContent(prompt, {
      signal,
      timeout: config.GEMINI_TIMEOUT_MS,
    });

    const response = result.response;
    const text = response.text() || "";
    const usageMetadata = response.usageMetadata;

    const usage = {
      promptTokens: usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4),
      completionTokens: usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4),
      totalTokens:
        usageMetadata?.totalTokenCount ||
        Math.ceil(prompt.length / 4) + Math.ceil(text.length / 4),
    };

    return {
      text: text.trim(),
      usage,
      provider: "gemini",
    };
  } catch (err) {
    classifyProviderError(err);
    throw err;
  }
}

function classifyProviderError(err) {
  const status = err.status || err.statusCode;
  const msg = (err.message || "").toLowerCase();

  if (err.name === "AbortError" || msg.includes("aborted")) {
    err.errorType = "ABORTED";
  } else if (status === 401 || status === 403 || msg.includes("unauthorized") || msg.includes("api key") || msg.includes("auth")) {
    err.errorType = "AUTH_ERROR";
  } else if (status === 400 || msg.includes("invalid_argument") || msg.includes("bad request") || msg.includes("invalid parameter")) {
    err.errorType = "BAD_REQUEST";
  } else if (status === 429 || msg.includes("rate limit") || msg.includes("quota")) {
    err.errorType = "RATE_LIMITED";
  } else {
    err.errorType = "TRANSIENT";
  }
}

/**
 * Main orchestration layer:
 * Handles duplicate locking with owner tokens, rate limiting,
 * request-specific dynamic token reservation, Groq primary call,
 * strict Gemini fallback, and Emergency Reflection Mode.
 *
 * Guaranteed maximum AI provider calls per request: 2
 */
async function generateInterpretation({ requestData, clientIp, signal, isAborted = () => false }) {
  const { dreamNarrative, symbols, emotions, language, languageName } = requestData;

  // 1. In-flight duplicate lock
  const { acquired, release } = await acquireInFlightLock({
    dreamNarrative,
    symbols,
    emotions,
    language,
  });

  if (!acquired) {
    return {
      type: "duplicate",
      status: 429,
      error: "duplicate_in_flight",
      message: "An identical interpretation request is already in progress.",
    };
  }

  try {
    // 2. Per-IP & Global Rate Limiting
    const rateCheck = await checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      if (rateCheck.reason === "REDIS_UNAVAILABLE") {
        // Fail closed to Emergency Reflection Mode if Redis is down
        return buildEmergencyPayload({
          reason: "redis_unavailable",
          language,
        });
      }
      return {
        type: "rate_limited",
        status: 429,
        error: "rate_limit_exceeded",
        reason: rateCheck.reason,
      };
    }

    const prompt = buildInterpretationPrompt({
      dreamNarrative,
      symbols,
      emotions,
      languageName,
    });

    let groqEligibleForFallback = false;

    // 3. Primary Attempt: Groq (using request-specific dynamic reservation)
    const groqReservationAmount = calculateRequestReservation("groq", prompt, language);
    const groqReserve = await reserveTokens("groq", groqReservationAmount);

    if (groqReserve.allowed) {
      try {
        if (isAborted()) {
          await refundReservation("groq", groqReservationAmount);
          return { type: "aborted", status: 499 };
        }

        const groqResult = await generateWithGroq(prompt, signal);

        // Reconcile actual usage with dynamic reservation
        await reconcileReservation(
          "groq",
          groqReservationAmount,
          groqResult.usage.totalTokens
        );

        return {
          type: "success",
          provider: "groq",
          delta: groqResult.text,
          usage: groqResult.usage,
          reservedTokens: groqReservationAmount,
        };
      } catch (groqErr) {
        if (isAborted() || groqErr.errorType === "ABORTED") {
          return { type: "aborted", status: 499 };
        }

        if (groqErr.errorType === "AUTH_ERROR") {
          // Fail closed to emergency mode. DO NOT fallback to Gemini on Groq auth failure!
          console.error("Groq authentication failure. Failing closed to emergency reflection mode.");
          return buildEmergencyPayload({
            reason: "groq_auth_failure",
            language,
          });
        }

        if (groqErr.errorType === "BAD_REQUEST") {
          // Bad request to Groq - do not fallback
          console.error("Groq bad request error:", groqErr.message);
          return buildEmergencyPayload({
            reason: "groq_bad_request",
            language,
          });
        }

        // For transient errors or 429, retain conservative token reservation and evaluate Gemini fallback
        console.warn("Groq transient failure, evaluating Gemini fallback:", groqErr.message);
        groqEligibleForFallback = true;
      }
    } else {
      if (groqReserve.reason === "REDIS_UNAVAILABLE") {
        return buildEmergencyPayload({
          reason: "redis_unavailable",
          language,
        });
      }
      console.warn("Groq budget or guardrail not available:", groqReserve.reason);
      groqEligibleForFallback = true;
    }

    // 4. Fallback Attempt: Gemini (using request-specific dynamic reservation)
    if (groqEligibleForFallback) {
      if (isAborted()) {
        return { type: "aborted", status: 499 };
      }

      const geminiReservationAmount = calculateRequestReservation("gemini", prompt, language);
      const geminiReserve = await reserveTokens("gemini", geminiReservationAmount);

      if (geminiReserve.allowed) {
        try {
          if (isAborted()) {
            await refundReservation("gemini", geminiReservationAmount);
            return { type: "aborted", status: 499 };
          }

          const geminiResult = await generateWithGemini(prompt, signal);

          await reconcileReservation(
            "gemini",
            geminiReservationAmount,
            geminiResult.usage.totalTokens
          );

          return {
            type: "success",
            provider: "gemini",
            delta: geminiResult.text,
            usage: geminiResult.usage,
            reservedTokens: geminiReservationAmount,
          };
        } catch (geminiErr) {
          console.error("Gemini fallback failed:", geminiErr?.message || geminiErr);
          // Fall through to Emergency Reflection Mode (No retries!)
        }
      } else {
        console.warn("Gemini fallback budget not available:", geminiReserve.reason);
      }
    }

    // 5. Final Fallback: Dream Reflection Mode (0 AI calls, 0 AI tokens)
    return buildEmergencyPayload({
      reason: "budget_or_provider_unavailable",
      language,
    });
  } finally {
    // Release in-flight lock
    await release();
  }
}

module.exports = {
  generateWithGroq,
  generateWithGemini,
  generateInterpretation,
  setMockProviders,
  resetMockProviders,
};
