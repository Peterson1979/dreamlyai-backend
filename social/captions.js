/**
 * Social Platform Caption Formatter for DreamlyAI
 *
 * Implements deterministic final caption construction for Instagram and Facebook,
 * appending 'link in bio' CTA to Instagram captions and website link to Facebook captions without duplication.
 */

const { validateManifest } = require("./manifest");

const INSTAGRAM_BIO_CTA = "Explore Dreamly AI — link in bio.";
const FACEBOOK_WEB_CTA = "Explore Dreamly AI → https://dreamlyai.life/";
const FACEBOOK_WEBSITE_URL = "https://dreamlyai.life/";

const FACEBOOK_FINAL_CAPTION_MAX = 2000;
const INSTAGRAM_FINAL_CAPTION_MAX = 2000;

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

  // Instagram caption deterministically appends bio CTA without direct URL
  const baseInstagram = manifest.captions.instagram;
  let instagram;

  if (
    baseInstagram.includes(INSTAGRAM_BIO_CTA) ||
    baseInstagram.toLowerCase().includes("link in bio")
  ) {
    // If bio CTA already appears, do not duplicate
    instagram = baseInstagram;
  } else {
    instagram = `${baseInstagram}\n\n${INSTAGRAM_BIO_CTA}`;
  }

  if (instagram.length > INSTAGRAM_FINAL_CAPTION_MAX) {
    throw new Error(
      `Final Instagram caption exceeds maximum length of ${INSTAGRAM_FINAL_CAPTION_MAX} characters (got ${instagram.length})`
    );
  }

  // Facebook caption deterministically appends website CTA pointing to https://dreamlyai.life/
  const baseFacebook = manifest.captions.facebook;
  let facebook;

  if (
    baseFacebook.includes(FACEBOOK_WEB_CTA) ||
    baseFacebook.includes(FACEBOOK_WEBSITE_URL) ||
    baseFacebook.includes("https://dreamlyai.life")
  ) {
    // If the website URL already appears, do not duplicate
    facebook = baseFacebook;
  } else {
    facebook = `${baseFacebook}\n\n${FACEBOOK_WEB_CTA}`;
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
  INSTAGRAM_BIO_CTA,
  FACEBOOK_WEB_CTA,
  FACEBOOK_WEBSITE_URL,
  FACEBOOK_FINAL_CAPTION_MAX,
  INSTAGRAM_FINAL_CAPTION_MAX,
  buildPlatformCaptions
};
