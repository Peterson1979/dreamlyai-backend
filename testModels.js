// CommonJS szintaxis
const GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;

// API kulcs a környezeti változóból
const client = new GoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY
});

async function listModels() {
  try {
    // Az új SDK-ban a client.listModels() kell, nem client.models.list()
    const response = await client.listModels();
    console.log("Elérhető modellek:");
    console.log(response);
  } catch (error) {
    console.error("Hiba a modellek listázásakor:", error);
  }
}

listModels();
