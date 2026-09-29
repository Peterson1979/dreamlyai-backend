/**
 * Base Video Social Adapter
 *
 * Provides shared utilities for timeout management, secret redaction,
 * and error sanitization.
 */

class BaseVideoAdapter {
  constructor(name = "base") {
    this.name = name;
  }

  /**
   * Fetches URL with abort signal timeout.
   * @param {Function} fetchFn
   * @param {string} url
   * @param {object} options
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<Response>}
   */
  async fetchWithTimeout(fetchFn = fetch, url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const mergedOptions = {
        ...options,
        signal: controller.signal
      };
      return await fetchFn(url, mergedOptions);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Redacts sensitive secrets from strings or objects.
   * @param {*} val
   * @returns {*}
   */
  redactSecrets(val) {
    if (typeof val === "string") {
      return val
        .replace(/(access_token|refresh_token|client_secret|Authorization|Bearer|secret|password)=([^&,\s]+)/gi, "$1=[REDACTED]")
        .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]+/gi, "$1[REDACTED]");
    }
    if (typeof val === "object" && val !== null) {
      const copy = Array.isArray(val) ? [] : {};
      for (const [k, v] of Object.entries(val)) {
        if (/token|secret|password|auth|key/i.test(k) && typeof v === "string") {
          copy[k] = "[REDACTED]";
        } else {
          copy[k] = this.redactSecrets(v);
        }
      }
      return copy;
    }
    return val;
  }

  /**
   * Sanitizes error message.
   * @param {*} err
   * @param {number | null} status
   * @returns {object}
   */
  sanitizeError(err, status = null) {
    let rawMsg = "Unknown provider error";
    if (typeof err === "string") {
      rawMsg = err;
    } else if (err instanceof Error) {
      rawMsg = err.message;
    } else if (err?.message) {
      rawMsg = typeof err.message === "string" ? err.message : JSON.stringify(err.message);
    } else if (err?.error?.message) {
      rawMsg = err.error.message;
    }

    return {
      message: this.redactSecrets(rawMsg),
      status: status || err?.status || null
    };
  }
}

module.exports = {
  BaseVideoAdapter
};
