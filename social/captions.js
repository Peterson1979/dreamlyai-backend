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
const THREADS_WEB_CTA = "Explore Dreamly AI → https://dreamlyai.life/";
const THREADS_WEBSITE_URL = "https://dreamlyai.life/";

const FACEBOOK_FINAL_CAPTION_MAX = 2000;
const INSTAGRAM_FINAL_CAPTION_MAX = 2000;
const THREADS_FINAL_CAPTION_MAX = 500;

/**
 * Formats a Threads caption by ensuring the Dreamly AI CTA and link are present
 * while strictly respecting the 500-character Threads API limit.
 * @param {object} params
 * @param {string} [params.baseCaption=""]
 * @param {string} [params.cta=THREADS_WEB_CTA]
 * @param {string} [params.websiteUrl="https://dreamlyai.life/"]
 * @param {number} [params.maxChars=THREADS_FINAL_CAPTION_MAX]
 * @returns {string}
 */
function formatThreadsCaption({
  baseCaption = "",
  cta = THREADS_WEB_CTA,
  websiteUrl = "https://dreamlyai.life/",
  maxChars = THREADS_FINAL_CAPTION_MAX
} = {}) {
  let text = String(baseCaption || "").trim();

  // Normalize legacy/deprecated domain references to canonical Dreamly AI production website
  text = text.replace(/https?:\/\/(?:www\.)?(?:dreamlyai\.(?:app|com)|lifemode\.com)(?:\/)?/gi, "https://dreamlyai.life/");
  text = text.replace(/https:\/\/dreamlyai\.life(?!\/)/g, "https://dreamlyai.life/");

  const ctaText = String(cta || THREADS_WEB_CTA).trim();

  // Attach CTA if not already present in caption text
  if (ctaText && !text.includes(ctaText) && !text.includes("https://dreamlyai.life/")) {
    const hashtagMatch = text.match(/(\s+(?:#\w+\s*)+)$/);
    if (hashtagMatch && hashtagMatch.index !== undefined) {
      const mainBody = text.slice(0, hashtagMatch.index).trim();
      const hashtags = hashtagMatch[0].trim();
      text = mainBody ? `${mainBody}\n\n${ctaText}\n\n${hashtags}` : `${ctaText}\n\n${hashtags}`;
    } else {
      text = text ? `${text}\n\n${ctaText}` : ctaText;
    }
  }

  // Strictly enforce 500 characters limit
  if (text.length > maxChars) {
    if (ctaText && text.includes(ctaText)) {
      const ctaIndex = text.indexOf(ctaText);
      const beforeCta = text.slice(0, ctaIndex).trim();
      const afterCta = text.slice(ctaIndex + ctaText.length).trim();
      const overhead = ctaText.length + (afterCta ? afterCta.length + 4 : 2) + 3;
      const availableForBody = maxChars - overhead;

      if (availableForBody > 20) {
        const trimmedBody = beforeCta.slice(0, availableForBody).trim() + "...";
        text = afterCta ? `${trimmedBody}\n\n${ctaText}\n\n${afterCta}` : `${trimmedBody}\n\n${ctaText}`;
      } else {
        text = text.slice(0, maxChars - 3).trim() + "...";
      }
    } else {
      text = text.slice(0, maxChars - 3).trim() + "...";
    }
  }

  return text;
}

/**
 * Builds final platform-specific captions from a validated manifest.
 * @param {object} manifest Valid publication manifest
 * @returns {{ instagram: string, facebook: string, threads: string }}
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

  // Threads caption formatted from manifest captions.threads or fallback to instagram/facebook
  const rawThreads = manifest.captions.threads || manifest.captions.instagram || manifest.captions.facebook;
  const threads = formatThreadsCaption({ baseCaption: rawThreads });

  return {
    instagram,
    facebook,
    threads
  };
}

module.exports = {
  INSTAGRAM_BIO_CTA,
  FACEBOOK_WEB_CTA,
  FACEBOOK_WEBSITE_URL,
  THREADS_WEB_CTA,
  THREADS_WEBSITE_URL,
  FACEBOOK_FINAL_CAPTION_MAX,
  INSTAGRAM_FINAL_CAPTION_MAX,
  THREADS_FINAL_CAPTION_MAX,
  formatThreadsCaption,
  buildPlatformCaptions
};
