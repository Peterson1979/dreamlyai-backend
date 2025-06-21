// Import the Google Generative AI client library
const { GoogleGenerativeAI } = require("@google/generative-ai");

// This is the main handler for the Vercel serverless function
module.exports = async (req, res) => {
  // We only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // --- 1. Get User Input ---
    // Extract the dream narrative from the request body sent by the Android app
    const { dreamNarrative, symbols, emotions } = req.body;

    // Basic validation: ensure the dream narrative is present
    if (!dreamNarrative) {
      return res.status(400).json({ error: 'Dream narrative is required.' });
    }

    // --- 2. Securely Access API Key ---
    // Access the Gemini API key from environment variables (we will set this in Vercel)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // This is a server-side error, not the client's fault
      console.error('Gemini API key not found.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Using Flash for speed and cost-effectiveness

    // --- 3. Construct the Prompt ---
    // Create a detailed prompt for the AI to get the best results
    const systemInstruction = `
      You are an empathetic and insightful dream interpreter. Your goal is to provide a thoughtful, non-definitive interpretation of a user's dream.
      Your tone should be supportive, curious, and gentle, like a wise guide. Never state interpretations as facts, but as possibilities for self-reflection.
      Use phrases like "This could symbolize...", "Perhaps this reflects...", "It might suggest...".

      The output MUST be in Markdown format and strictly follow this structure:
      ### Summary
      A brief, one or two-sentence summary of the most likely core theme of the dream.

      ### Detailed Analysis
      - **Symbols:** Analyze the key symbols provided or found in the narrative. For each symbol, explain its common meanings and how it might relate to the user's context.
      - **Emotions:** Discuss the emotions felt in the dream and what they might indicate about the user's current emotional state.
      - **Narrative Flow:** Interpret the story or events of the dream. What could the progression of events signify?
      - **Possible Meaning:** Offer a concluding thought on what the dream as a whole could be encouraging the user to reflect upon in their waking life.

      You must generate the response in the same language as the user's input.
    `;

    // Combine system instructions with user-provided details
    const userPrompt = `
      Here is my dream:
      - Narrative: ${dreamNarrative}
      - Key Symbols: ${symbols || 'Not provided'}
      - Emotions Felt: ${emotions || 'Not provided'}
    `;

    const fullPrompt = systemInstruction + userPrompt;

    // --- 4. Call Gemini API ---
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const interpretationText = response.text();

    // --- 5. Send Response to App ---
    // Send the generated text back to the Android app in a JSON object
    res.status(200).json({ interpretation: interpretationText });

  } catch (error) {
    // Handle potential errors from the API or other issues
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to generate interpretation.' });
  }
};