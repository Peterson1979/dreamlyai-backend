// runGemini.js
const { GoogleGenAI } = require("@google/genai");

// Service account-tal hitelesített kliens
const ai = new GoogleGenAI({
  project: "resonant-truth-464814", // a te projekt ID-d
  location: "us-central1"
});

async function generateText() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: "Készíts rövid, pozitív bemutatkozó szöveget a DreamlyAI alkalmazásról, ami álmok elemzésére szolgál."
    });

    // Ha van generált szöveg
    if (response?.candidates && response.candidates.length > 0) {
      console.log("Generált szöveg:");
      console.log(response.candidates[0].content);
    } 
    // Ha nincs, ellenőrizd a blokkolás okát
    else if (response?.promptFeedback?.blockReason) {
      console.log("A prompt blokkolva lett:", response.promptFeedback.blockReason);
      console.log("Teljes response debug info:");
      console.log(JSON.stringify(response, null, 2));
    } 
    // Egyéb eset
    else {
      console.log("A válasz struktúrája nem várt formátumú:");
      console.log(JSON.stringify(response, null, 2));
    }

  } catch (err) {
    console.error("Hiba a szöveg generálásakor:", err);
  }
}

// Futtatás
generateText();
