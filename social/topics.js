/**
 * Topic Categories and Rotation for DreamlyAI Social Content
 *
 * Provides deterministic 7-category rotation and strict safety guidance.
 */

const TOPIC_CATEGORIES = Object.freeze([
  Object.freeze({
    id: "dream_symbols",
    description: "Exploration of common dream imagery, archetypes, and cultural symbolic meanings.",
    safetyGuidance: "Avoid medical or mental-health claims. Avoid diagnosis. Do not present dream symbolism as scientifically certain or prophetic. Use probabilistic language (e.g., 'may', 'can', 'might') for interpretive ideas, distinguishing them from established sleep science."
  }),
  Object.freeze({
    id: "dream_science",
    description: "Educational insights into sleep architecture, REM cycles, and the neurobiology of dreaming.",
    safetyGuidance: "Distinguish established sleep facts from interpretive hypotheses. Avoid medical advice, health diagnoses, treatment claims, or therapeutic promises."
  }),
  Object.freeze({
    id: "common_dreams",
    description: "Themes and patterns behind widespread dreams like falling, flying, or showing up unprepared.",
    safetyGuidance: "Avoid presenting universal dream meanings as absolute truth or prophecy. Avoid psychological diagnosis. Frame interpretations using probabilistic language ('may reflect', 'can suggest')."
  }),
  Object.freeze({
    id: "emotions_themes",
    description: "Understanding emotional processing, stress, joy, and recurring themes in dream narratives.",
    safetyGuidance: "Avoid clinical mental-health or trauma diagnosis. Maintain a clear boundary between personal emotional reflection and medical therapy. Use open, non-prescriptive language."
  }),
  Object.freeze({
    id: "dream_recall",
    description: "Techniques and practical habits for improving dream memory and maintaining a dream journal.",
    safetyGuidance: "Keep guidance focused on healthy sleep hygiene and journaling practices. Do not offer medical treatments or clinical interventions for sleep disorders or insomnia."
  }),
  Object.freeze({
    id: "lucid_vivid",
    description: "Exploration of lucid dreaming techniques, vivid dream phenomena, and nighttime awareness.",
    safetyGuidance: "Distinguish safe awareness exercises from medical sleep conditions. Avoid claims of supernatural control, prophecy, or guarantees. Use careful, exploratory language."
  }),
  Object.freeze({
    id: "reflection",
    description: "Prompts and mindful questions to connect personal waking life context with dream imagery.",
    safetyGuidance: "Emphasize personal subjective reflection over definitive answers. Avoid fortune-telling, prediction, or definitive psychological conclusions."
  })
]);

const TOPIC_CATEGORY_IDS = Object.freeze(TOPIC_CATEGORIES.map((cat) => cat.id));

/**
 * Strictly validates YYYY-MM-DD calendar date string using UTC semantics.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) return false;
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Returns the topic category for a given publishDate using deterministic UTC calendar rotation.
 * @param {string} publishDate Strict YYYY-MM-DD
 * @returns {object} Full category object
 */
function getTopicCategoryForDate(publishDate) {
  if (!isValidDateString(publishDate)) {
    throw new Error(`Invalid publishDate: expected strict YYYY-MM-DD format, received '${publishDate}'`);
  }
  const parts = publishDate.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const epochDays = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  const index = ((epochDays % TOPIC_CATEGORIES.length) + TOPIC_CATEGORIES.length) % TOPIC_CATEGORIES.length;
  return TOPIC_CATEGORIES[index];
}

/**
 * Returns category object by ID or undefined if not found.
 * @param {string} categoryId
 * @returns {object|undefined}
 */
function getTopicCategoryById(categoryId) {
  return TOPIC_CATEGORIES.find((cat) => cat.id === categoryId);
}

module.exports = {
  TOPIC_CATEGORIES,
  TOPIC_CATEGORY_IDS,
  isValidDateString,
  getTopicCategoryForDate,
  getTopicCategoryById
};
