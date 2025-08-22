// api/report.js
export default async function handler(req, res) {
  console.log("Report API called:", { method: req.method, body: req.body });

  if (req.method !== "POST") {
    console.warn("Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dreamId, reason, content } = req.body;

    if (!dreamId || !reason) {
      console.warn("Missing required fields:", req.body);
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Új report objektum létrehozása
    const newReport = {
      id: Date.now(),
      dreamId,
      reason,
      content: content || null,
      createdAt: new Date().toISOString(),
    };

    // Logoljuk a reportot
    console.log("Report submitted successfully:", newReport);

    // Ha később Redis vagy más adatbázisba akarod menteni, ide kell majd az insert
    // Például: await redis.lpush('reports', JSON.stringify(newReport));

    return res.status(200).json({ success: true, report: newReport });
  } catch (err) {
    console.error("Report API error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: err?.message || null });
  }
}
