/**
 * Social Content Generator for DreamlyAI
 *
 * Implements deterministic creative content generation with strict fail-closed
 * JSON parsing and validation. No auto-retry, no prompt/credential leakage.
 */

const { buildSocialCreativePrompt } = require("./contentPrompt");
const { validateCreativePayload } = require("./contentSchema");

const GENERATOR_ERROR_CODES = Object.freeze({
  INVALID_GENERATOR_INPUT: "INVALID_GENERATOR_INPUT",
  MODEL_OUTPUT_EMPTY: "MODEL_OUTPUT_EMPTY",
  MODEL_OUTPUT_NOT_JSON: "MODEL_OUTPUT_NOT_JSON",
  MODEL_OUTPUT_SCHEMA_INVALID: "MODEL_OUTPUT_SCHEMA_INVALID",
  GENERATOR_PROVIDER_FAILURE: "GENERATOR_PROVIDER_FAILURE"
});

/**
 * Custom error class for social creative generation and parsing failures.
 */
class SocialGeneratorError extends Error {
  constructor(message, { code, errors, cause } = {}) {
    super(message);
    this.name = "SocialGeneratorError";
    this.code = code || GENERATOR_ERROR_CODES.GENERATOR_PROVIDER_FAILURE;
    if (errors) {
      this.errors = errors;
    }
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Parses raw model output string with strict fail-closed JSON validation.
 * Does NOT strip Markdown fences, extract from prose, or attempt repairs.
 * @param {string} rawOutput
 * @returns {object} Validated creative payload
 */
function parseCreativeModelOutput(rawOutput) {
  if (typeof rawOutput !== "string") {
    throw new SocialGeneratorError("Model output must be a string", {
      code: GENERATOR_ERROR_CODES.MODEL_OUTPUT_EMPTY
    });
  }

  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) {
    throw new SocialGeneratorError("Model output is empty", {
      code: GENERATOR_ERROR_CODES.MODEL_OUTPUT_EMPTY
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (parseErr) {
    throw new SocialGeneratorError(
      `Model output is not valid JSON: ${parseErr.message}`,
      {
        code: GENERATOR_ERROR_CODES.MODEL_OUTPUT_NOT_JSON,
        cause: parseErr
      }
    );
  }

  const validation = validateCreativePayload(parsed);
  if (!validation.valid) {
    throw new SocialGeneratorError(
      `Creative payload validation failed: ${validation.errors.join("; ")}`,
      {
        code: GENERATOR_ERROR_CODES.MODEL_OUTPUT_SCHEMA_INVALID,
        errors: validation.errors
      }
    );
  }

  return parsed;
}

/**
 * Generates and validates social creative content using injected text generator.
 * @param {object} params
 * @param {string} params.publishDate Strict YYYY-MM-DD
 * @param {string|object} params.category Category ID or object
 * @param {Array<string>} [params.recentTopicHints=[]]
 * @param {Function} params.generateText Async function ({ prompt }) => string | { text: string }
 * @returns {Promise<{ topic: string, slides: Array<object>, captions: { instagram: string, facebook: string } }>}
 */
async function generateSocialCreative({
  publishDate,
  category,
  recentTopicHints = [],
  generateText
} = {}) {
  if (typeof generateText !== "function") {
    throw new SocialGeneratorError(
      "Missing or invalid required dependency: 'generateText' must be a function",
      {
        code: GENERATOR_ERROR_CODES.INVALID_GENERATOR_INPUT
      }
    );
  }

  let prompt;
  try {
    prompt = buildSocialCreativePrompt({
      publishDate,
      category,
      recentTopicHints
    });
  } catch (inputErr) {
    throw new SocialGeneratorError(
      `Invalid generator inputs: ${inputErr.message}`,
      {
        code: GENERATOR_ERROR_CODES.INVALID_GENERATOR_INPUT,
        cause: inputErr
      }
    );
  }

  let rawResult;
  try {
    rawResult = await generateText({ prompt });
  } catch (providerErr) {
    throw new SocialGeneratorError(
      `Provider failure during social creative generation: ${providerErr.message}`,
      {
        code: GENERATOR_ERROR_CODES.GENERATOR_PROVIDER_FAILURE,
        cause: providerErr
      }
    );
  }

  let text;
  if (typeof rawResult === "string") {
    text = rawResult;
  } else if (
    rawResult &&
    typeof rawResult === "object" &&
    typeof rawResult.text === "string"
  ) {
    text = rawResult.text;
  } else {
    throw new SocialGeneratorError(
      "Provider returned invalid response shape: expected string or { text: string }",
      {
        code: GENERATOR_ERROR_CODES.GENERATOR_PROVIDER_FAILURE
      }
    );
  }

  const creative = parseCreativeModelOutput(text);

  return {
    topic: creative.topic,
    slides: creative.slides,
    captions: creative.captions
  };
}

module.exports = {
  GENERATOR_ERROR_CODES,
  SocialGeneratorError,
  parseCreativeModelOutput,
  generateSocialCreative
};
