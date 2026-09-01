const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  redactMessage,
  sanitizeGraphError,
  logMetaDiagnostic
} = require("../social/metaDiagnostic");

describe("Social Meta diagnostic logging", () => {
  it("is disabled by default", () => {
    const previous = process.env.META_DIAGNOSTIC_ENABLED;
    delete process.env.META_DIAGNOSTIC_ENABLED;
    const originalWarn = console.warn;
    let calls = 0;
    console.warn = () => { calls += 1; };

    try {
      logMetaDiagnostic({
        provider: "facebook",
        operation: "feed_publish",
        status: 400,
        graphError: { code: 100, message: "failure" }
      });
    } finally {
      console.warn = originalWarn;
      if (previous === undefined) delete process.env.META_DIAGNOSTIC_ENABLED;
      else process.env.META_DIAGNOSTIC_ENABLED = previous;
    }

    assert.equal(calls, 0);
  });

  it("logs only status and sanitized Graph error fields when enabled", () => {
    const previous = process.env.META_DIAGNOSTIC_ENABLED;
    process.env.META_DIAGNOSTIC_ENABLED = "true";
    const originalWarn = console.warn;
    const calls = [];
    console.warn = (...args) => calls.push(args);

    try {
      logMetaDiagnostic({
        provider: "instagram",
        operation: "media_publish",
        status: 400,
        graphError: {
          code: 100,
          error_subcode: 33,
          type: "OAuthException",
          message: "Invalid token=super-secret https://graph.facebook.com/v25.0/id"
        },
        url: "https://graph.facebook.com/v25.0/id",
        requestBody: "access_token=super-secret"
      });
    } finally {
      console.warn = originalWarn;
      if (previous === undefined) delete process.env.META_DIAGNOSTIC_ENABLED;
      else process.env.META_DIAGNOSTIC_ENABLED = previous;
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "META_DIAGNOSTIC");
    const serialized = calls[0][1];
    const record = JSON.parse(serialized);
    assert.deepEqual(record, {
      provider: "instagram",
      operation: "media_publish",
      status: 400,
      error: {
        code: 100,
        error_subcode: 33,
        type: "OAuthException",
        message: "Invalid token=[REDACTED] [REDACTED_URL]"
      }
    });
    assert.equal(serialized.includes("super-secret"), false);
    assert.equal(serialized.includes("access_token"), false);
  });

  it("redacts URLs and credential-like values from messages", () => {
    const message = redactMessage(
      "token=abc secret: xyz https://example.test/path and Bearer abc123"
    );
    assert.equal(message.includes("abc"), false);
    assert.equal(message.includes("xyz"), false);
    assert.equal(message.includes("https://example.test"), false);
    assert.match(message, /REDACTED/);
  });

  it("keeps only the approved Graph error fields", () => {
    assert.deepEqual(
      sanitizeGraphError({
        code: 32,
        error_subcode: 1,
        type: "OAuthException",
        message: "Rate limit reached",
        fbtrace_id: "must-not-be-logged"
      }),
      {
        code: 32,
        error_subcode: 1,
        type: "OAuthException",
        message: "Rate limit reached"
      }
    );
  });
});
