/**
 * Deterministic Social Carousel Renderer for Dreamly AI
 *
 * Renders validated social content envelopes into 1080x1350 JPEG slide buffers
 * using fixed carousel background assets, in-memory SVG generation, and Sharp.
 */

const path = require("path");
const fs = require("fs");

// This must happen before sharp is required so bundled fonts are available.
const FONT_DIR = path.join(__dirname, "fonts");
process.env.FONTCONFIG_PATH = FONT_DIR;

const sharp = require("sharp");

const {
  WIDTH,
  HEIGHT,
  FORMAT,
  BRAND_NAME,
  CTA_BUTTON_TEXT,
  THEME,
  TYPOGRAPHY,
  LAYOUT
} = require("./renderConfig");

const { validatePreparedContent } = require("./contentSchema");

const CAROUSEL_BACKGROUND_DIR = path.join(
  __dirname,
  "assets",
  "carousel-backgrounds"
);

const CAROUSEL_BACKGROUNDS = Object.freeze({
  1: "cover.jpg",
  2: "content-emotions.jpg",
  3: "content-symbols.jpg",
  4: "content-journal.jpg",
  5: "cta.jpg"
});

/**
 * Escapes unsafe characters for valid SVG/XML output.
 *
 * @param {string} unsafe
 * @returns {string}
 */
function escapeXml(unsafe) {
  if (typeof unsafe !== "string") return "";

  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Deterministically wraps text on word boundaries.
 *
 * @param {string} text
 * @param {number} maxCharsPerLine
 * @param {number} [maxLines]
 * @returns {string[]}
 */
function wrapText(text, maxCharsPerLine, maxLines) {
  if (typeof text !== "string") return [];

  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) return [];

  const words = normalized.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (
      currentLine.length + 1 + word.length <= maxCharsPerLine
    ) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (maxLines && lines.length > maxLines) {
    throw new Error(
      "Text layout overflow: content wrapped to " +
        lines.length +
        " lines, exceeding maximum allowed limit of " +
        maxLines +
        " lines."
    );
  }

  return lines;
}

/**
 * Renders SVG text element with tspans for multi-line layout.
 *
 * @param {string[]} lines
 * @param {number} x
 * @param {number} startY
 * @param {number} lineHeight
 * @param {object} [options]
 * @returns {string}
 */
function renderSvgText(lines, x, startY, lineHeight, options = {}) {
  const {
    fontSize = 32,
    fontWeight = 400,
    fill = THEME.bodyText,
    anchor = "start",
    letterSpacing = 0,
    opacity = 1
  } = options;

  if (!Array.isArray(lines) || lines.length === 0) {
    return "";
  }

  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;

      return (
        '<tspan x="' +
        x +
        '" dy="' +
        dy +
        '">' +
        escapeXml(line) +
        "</tspan>"
      );
    })
    .join("");

  return (
    '<text x="' +
    x +
    '" y="' +
    startY +
    '" ' +
    'font-family="' +
    escapeXml(TYPOGRAPHY.fontFamily) +
    '" ' +
    'font-size="' +
    fontSize +
    '" ' +
    'font-weight="' +
    fontWeight +
    '" ' +
    'fill="' +
    escapeXml(fill) +
    '" ' +
    'text-anchor="' +
    anchor +
    '" ' +
    'letter-spacing="' +
    letterSpacing +
    '" ' +
    'opacity="' +
    opacity +
    '">' +
    tspans +
    "</text>"
  );
}

/**
 * Returns the fixed background asset path for a slide.
 *
 * @param {number} slideIndex
 * @returns {string}
 */
function getCarouselBackgroundPath(slideIndex) {
  const filename = CAROUSEL_BACKGROUNDS[slideIndex];

  if (!filename) {
    throw new Error(
      "No carousel background configured for slide " + slideIndex
    );
  }

  const backgroundPath = path.join(
    CAROUSEL_BACKGROUND_DIR,
    filename
  );

  if (!fs.existsSync(backgroundPath)) {
    throw new Error(
      "Carousel background asset not found: " + backgroundPath
    );
  }

  return backgroundPath;
}

/**
 * Returns the fixed background image as a base64 data URI.
 *
 * @param {number} slideIndex
 * @returns {string}
 */
function getCarouselBackgroundDataUri(slideIndex) {
  const backgroundPath = getCarouselBackgroundPath(slideIndex);
  const imageData = fs.readFileSync(backgroundPath).toString("base64");

  return "data:image/jpeg;base64," + imageData;
}

/**
 * Generates the common fixed background and header.
 *
 * @param {number} slideIndex
 * @returns {string}
 */
function generateBackgroundSvg(slideIndex) {
  const backgroundDataUri =
    getCarouselBackgroundDataUri(slideIndex);

  const brand = escapeXml(BRAND_NAME);

  return (
    '<image href="' +
    backgroundDataUri +
    '" x="0" y="0" width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" preserveAspectRatio="none" />' +
    '<rect x="0" y="0" width="' +
    WIDTH +
    '" height="180" fill="#000000" opacity="0.16" />' +
    '<g id="header">' +
    '<text x="' +
    LAYOUT.marginX +
    '" y="' +
    LAYOUT.headerY +
    '" ' +
    'font-family="' +
    escapeXml(TYPOGRAPHY.fontFamily) +
    '" ' +
    'font-size="' +
    TYPOGRAPHY.brandFontSize +
    '" ' +
    'font-weight="700" ' +
    'fill="' +
    escapeXml(THEME.primaryText) +
    '" ' +
    'letter-spacing="' +
    TYPOGRAPHY.brandLetterSpacing +
    '">' +
    brand +
    "</text>" +
    '<text x="' +
    (WIDTH - LAYOUT.marginX) +
    '" y="' +
    LAYOUT.headerY +
    '" ' +
    'font-family="' +
    escapeXml(TYPOGRAPHY.fontFamily) +
    '" ' +
    'font-size="' +
    TYPOGRAPHY.slideNumberFontSize +
    '" ' +
    'font-weight="600" ' +
    'fill="' +
    escapeXml(THEME.primaryText) +
    '" ' +
    'text-anchor="end">' +
    slideIndex +
    " / 5" +
    "</text>" +
    "</g>"
  );
}

/**
 * Generates cover slide SVG.
 *
 * @param {object} slide
 * @returns {string}
 */
function generateCoverSlideSvg(slide) {
  const headlineLines = wrapText(
    slide.headline || "",
    TYPOGRAPHY.coverMaxCharsPerLine,
    TYPOGRAPHY.coverMaxHeadlineLines
  );

  const subheadlineLines = wrapText(
    slide.subheadline || "",
    TYPOGRAPHY.coverMaxCharsPerLine + 8,
    TYPOGRAPHY.coverMaxSubheadlineLines
  );

  const headlineHeight =
    Math.max(headlineLines.length - 1, 0) *
    TYPOGRAPHY.coverHeadlineLineHeight;

  const headlineStartY = 555;

  const subheadlineStartY =
    headlineStartY +
    headlineHeight +
    100;

  const swipeY = 1190;

  return (
    generateBackgroundSvg(1) +
    renderSvgText(
      headlineLines,
      WIDTH / 2,
      headlineStartY,
      TYPOGRAPHY.coverHeadlineLineHeight,
      {
        fontSize: TYPOGRAPHY.coverHeadlineFontSize,
        fontWeight: 800,
        fill: THEME.primaryText,
        anchor: "middle",
        letterSpacing: 0
      }
    ) +
    renderSvgText(
      subheadlineLines,
      WIDTH / 2,
      subheadlineStartY,
      TYPOGRAPHY.coverSubheadlineLineHeight,
      {
        fontSize: TYPOGRAPHY.coverSubheadlineFontSize,
        fontWeight: 500,
        fill: THEME.secondaryText,
        anchor: "middle",
        letterSpacing: 0
      }
    ) +
    '<text x="' +
    WIDTH / 2 +
    '" y="' +
    swipeY +
    '" ' +
    'font-family="' +
    escapeXml(TYPOGRAPHY.fontFamily) +
    '" ' +
    'font-size="24" ' +
    'font-weight="600" ' +
    'fill="' +
    escapeXml(THEME.primaryText) +
    '" ' +
    'text-anchor="middle" ' +
    'letter-spacing="0">' +
    'Swipe to explore →' +
    "</text>"
  );
}

/**
 * Generates content slide SVG.
 *
 * @param {object} slide
 * @param {number} slideIndex
 * @returns {string}
 */
function generateContentSlideSvg(slide, slideIndex) {
  const titleLines = wrapText(
    slide.title || "",
    TYPOGRAPHY.contentMaxTitleCharsPerLine,
    TYPOGRAPHY.contentMaxTitleLines
  );

  const bodyLines = wrapText(
    slide.body || "",
    TYPOGRAPHY.contentMaxBodyCharsPerLine,
    TYPOGRAPHY.contentMaxBodyLines
  );

  const titleHeight =
    Math.max(titleLines.length - 1, 0) *
    TYPOGRAPHY.contentTitleLineHeight;

  const titleStartY = 500;

  const bodyStartY =
    titleStartY +
    titleHeight +
    100;

  const swipeY = 1190;

  return (
    generateBackgroundSvg(slideIndex) +
    renderSvgText(
      titleLines,
      WIDTH / 2,
      titleStartY,
      TYPOGRAPHY.contentTitleLineHeight,
      {
        fontSize: TYPOGRAPHY.contentTitleFontSize,
        fontWeight: 800,
        fill: THEME.primaryText,
        anchor: "middle",
        letterSpacing: 0
      }
    ) +
    renderSvgText(
      bodyLines,
      WIDTH / 2,
      bodyStartY,
      TYPOGRAPHY.contentBodyLineHeight,
      {
        fontSize: TYPOGRAPHY.contentBodyFontSize,
        fontWeight: 500,
        fill: THEME.bodyText,
        anchor: "middle",
        letterSpacing: 0
      }
    ) +
    '<text x="' +
    WIDTH / 2 +
    '" y="' +
    swipeY +
    '" ' +
    'font-family="' +
    escapeXml(TYPOGRAPHY.fontFamily) +
    '" ' +
    'font-size="24" ' +
    'font-weight="600" ' +
    'fill="' +
    escapeXml(THEME.primaryText) +
    '" ' +
    'text-anchor="middle" ' +
    'letter-spacing="0">' +
    'Swipe to explore →' +
    "</text>"
  );
}

/**
 * Generates CTA slide SVG.
 *
 * @param {object} slide
 * @returns {string}
 */
function generateCtaSlideSvg(slide) {
  const headlineLines = wrapText(
    slide.headline || "",
    TYPOGRAPHY.ctaMaxHeadlineCharsPerLine,
    TYPOGRAPHY.ctaMaxHeadlineLines
  );

  const bodyLines = wrapText(
    slide.body || "",
    TYPOGRAPHY.ctaMaxBodyCharsPerLine,
    TYPOGRAPHY.ctaMaxBodyLines
  );

  const headlineHeight =
    Math.max(headlineLines.length - 1, 0) *
    TYPOGRAPHY.ctaHeadlineLineHeight;

  const headlineStartY = 500;

  const bodyStartY =
    headlineStartY +
    headlineHeight +
    100;

  const buttonY = 970;
  const buttonX =
    (WIDTH - LAYOUT.buttonWidth) / 2;

  return (
    generateBackgroundSvg(5) +
    renderSvgText(
      headlineLines,
      WIDTH / 2,
      headlineStartY,
      TYPOGRAPHY.ctaHeadlineLineHeight,
      {
        fontSize: TYPOGRAPHY.ctaHeadlineFontSize,
        fontWeight: 800,
        fill: THEME.primaryText,
        anchor: "middle",
        letterSpacing: 0
      }
    ) +
    renderSvgText(
      bodyLines,
      WIDTH / 2,
      bodyStartY,
      TYPOGRAPHY.ctaBodyLineHeight,
      {
        fontSize: TYPOGRAPHY.ctaBodyFontSize,
        fontWeight: 500,
        fill: THEME.bodyText,
        anchor: "middle",
        letterSpacing: 0
      }
    ) +
    '<g id="cta-button">' +
    '<rect x="' +
    buttonX +
    '" y="' +
    buttonY +
    '" width="' +
    LAYOUT.buttonWidth +
    '" height="' +
    LAYOUT.buttonHeight +
    '" rx="' +
    LAYOUT.buttonRadius +
    '" fill="' +
    escapeXml(THEME.accentBlue) +
    '" opacity="0.96" />' +
    '<text x="' +
    WIDTH / 2 +
    '" y="' +
    (buttonY + 57) +
    '" ' +
    'font-family="' +
    escapeXml(TYPOGRAPHY.fontFamily) +
    '" ' +
    'font-size="' +
    TYPOGRAPHY.ctaButtonFontSize +
    '" ' +
    'font-weight="800" ' +
    'fill="#ffffff" ' +
    'text-anchor="middle">' +
    escapeXml(CTA_BUTTON_TEXT) +
    "</text>" +
    "</g>"
  );
}

/**
 * Generates one complete slide SVG.
 *
 * @param {object} slide
 * @param {number} slideIndex
 * @returns {string}
 */
function generateSlideSvg(slide, slideIndex) {
  let content;

  if (slideIndex === 1) {
    content = generateCoverSlideSvg(slide);
  } else if (slideIndex === 5) {
    content = generateCtaSlideSvg(slide);
  } else {
    content = generateContentSlideSvg(slide, slideIndex);
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" viewBox="0 0 ' +
    WIDTH +
    ' ' +
    HEIGHT +
    '">' +
    content +
    "</svg>"
  );
}

/**
 * Validates the final rendered image buffer.
 *
 * @param {Buffer} buffer
 * @param {number} slideIndex
 * @returns {Promise<void>}
 */
async function validateRenderedBuffer(buffer, slideIndex) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      "Rendered slide " +
        slideIndex +
        " is not a Buffer."
    );
  }

  const metadata = await sharp(buffer).metadata();

  if (metadata.format !== FORMAT) {
    throw new Error(
      "Rendered slide " +
        slideIndex +
        " has format " +
        metadata.format +
        " instead of " +
        FORMAT +
        "."
    );
  }

  if (
    metadata.width !== WIDTH ||
    metadata.height !== HEIGHT
  ) {
    throw new Error(
      "Rendered slide " +
        slideIndex +
        " has dimensions " +
        metadata.width +
        "x" +
        metadata.height +
        " instead of " +
        WIDTH +
        "x" +
        HEIGHT +
        "."
    );
  }

  if (buffer.length === 0) {
    throw new Error(
      "Rendered slide " +
        slideIndex +
        " is empty."
    );
  }
}

/**
 * Renders a validated five-slide carousel.
 *
 * No production files are written by this function.
 *
 * @param {object} preparedContent
 * @returns {Promise<object>}
 */
async function renderCarousel(preparedContent) {
  const validationResult =
    validatePreparedContent(preparedContent);

  if (
    !validationResult ||
    validationResult.valid !== true
  ) {
    const details =
      validationResult &&
      Array.isArray(validationResult.errors)
        ? validationResult.errors.join("; ")
        : "Unknown validation error";

    throw new Error(
      "Invalid prepared content for rendering: " +
        details
    );
  }

  const slides = preparedContent.creative.slides;

  if (!Array.isArray(slides) || slides.length !== 5) {
    throw new Error(
      "Invalid slideCount: expected 5 rendered slides, received " +
        (Array.isArray(slides) ? slides.length : "non-array")
    );
  }

  const renderedSlides = [];

  for (let index = 0; index < slides.length; index += 1) {
    const slideIndex = index + 1;

    const svg = generateSlideSvg(
      slides[index],
      slideIndex
    );

    const buffer = await sharp(Buffer.from(svg))
      .jpeg({
        quality: 90,
        chromaSubsampling: "4:4:4"
      })
      .toBuffer();

    await validateRenderedBuffer(
      buffer,
      slideIndex
    );

    renderedSlides.push({
      index: slideIndex,
      role: slides[index].role,
      buffer,
      byteLength: buffer.length
    });
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    format: FORMAT,
    slideCount: renderedSlides.length,
    slides: renderedSlides
  };
}

module.exports = {
  renderCarousel,
  generateSlideSvg,
  generateBackgroundSvg,
  generateCoverSlideSvg,
  generateContentSlideSvg,
  generateCtaSlideSvg,
  wrapText,
  renderSvgText,
  validateRenderedBuffer,
  getCarouselBackgroundPath
};