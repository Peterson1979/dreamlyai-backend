// utils/prompt.js

/**
 * Builds an optimized, compact single prompt for dream interpretation.
 * Instructs the model to naturally render the 6 core sections in the target language.
 */
function buildInterpretationPrompt({ dreamNarrative, symbols, emotions, languageName }) {
  const symbolsText = symbols && symbols.length > 0 ? symbols : "none";
  const emotionsText = emotions && emotions.length > 0 ? emotions : "none";

  return `You are a thoughtful, empathetic dream interpreter. Provide a reflective, non-authoritative interpretation of this dream.

Rules:
- Respond entirely in ${languageName}.
- Plain text only. Do not use bold, italics, markdown headers, or bullet symbols.
- Target approximately 160-190 words. Always complete every sentence naturally.
- Structure your response into these 6 sections using natural headings translated into ${languageName}:
1. Summary
2. Detailed Analysis
3. Symbols
4. Emotions
5. Event Sequence
6. Possible Meaning

Dream: ${dreamNarrative}
Symbols: ${symbolsText}
Emotions: ${emotionsText}
`;
}

module.exports = {
  buildInterpretationPrompt,
};
