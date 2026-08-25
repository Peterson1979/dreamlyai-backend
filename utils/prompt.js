// utils/prompt.js

/**
 * Builds an optimized, compact single prompt for dream interpretation.
 * Enforces explicit section word budgets and eliminates redundant interpretations across sections.
 */
function buildInterpretationPrompt({ dreamNarrative, symbols, emotions, languageName }) {
  const symbolsText = symbols && symbols.length > 0 ? symbols : "none";
  const emotionsText = emotions && emotions.length > 0 ? emotions : "none";

  return `You are a thoughtful, empathetic dream interpreter. Provide a reflective, concise, non-authoritative interpretation of this dream.

Rules:
- Respond entirely in ${languageName}.
- Plain text only. Do not use bold, italics, markdown headers (#, **), or bullet symbols.
- Target a total length of 150-180 words. Complete every sentence naturally.
- Keep sentences concise. Do not repeat interpretations across sections or restate the full dream narrative.
- Structure your response into exactly these 6 sections using natural headings translated into ${languageName}, following these approximate word budgets:
1. Summary (20-25 words: core premise without full retelling)
2. Detailed Analysis (40-50 words: psychological and metaphorical insight)
3. Symbols (20-25 words: brief meaning of key symbols only)
4. Emotions (15-20 words: emotional tone, do not duplicate Detailed Analysis)
5. Event Sequence (15-20 words: concise chronological sequence only, no re-interpretation)
6. Possible Meaning (30-40 words: tentative, open-ended reflection)

Dream: ${dreamNarrative}
Symbols: ${symbolsText}
Emotions: ${emotionsText}
`;
}

module.exports = {
  buildInterpretationPrompt,
};
