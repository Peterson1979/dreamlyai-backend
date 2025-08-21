// api/report.js
import { writeFileSync, existsSync, readFileSync } from "fs";
import path from "path";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dreamId, reason, content } = req.body;

    if (!dreamId || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 📂 Tárolás egy JSON fájlban (egyszerű megoldás DB nélkül)
    const filePath = path.join(process.cwd(), "reports.json");
    let reports = [];

    if (existsSync(filePath)) {
      const data = readFileSync(filePath, "utf8");
      reports = JSON.parse(data || "[]");
    }

    const newReport = {
      id: Date.now(),
      dreamId,
      reason,
      content: content || null,
      createdAt: new Date().toISOString()
    };

    reports.push(newReport);

    writeFileSync(filePath, JSON.stringify(reports, null, 2));

    return res.status(200).json({ success: true, report: newReport });
  } catch (err) {
    console.error("Report error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
