// api/report.js
export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dreamId, reason, content } = req.body;

    if (!dreamId || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Új report objektum létrehozása
    const newReport = {
      id: Date.now(),
      dreamId,
      reason,
      content: content || null,
      createdAt: new Date().toISOString()
    };

    // Nem írunk fájlba, csak visszaadjuk
    console.log("Report submitted:", newReport);

    return res.status(200).json({ success: true, report: newReport });
  } catch (err) {
    console.error("Report error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
