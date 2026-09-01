/**
 * Social AI Provider Binding for DreamlyAI
 *
 * Implements the production binding between the social content generator
 * and the existing protected Groq/Gemini provider infrastructure.
 *
 * Enforces token budgeting, timeout protection, deterministic Groq-primary
 * with Gemini-fallback policy, and strict error sanitization.
 * Does NOT perform JSON parsing, markdown stripping, or schema validation.
 */

const config = require("../utils/config");
const {
  generateWithGroq,
  generateWithGemini
} = require("../utils/providers");
const {
  reserveTokens,
  reconcileReservation,
  refundReservation
} = require("../utils/budget");
const {
  calculateRequestReservation
} = require("../utils/tokenEstimator");

const SOCIAL_AI_ERROR_CODES = Object.freeze({
  INVALID_PROMPT: "INVALID_PROMPT",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  RATE_LIMITED: "RATE_LIMITED",
  AUTH_FAILURE: "AUTH_FAILURE",
  TIMEOUT: "TIMEOUT",
  ABORTED: "ABORTED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_FAILURE: "PROVIDER_FAILURE"
});

/**
 * Custom error class for social AI provider failures.
 */
class SocialAiProviderError extends Error {
  constructor(message, { code, originalError } = {}) {
    super(message);
    this.name = "SocialAiProviderError";
    this.code = code || SOCIAL_AI_ERROR_CODES.PROVIDER_FAILURE;
    if (originalError && originalError.errorType) {
      this.errorType = originalError.errorType;
    }
  }
}

/**
 * Sanitizes error messages to prevent leaking API keys, auth headers,
 * connection strings, or sensitive credentials.
 * @param {string} msg
 * @returns {string}
 */
function sanitizeErrorMessage(msg) {
  if (typeof msg !== "string") return "Unknown provider error";
  return msg
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]")
    .replace(/(?:gsk_|AIza)[A-Za-z0-9_\-]+/g, "[REDACTED_API_KEY]")
    .replace(/rediss?:\/\/[^\s@]+@[^\s]+/gi, "[REDACTED_REDIS_URL]");
}

/**
 * Combines caller signal with a timeout signal.
 * @param {AbortSignal} [callerSignal]
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, cleanup: Function }}
 */
function createTimeoutSignal(callerSignal, timeoutMs) {
  const controller = new AbortController();
  let timer = null;

  if (timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => {
      const err = new Error(`AI provider request timed out after ${timeoutMs}ms`);
      err.name = "TimeoutError";
      err.errorType = "TIMEOUT";
      controller.abort(err);
    }, timeoutMs);
  }

  if (callerSignal) {
    if (callerSignal.aborted) {
      if (timer) clearTimeout(timer);
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener(
        "abort",
        () => {
          if (timer) clearTimeout(timer);
          controller.abort(callerSignal.reason);
        },
        { once: true }
      );
    }
  }

  const cleanup = () => {
    if (timer) clearTimeout(timer);
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Executes a single social creative text generation using Groq (primary)
 * with strict Gemini fallback and Redis token budgeting.
 *
 * @param {object} params
 * @param {string} params.prompt Prompt text to send unchanged to the provider
 * @param {AbortSignal} [params.signal] Optional abort signal
 * @returns {Promise<string>} Raw model text output
 */
async function generateSocialAiText(params = {}) {
  const prompt = (params && typeof params === "object") ? params.prompt : params;
  const signal = (params && typeof params === "object") ? params.signal : undefined;

  // 1. Input validation
  if (typeof prompt !== "string") {
    throw new SocialAiProviderError(
      "Invalid prompt: 'prompt' must be a non-empty string",
      { code: SOCIAL_AI_ERROR_CODES.INVALID_PROMPT }
    );
  }

  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    throw new SocialAiProviderError(
      "Invalid prompt: 'prompt' cannot be empty or whitespace only",
      { code: SOCIAL_AI_ERROR_CODES.INVALID_PROMPT }
    );
  }

  let groqEligibleForFallback = false;

  // 2. Primary Provider: Groq
  const groqReservationAmount = calculateRequestReservation("groq", prompt);
  let groqReserve;
  try {
    groqReserve = await reserveTokens("groq", groqReservationAmount);
  } catch (reserveErr) {
    throw new SocialAiProviderError(
      `Budget reservation failed: ${sanitizeErrorMessage(reserveErr.message)}`,
      { code: SOCIAL_AI_ERROR_CODES.BUDGET_EXCEEDED }
    );
  }

  if (groqReserve.allowed) {
    const { signal: groqSignal, cleanup: groqCleanup } = createTimeoutSignal(
      signal,
      config.GROQ_TIMEOUT_MS
    );
    try {
      if (signal?.aborted) {
        await refundReservation("groq", groqReservationAmount);
        throw new SocialAiProviderError("Request aborted by caller", {
          code: SOCIAL_AI_ERROR_CODES.ABORTED
        });
      }

      const groqResult = await generateWithGroq(prompt, groqSignal);

      await reconcileReservation(
        "groq",
        groqReservationAmount,
        groqResult.usage?.totalTokens || 0
      );

      return groqResult.text;
    } catch (groqErr) {
      if (signal?.aborted || groqErr.name === "AbortError" || groqErr.errorType === "ABORTED") {
        await refundReservation("groq", groqReservationAmount);
        throw new SocialAiProviderError("Request aborted", {
          code: SOCIAL_AI_ERROR_CODES.ABORTED,
          originalError: groqErr
        });
      }

      if (groqErr.name === "TimeoutError" || groqErr.errorType === "TIMEOUT") {
        groqEligibleForFallback = true;
      } else if (groqErr.errorType === "AUTH_ERROR") {
        // Fail closed on Groq auth error. Do NOT fallback to Gemini on Groq auth failure!
        throw new SocialAiProviderError(
          `Groq authentication failure: ${sanitizeErrorMessage(groqErr.message)}`,
          {
            code: SOCIAL_AI_ERROR_CODES.AUTH_FAILURE,
            originalError: groqErr
          }
        );
      } else if (groqErr.errorType === "BAD_REQUEST") {
        // Bad request to Groq - do not fallback
        throw new SocialAiProviderError(
          `Groq bad request error: ${sanitizeErrorMessage(groqErr.message)}`,
          {
            code: SOCIAL_AI_ERROR_CODES.INVALID_PROMPT,
            originalError: groqErr
          }
        );
      } else {
        // Transient error or rate-limited
        groqEligibleForFallback = true;
      }
    } finally {
      groqCleanup();
    }
  } else {
    if (groqReserve.reason === "REDIS_UNAVAILABLE") {
      throw new SocialAiProviderError(
        "Token budget check failed: Redis is unavailable",
        { code: SOCIAL_AI_ERROR_CODES.PROVIDER_UNAVAILABLE }
      );
    }
    // Groq budget / guardrail exceeded, evaluate Gemini fallback
    groqEligibleForFallback = true;
  }

  // 3. Fallback Provider: Gemini
  if (groqEligibleForFallback) {
    if (signal?.aborted) {
      throw new SocialAiProviderError("Request aborted by caller", {
        code: SOCIAL_AI_ERROR_CODES.ABORTED
      });
    }

    const geminiReservationAmount = calculateRequestReservation("gemini", prompt);
    let geminiReserve;
    try {
      geminiReserve = await reserveTokens("gemini", geminiReservationAmount);
    } catch (geminiReserveErr) {
      throw new SocialAiProviderError(
        `Gemini budget reservation failed: ${sanitizeErrorMessage(geminiReserveErr.message)}`,
        { code: SOCIAL_AI_ERROR_CODES.BUDGET_EXCEEDED }
      );
    }

    if (geminiReserve.allowed) {
      const { signal: geminiSignal, cleanup: geminiCleanup } = createTimeoutSignal(
        signal,
        config.GEMINI_TIMEOUT_MS
      );
      try {
        if (signal?.aborted) {
          await refundReservation("gemini", geminiReservationAmount);
          throw new SocialAiProviderError("Request aborted by caller", {
            code: SOCIAL_AI_ERROR_CODES.ABORTED
          });
        }

        const geminiResult = await generateWithGemini(prompt, geminiSignal);

        await reconcileReservation(
          "gemini",
          geminiReservationAmount,
          geminiResult.usage?.totalTokens || 0
        );

        return geminiResult.text;
      } catch (geminiErr) {
        if (signal?.aborted || geminiErr.name === "AbortError" || geminiErr.errorType === "ABORTED") {
          await refundReservation("gemini", geminiReservationAmount);
          throw new SocialAiProviderError("Request aborted", {
            code: SOCIAL_AI_ERROR_CODES.ABORTED,
            originalError: geminiErr
          });
        }

        if (geminiErr.name === "TimeoutError" || geminiErr.errorType === "TIMEOUT") {
          throw new SocialAiProviderError(
            `Gemini fallback timed out: ${sanitizeErrorMessage(geminiErr.message)}`,
            {
              code: SOCIAL_AI_ERROR_CODES.TIMEOUT,
              originalError: geminiErr
            }
          );
        }

        if (geminiErr.errorType === "AUTH_ERROR") {
          throw new SocialAiProviderError(
            `Gemini fallback authentication failure: ${sanitizeErrorMessage(geminiErr.message)}`,
            {
              code: SOCIAL_AI_ERROR_CODES.AUTH_FAILURE,
              originalError: geminiErr
            }
          );
        }

        throw new SocialAiProviderError(
          `Gemini fallback failed: ${sanitizeErrorMessage(geminiErr.message)}`,
          {
            code: SOCIAL_AI_ERROR_CODES.PROVIDER_FAILURE,
            originalError: geminiErr
          }
        );
      } finally {
        geminiCleanup();
      }
    } else {
      throw new SocialAiProviderError(
        `Gemini fallback budget unavailable: ${geminiReserve.reason || "BUDGET_EXCEEDED"}`,
        { code: SOCIAL_AI_ERROR_CODES.BUDGET_EXCEEDED }
      );
    }
  }

  throw new SocialAiProviderError(
    "All AI providers unavailable or exhausted",
    { code: SOCIAL_AI_ERROR_CODES.PROVIDER_UNAVAILABLE }
  );
}

module.exports = {
  SOCIAL_AI_ERROR_CODES,
  SocialAiProviderError,
  generateSocialAiText,
  generateText: generateSocialAiText,
  sanitizeErrorMessage
};
