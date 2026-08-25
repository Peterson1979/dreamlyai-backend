// api/interpret.js
const { validateInterpretationRequest } = require("../utils/validation");
const { getClientIp } = require("../utils/rateLimiter");
const { generateInterpretation } = require("../utils/providers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // 1. Validate payload
  const validation = validateInterpretationRequest(req.body);
  if (!validation.isValid) {
    return res.status(validation.status || 400).json({
      error: validation.error,
      message: validation.message,
    });
  }

  const clientIp = getClientIp(req);
  const abortController = new AbortController();
  let clientDisconnected = false;

  // 2. Response-aware client disconnect handling
  // Distinguishes normal request completion (res.writableEnded = true) from premature abort (res.writableEnded = false)
  const onResponseClose = () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      try {
        abortController.abort();
      } catch (e) {
        // Ignore abort errors
      }
    }
  };

  res.on("close", onResponseClose);

  try {
    const result = await generateInterpretation({
      requestData: validation.sanitized,
      clientIp,
      signal: abortController.signal,
      isAborted: () => clientDisconnected || res.destroyed || res.writableEnded,
    });

    if (clientDisconnected || res.writableEnded || res.destroyed) {
      return;
    }

    if (result.type === "duplicate") {
      return res.status(429).json({
        error: result.error,
        message: result.message,
      });
    }

    if (result.type === "rate_limited") {
      return res.status(429).json({
        error: result.error,
        reason: result.reason,
      });
    }

    if (result.type === "aborted") {
      return;
    }

    // 3. Emit SSE response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const ssePayload = {
      delta: result.delta,
      type: result.type,
      provider: result.provider,
      ...(result.mode ? { mode: result.mode } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    };

    res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Unhandled interpret handler error:", err?.message || err);

    if (clientDisconnected || res.writableEnded || res.destroyed) {
      return;
    }

    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "internal_error" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } finally {
    res.off("close", onResponseClose);
  }
};