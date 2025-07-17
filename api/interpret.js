// Import the Google Generative AI client library
const { GoogleGenerativeAI } = require("@google/generative-ai");

// This is the main handler for the Vercel serverless function
module.exports = async (req, res) => {
  // We only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method_not_allowed',
      message: 'Only POST requests are allowed.'
    });
  }

  try {
    // --- 1. Get User Input ---
    const { dreamNarrative, symbols, emotions } = req.body;

    // Basic validation: ensure the dream narrative is present
    if (!dreamNarrative) {
      return res.status(400).json({
        error: 'missing_dream_narrative',
        message: 'Dream narrative is required.'
      });
    }

    // --- 2. Securely Access API Key ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Gemini API key not found.');
      return res.status(500).json({
        error: 'server_config_error',
        message: 'Server configuration error.'
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // --- 3. Construct the Prompt ---
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
    res.status(200).json({ interpretation: interpretationText });

  } catch (error) {
    console.error('Error calling Gemini API:', error);

    // Default error values
    let statusCode = 500;
    let errorCode = 'internal_error';
    let message = 'An unexpected error occurred.';

    // Determine error type based on Gemini API or network response
    if (error.status === 503) {
      statusCode = 503;
      errorCode = 'model_overloaded';
      message = 'The Gemini model is currently overloaded. Please try again later.';
    } else if (error.status === 429) {
      statusCode = 429;
      errorCode = 'rate_limited';
      message = 'Too many requests. Please wait and try again.';
    } else if (error.status === 401 || error.status === 403) {
      statusCode = error.status;
      errorCode = 'unauthorized';
      message = 'Unauthorized request. Please check your API key.';
    }

    return res.status(statusCode).json({
      error: errorCode,
      message
    });
  }
};
