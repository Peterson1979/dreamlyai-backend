/**
 * Social Platform Caption Formatter for DreamlyAI
 *
 * Implements deterministic final caption construction for Instagram and Facebook,
 * appending official Google Play Store CTA to Facebook captions without duplication.
 */

const { GOOGLE_PLAY_URL } = require("./config");
const { validateManifest } = require("./manifest");

const FACEBOOK_FINAL_CAPTION_MAX = 2000;

/**
 * Builds final platform-specific captions from a validated manifest.
 * @param {object} manifest Valid publication manifest
 * @returns {{ instagram: string, facebook: string }}
 */
function buildPlatformCaptions(manifest) {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Cannot build platform captions: manifest is invalid: ${validation.errors.join("; ")}`
    );
  }

  // Instagram caption remains verbatim AI base caption
  const instagram = manifest.captions.instagram;

  // Facebook caption deterministically appends official Google Play URL
  const baseFacebook = manifest.captions.facebook;
  let facebook;

  if (baseFacebook.includes(GOOGLE_PLAY_URL)) {
    // If the exact official URL already appears, do not duplicate
    facebook = baseFacebook;
  } else {
    facebook = `${baseFacebook}\n\nDownload DreamlyAI:\n${GOOGLE_PLAY_URL}`;
  }

  if (facebook.length > FACEBOOK_FINAL_CAPTION_MAX) {
    throw new Error(
      `Final Facebook caption exceeds maximum length of ${FACEBOOK_FINAL_CAPTION_MAX} characters (got ${facebook.length})`
    );
  }

  return {
    instagram,
    facebook
  };
}

module.exports = {
  FACEBOOK_FINAL_CAPTION_MAX,
  buildPlatformCaptions
};
