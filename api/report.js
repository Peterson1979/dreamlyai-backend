// api/report.js

// Allowed known reason codes
const KNOWN_REASONS = new Set([
  "inappropriate",
  "inaccurate",
  "offensive",
  "bug",
  "poor_quality",
  "other",
]);

function sanitizeReason(rawReason) {
  if (!rawReason || typeof rawReason !== "string") {
    return "unknown";
  }
  const clean = rawReason.trim().toLowerCase();
  if (KNOWN_REASONS.has(clean)) {
    return clean;
  }
  // If it's a short alphanumeric token, keep it; otherwise categorize as custom_reason
  if (/^[a-z0-9_-]{1,30}$/.test(clean)) {
    return clean;
  }
  return "custom_reason";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dreamId, reason } = req.body || {};

    if (!dreamId || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const safeReason = sanitizeReason(reason);
    const safeDreamId = String(dreamId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "unknown_id";

    // Create report record with sanitized metadata (content is never logged for privacy)
    const newReport = {
      id: Date.now(),
      dreamId: safeDreamId,
      reason: safeReason,
      createdAt: new Date().toISOString(),
    };

    // Log strictly sanitized operational metadata (NEVER log user dream text, content, or free-form comments)
    console.log("Report submitted successfully:", {
      id: newReport.id,
      dreamId: newReport.dreamId,
      reason: newReport.reason,
      createdAt: newReport.createdAt,
    });

    return res.status(200).json({ success: true, report: newReport });
  } catch (err) {
    console.error("Report API error:", err?.message || err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
