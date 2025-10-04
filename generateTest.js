// CommonJS szintaxis
const { GoogleGenerativeAI } = require("@google/generative-ai");

const client = new GoogleGenerativeAI(); // A kulcsot a GOOGLE_APPLICATION_CREDENTIALS változó adja

async function generateText() {
  try {
    const response = await client.chat.completions.create({
      model: "gemini-2.1",
      messages: [{ role: "user", content: "Hello, írj egy rövid bemutatkozó szöveget." }]
    });

    console.log("Generált szöveg:");
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error("Hiba a szöveg generálásakor:", error);
  }
}

generateText();
