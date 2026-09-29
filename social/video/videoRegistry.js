/**
 * Dreamly AI 30-Day Promotional Video Manifest Registry
 *
 * Provides static access to the 30 promotional video manifests,
 * rotation logic, date lookup, and sequence retrieval.
 */

const path = require("node:path");
const fs = require("node:fs");

const PROMO_VIDEO_START_DATE = "2026-09-28";
const PROMO_VIDEO_TOTAL_COUNT = 30;

// Derive end date: 29 days after start date
const startDateObj = new Date(`${PROMO_VIDEO_START_DATE}T00:00:00Z`);
const endDateObj = new Date(startDateObj.getTime() + (PROMO_VIDEO_TOTAL_COUNT - 1) * 86400000);
const PROMO_VIDEO_END_DATE = endDateObj.toISOString().slice(0, 10);

// Load 30 manifests from batch JSON
const BATCH_FILE_PATH = path.resolve(__dirname, "../../fixtures/social-manifests/promo-videos-30-batch.json");

let cachedManifests = null;

function loadAllManifests() {
  if (cachedManifests) return cachedManifests;
  if (!fs.existsSync(BATCH_FILE_PATH)) {
    throw new Error(`Promo video batch file not found at: ${BATCH_FILE_PATH}`);
  }
  const raw = fs.readFileSync(BATCH_FILE_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length !== PROMO_VIDEO_TOTAL_COUNT) {
    throw new Error(`Expected ${PROMO_VIDEO_TOTAL_COUNT} manifests in batch, found ${data?.length}`);
  }
  cachedManifests = Object.freeze(data);
  return cachedManifests;
}

const PROMO_VIDEO_MANIFESTS_30 = loadAllManifests();

/**
 * Checks whether a given YYYY-MM-DD date falls within the authoritative 30-day window.
 * @param {string} date YYYY-MM-DD
 * @returns {boolean}
 */
function isPromoVideoCampaignDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  return date >= PROMO_VIDEO_START_DATE && date <= PROMO_VIDEO_END_DATE;
}

/**
 * Retrieves the video manifest assigned to a specific date.
 * If date is within the 30-day window, returns exact matching manifest.
 * If date is outside, rotates deterministically modulo 30 based on days since epoch.
 * @param {string} date YYYY-MM-DD
 * @param {object} [options]
 * @param {boolean} [options.strict=false] If true, returns null if outside campaign window
 * @returns {object | null}
 */
function getVideoManifestForDate(date, options = {}) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const manifests = loadAllManifests();
  const directMatch = manifests.find((m) => m.date === date);
  if (directMatch) {
    return directMatch;
  }

  if (options.strict) {
    return null;
  }

  // Deterministic rotation modulo 30
  const dateObj = new Date(`${date}T00:00:00Z`);
  const diffDays = Math.floor((dateObj.getTime() - startDateObj.getTime()) / 86400000);
  const modIndex = ((diffDays % PROMO_VIDEO_TOTAL_COUNT) + PROMO_VIDEO_TOTAL_COUNT) % PROMO_VIDEO_TOTAL_COUNT;
  return manifests[modIndex] || null;
}

/**
 * Retrieves video manifest by sequence number (1..30).
 * @param {number} seq 1-indexed sequence number
 * @returns {object | null}
 */
function getVideoManifestBySequence(seq) {
  if (!Number.isInteger(seq) || seq < 1 || seq > PROMO_VIDEO_TOTAL_COUNT) {
    return null;
  }
  const manifests = loadAllManifests();
  return manifests[seq - 1] || null;
}

/**
 * Returns all 30 manifests.
 * @returns {Array<object>}
 */
function getAllVideoManifests() {
  return loadAllManifests();
}

module.exports = {
  PROMO_VIDEO_START_DATE,
  PROMO_VIDEO_END_DATE,
  PROMO_VIDEO_TOTAL_COUNT,
  PROMO_VIDEO_MANIFESTS_30,
  isPromoVideoCampaignDate,
  getVideoManifestForDate,
  getVideoManifestBySequence,
  getAllVideoManifests,
  loadAllManifests
};
