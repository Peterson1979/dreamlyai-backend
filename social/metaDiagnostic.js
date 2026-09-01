/**
 * Temporarily gated Meta Graph diagnostic logging.
 *
 * This is disabled unless META_DIAGNOSTIC_ENABLED is exactly "true". The
 * emitted record intentionally contains no request data, URLs, or credentials.
 */

function redactMessage(message) {
  if (typeof message !== "string") return undefined;

  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/(access[_ -]?token|token|api[_ -]?key|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function sanitizeGraphError(graphError) {
  if (!graphError || typeof graphError !== "object") return {};

  const sanitized = {};
  if (graphError.code !== undefined) sanitized.code = graphError.code;
  if (graphError.error_subcode !== undefined) {
    sanitized.error_subcode = graphError.error_subcode;
  }
  if (graphError.type !== undefined) sanitized.type = graphError.type;
  if (graphError.message !== undefined) {
    sanitized.message = redactMessage(graphError.message);
  }
  return sanitized;
}

function logMetaDiagnostic({ provider, operation, status, graphError } = {}) {
  if (process.env.META_DIAGNOSTIC_ENABLED !== "true") return;

  const record = {
    provider,
    operation,
    status,
    error: sanitizeGraphError(graphError)
  };

  console.warn("META_DIAGNOSTIC", JSON.stringify(record));
}

module.exports = {
  redactMessage,
  sanitizeGraphError,
  logMetaDiagnostic
};
