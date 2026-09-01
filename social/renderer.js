/**
 * Deterministic Social Carousel Renderer for DreamlyAI
 *
 * Renders validated social content envelopes into high-contrast 1080x1350 JPEG slide buffers
 * using in-memory SVG generation and Sharp.
 */

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

// Deterministic celestial star coordinates
const STAR_COORDINATES = Object.freeze([
  { cx: 120, cy: 190, r: 2.0, o: 0.4 },
  { cx: 280, cy: 140, r: 1.5, o: 0.3 },
  { cx: 450, cy: 180, r: 2.5, o: 0.5 },
  { cx: 620, cy: 130, r: 1.8, o: 0.35 },
  { cx: 890, cy: 160, r: 2.2, o: 0.6 },
  { cx: 960, cy: 260, r: 1.5, o: 0.25 },
  { cx: 140, cy: 380, r: 1.8, o: 0.3 },
  { cx: 980, cy: 490, r: 2.0, o: 0.45 },
  { cx: 110, cy: 750, r: 1.5, o: 0.25 },
  { cx: 990, cy: 820, r: 2.2, o: 0.4 },
  { cx: 160, cy: 1100, r: 2.0, o: 0.35 },
  { cx: 340, cy: 1220, r: 1.5, o: 0.3 },
  { cx: 780, cy: 1200, r: 2.5, o: 0.5 },
  { cx: 920, cy: 1140, r: 1.8, o: 0.4 }
]);

/**
 * Escapes unsafe characters for valid SVG/XML output.
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
 * Deterministically wraps text on word boundaries and validates line limits.
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
    } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
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
      `Text layout overflow: content wrapped to ${lines.length} lines, exceeding maximum allowed limit of ${maxLines} lines.`
    );
  }

  return lines;
}

/**
 * Renders SVG text element with tspans for multi-line layout.
 * @param {string[]} lines
 * @param {number} x
 * @param {number} startY
 * @param {number} lineHeight
 * @param {object} [options]
 * @returns {string}
 */
function renderSvgText(lines, x, startY, lineHeight, options = {}) {
  const {
    anchor = "start",
    fill = THEME.primaryText,
    fontSize = 32,
    fontWeight = "400",
    letterSpacing = 0
  } = options;

  const letterSpacingAttr = letterSpacing ? ` letter-spacing="${letterSpacing}"` : "";

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  return `<text x="${x}" y="${startY}" font-family="${TYPOGRAPHY.fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="${anchor}"${letterSpacingAttr}>${tspans}</text>`;
}

/**
 * Generates common SVG definitions and background.
 * @param {number} slideIndex 1-based index
 * @returns {string}
 */
function generateBackgroundSvg(slideIndex) {
  const starsSvg = STAR_COORDINATES.map(
    (star) =>
      `<circle cx="${star.cx}" cy="${star.cy}" r="${star.r}" fill="#ffffff" opacity="${star.o}" />`
  ).join("\n    ");

  return `
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${THEME.bgPrimary}" />
      <stop offset="50%" stop-color="${THEME.bgNavy}" />
      <stop offset="100%" stop-color="${THEME.bgIndigo}" />
    </linearGradient>

    <radialGradient id="celestialGlow" cx="50%" cy="25%" r="65%">
      <stop offset="0%" stop-color="${THEME.accentIndigo}" stop-opacity="0.32" />
      <stop offset="50%" stop-color="${THEME.accentPurple}" stop-opacity="0.12" />
      <stop offset="100%" stop-color="${THEME.bgPrimary}" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${THEME.accentBlue}" />
      <stop offset="100%" stop-color="${THEME.secondaryText}" />
    </linearGradient>

    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${THEME.accentIndigo}" />
      <stop offset="100%" stop-color="${THEME.accentPurple}" />
    </linearGradient>

    <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${THEME.buttonGradStart}" />
      <stop offset="100%" stop-color="${THEME.buttonGradEnd}" />
    </linearGradient>
  </defs>

  <!-- Base background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)" />

  <!-- Celestial ambient glow -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#celestialGlow)" />

  <!-- Celestial stars -->
  <g id="stars">
    ${starsSvg}
  </g>

  <!-- Header Branding -->
  <g id="header">
    <text x="${LAYOUT.marginX}" y="${LAYOUT.headerY}" font-family="${TYPOGRAPHY.fontFamily}" font-size="${TYPOGRAPHY.brandFontSize}" font-weight="800" fill="url(#brandGrad)" letter-spacing="${TYPOGRAPHY.brandLetterSpacing}">${BRAND_NAME.toUpperCase()}</text>
    <text x="${WIDTH - LAYOUT.marginX}" y="${LAYOUT.headerY}" font-family="${TYPOGRAPHY.fontFamily}" font-size="${TYPOGRAPHY.slideNumberFontSize}" font-weight="600" fill="${THEME.mutedText}" text-anchor="end">${slideIndex} / 5</text>
  </g>
`;
}

/**
 * Generates SVG markup for Slide 1 (Cover).
 * @param {object} slide
 * @returns {string}
 */
function generateCoverSlideSvg(slide) {
  const bg = generateBackgroundSvg(1);

  const headlineLines = wrapText(
    slide.headline,
    TYPOGRAPHY.coverMaxCharsPerLine,
    TYPOGRAPHY.coverMaxHeadlineLines
  );
  const subheadlineLines = wrapText(
    slide.subheadline,
    40,
    TYPOGRAPHY.coverMaxSubheadlineLines
  );

  const headlineSvg = renderSvgText(
    headlineLines,
    LAYOUT.marginX,
    500,
    TYPOGRAPHY.coverHeadlineLineHeight,
    {
      anchor: "start",
      fill: THEME.primaryText,
      fontSize: TYPOGRAPHY.coverHeadlineFontSize,
      fontWeight: "800"
    }
  );

  const headlineHeight = (headlineLines.length - 1) * TYPOGRAPHY.coverHeadlineLineHeight;
  const subheadlineStartY = 500 + headlineHeight + 80;

  const subheadlineSvg = renderSvgText(
    subheadlineLines,
    LAYOUT.marginX,
    subheadlineStartY,
    TYPOGRAPHY.coverSubheadlineLineHeight,
    {
      anchor: "start",
      fill: THEME.secondaryText,
      fontSize: TYPOGRAPHY.coverSubheadlineFontSize,
      fontWeight: "400"
    }
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  ${bg}

  <!-- Cover Celestial Artwork -->
  <g transform="translate(180, 240)">
    <circle cx="80" cy="80" r="70" fill="none" stroke="url(#accentGrad)" stroke-width="2.5" opacity="0.6" />
    <path d="M 80 20 A 60 60 0 1 0 80 140 A 45 45 0 1 1 80 20" fill="url(#btnGrad)" opacity="0.85" />
    <circle cx="210" cy="50" r="3.5" fill="${THEME.accentBlue}" opacity="0.8" />
    <circle cx="250" cy="110" r="2.5" fill="${THEME.accentPurple}" opacity="0.6" />
    <line x1="80" y1="80" x2="210" y2="50" stroke="${THEME.accentBlue}" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" />
    <line x1="210" y1="50" x2="250" y2="110" stroke="${THEME.accentPurple}" stroke-width="1" stroke-dasharray="3,3" opacity="0.4" />
  </g>

  <!-- Cover Copy -->
  ${headlineSvg}
  ${subheadlineSvg}

  <!-- Footer swipe hint -->
  <g id="footer">
    <text x="${WIDTH / 2}" y="${LAYOUT.footerY}" font-family="${TYPOGRAPHY.fontFamily}" font-size="22" font-weight="600" fill="${THEME.mutedText}" text-anchor="middle" letter-spacing="1">Swipe to explore →</text>
  </g>
</svg>`;
}

/**
 * Generates SVG markup for Slides 2–4 (Content).
 * @param {object} slide
 * @param {number} slideIndex 1-based index (2, 3, or 4)
 * @returns {string}
 */
function generateContentSlideSvg(slide, slideIndex) {
  const bg = generateBackgroundSvg(slideIndex);

  const titleLines = wrapText(
    slide.title,
    TYPOGRAPHY.contentMaxTitleCharsPerLine,
    TYPOGRAPHY.contentMaxTitleLines
  );
  const bodyLines = wrapText(
    slide.body,
    TYPOGRAPHY.contentMaxBodyCharsPerLine,
    TYPOGRAPHY.contentMaxBodyLines
  );

  const titleStartY = LAYOUT.cardY + 140;
  const titleSvg = renderSvgText(
    titleLines,
    LAYOUT.cardX + 60,
    titleStartY,
    TYPOGRAPHY.contentTitleLineHeight,
    {
      anchor: "start",
      fill: THEME.primaryText,
      fontSize: TYPOGRAPHY.contentTitleFontSize,
      fontWeight: "700"
    }
  );

  const titleHeight = (titleLines.length - 1) * TYPOGRAPHY.contentTitleLineHeight;
  const dividerY = titleStartY + titleHeight + 50;
  const bodyStartY = dividerY + 60;

  const bodySvg = renderSvgText(
    bodyLines,
    LAYOUT.cardX + 60,
    bodyStartY,
    TYPOGRAPHY.contentBodyLineHeight,
    {
      anchor: "start",
      fill: THEME.bodyText,
      fontSize: TYPOGRAPHY.contentBodyFontSize,
      fontWeight: "400"
    }
  );

  // Restrained decorative motif determined solely by slide index
  const accentOffset = (slideIndex - 2) * 40;
  const motifX = LAYOUT.cardX + LAYOUT.cardWidth - 100;
  const motifY = LAYOUT.cardY + LAYOUT.cardHeight - 90;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  ${bg}

  <!-- Content Glass Card -->
  <rect x="${LAYOUT.cardX}" y="${LAYOUT.cardY}" width="${LAYOUT.cardWidth}" height="${LAYOUT.cardHeight}" rx="${LAYOUT.cardRadius}" fill="${THEME.cardBg}" stroke="${THEME.cardBorder}" stroke-width="1.5" />

  <!-- Accent indicator bar -->
  <rect x="${LAYOUT.cardX + 60}" y="${LAYOUT.cardY + 60}" width="50" height="5" rx="2.5" fill="url(#accentGrad)" />

  <!-- Content Text -->
  ${titleSvg}

  <!-- Card Divider -->
  <line x1="${LAYOUT.cardX + 60}" y1="${dividerY}" x2="${LAYOUT.cardX + LAYOUT.cardWidth - 60}" y2="${dividerY}" stroke="${THEME.cardBorder}" stroke-width="1.5" />

  ${bodySvg}

  <!-- Deterministic Decorative Corner Motif -->
  <g transform="translate(${motifX}, ${motifY})">
    <circle cx="0" cy="0" r="${18 + accentOffset * 0.1}" fill="none" stroke="${THEME.accentIndigo}" stroke-width="1.5" opacity="0.3" />
    <circle cx="0" cy="0" r="3" fill="${THEME.accentBlue}" opacity="0.5" />
  </g>

  <!-- Footer Brand Accent -->
  <g id="footer">
    <text x="${LAYOUT.marginX}" y="${LAYOUT.footerY}" font-family="${TYPOGRAPHY.fontFamily}" font-size="20" font-weight="500" fill="${THEME.mutedText}">${BRAND_NAME} Reflections</text>
  </g>
</svg>`;
}

/**
 * Generates SVG markup for Slide 5 (CTA).
 * @param {object} slide
 * @returns {string}
 */
function generateCtaSlideSvg(slide) {
  const bg = generateBackgroundSvg(5);

  const headlineLines = wrapText(
    slide.headline,
    TYPOGRAPHY.ctaMaxHeadlineCharsPerLine,
    TYPOGRAPHY.ctaMaxHeadlineLines
  );
  const bodyLines = wrapText(
    slide.body,
    TYPOGRAPHY.ctaMaxBodyCharsPerLine,
    TYPOGRAPHY.ctaMaxBodyLines
  );

  const headlineStartY = LAYOUT.cardY + 170;
  const headlineSvg = renderSvgText(
    headlineLines,
    WIDTH / 2,
    headlineStartY,
    TYPOGRAPHY.ctaHeadlineLineHeight,
    {
      anchor: "middle",
      fill: THEME.primaryText,
      fontSize: TYPOGRAPHY.ctaHeadlineFontSize,
      fontWeight: "800"
    }
  );

  const headlineHeight = (headlineLines.length - 1) * TYPOGRAPHY.ctaHeadlineLineHeight;
  const bodyStartY = headlineStartY + headlineHeight + 70;

  const bodySvg = renderSvgText(
    bodyLines,
    WIDTH / 2,
    bodyStartY,
    TYPOGRAPHY.ctaBodyLineHeight,
    {
      anchor: "middle",
      fill: THEME.secondaryText,
      fontSize: TYPOGRAPHY.ctaBodyFontSize,
      fontWeight: "400"
    }
  );

  const buttonX = (WIDTH - LAYOUT.buttonWidth) / 2;
  const buttonY = LAYOUT.cardY + LAYOUT.cardHeight - 200;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  ${bg}

  <!-- CTA Glass Card -->
  <rect x="${LAYOUT.cardX}" y="${LAYOUT.cardY}" width="${LAYOUT.cardWidth}" height="${LAYOUT.cardHeight}" rx="${LAYOUT.cardRadius}" fill="${THEME.cardBg}" stroke="${THEME.cardBorder}" stroke-width="1.5" />

  <!-- CTA Top Celestial Motif -->
  <g transform="translate(${WIDTH / 2}, ${LAYOUT.cardY + 70})">
    <circle cx="0" cy="0" r="22" fill="none" stroke="url(#accentGrad)" stroke-width="1.5" opacity="0.7" />
    <circle cx="0" cy="0" r="4" fill="${THEME.accentBlue}" opacity="0.9" />
  </g>

  <!-- CTA Text -->
  ${headlineSvg}
  ${bodySvg}

  <!-- Deterministic Static CTA Button Pill -->
  <g id="cta-button" transform="translate(${buttonX}, ${buttonY})">
    <rect width="${LAYOUT.buttonWidth}" height="${LAYOUT.buttonHeight}" rx="${LAYOUT.buttonRadius}" fill="url(#btnGrad)" />
    <text x="${LAYOUT.buttonWidth / 2}" y="${LAYOUT.buttonHeight / 2 + 10}" text-anchor="middle" font-family="${TYPOGRAPHY.fontFamily}" font-size="${TYPOGRAPHY.ctaButtonFontSize}" font-weight="700" fill="#ffffff" letter-spacing="1.5">${escapeXml(CTA_BUTTON_TEXT)}</text>
  </g>

  <!-- Footer -->
  <g id="footer">
    <text x="${WIDTH / 2}" y="${LAYOUT.footerY}" font-family="${TYPOGRAPHY.fontFamily}" font-size="20" font-weight="500" fill="${THEME.mutedText}" text-anchor="middle">DreamlyAI</text>
  </g>
</svg>`;
}

/**
 * Generates SVG string for a given slide by role and 1-based index.
 * @param {object} slide
 * @param {number} slideIndex 1-based index
 * @returns {string}
 */
function generateSlideSvg(slide, slideIndex) {
  if (slide.role === "cover") {
    return generateCoverSlideSvg(slide);
  }
  if (slide.role === "content") {
    return generateContentSlideSvg(slide, slideIndex);
  }
  if (slide.role === "cta") {
    return generateCtaSlideSvg(slide);
  }
  throw new Error(`Unsupported slide role: '${slide.role}' at slide index ${slideIndex}`);
}

/**
 * Validates generated slide JPEG buffer against renderer integrity constraints.
 * @param {Buffer} buffer
 * @param {number} slideIndex
 */
async function validateRenderedBuffer(buffer, slideIndex) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(`Slide ${slideIndex} output is not a Buffer`);
  }

  const meta = await sharp(buffer).metadata();

  if (meta.format !== FORMAT) {
    throw new Error(
      `Slide ${slideIndex} format mismatch: expected '${FORMAT}', received '${meta.format}'`
    );
  }

  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    throw new Error(
      `Slide ${slideIndex} dimensions mismatch: expected ${WIDTH}x${HEIGHT}, received ${meta.width}x${meta.height}`
    );
  }

  if (buffer.length <= 10000) {
    throw new Error(
      `Slide ${slideIndex} buffer byteLength (${buffer.length}) is too small (must be > 10000 bytes)`
    );
  }
}

/**
 * Renders a full deterministic carousel from prepared content into JPEG buffers.
 * @param {object} preparedContent Validated prepared content envelope
 * @returns {Promise<{ width: number, height: number, format: string, slideCount: number, slides: Array<{ index: number, role: string, buffer: Buffer, byteLength: number }> }>}
 */
async function renderCarousel(preparedContent) {
  const validation = validatePreparedContent(preparedContent);
  if (!validation.valid) {
    throw new Error(
      `Invalid prepared content for rendering: ${validation.errors.join("; ")}`
    );
  }

  const renderedSlides = [];

  for (let i = 0; i < preparedContent.creative.slides.length; i++) {
    const slide = preparedContent.creative.slides[i];
    const slideIndex = i + 1; // 1-based index

    const svg = generateSlideSvg(slide, slideIndex);

    const jpegBuffer = await sharp(Buffer.from(svg))
      .jpeg({
        quality: 90,
        chromaSubsampling: "4:4:4"
      })
      .toBuffer();

    await validateRenderedBuffer(jpegBuffer, slideIndex);

    renderedSlides.push({
      index: slideIndex,
      role: slide.role,
      buffer: jpegBuffer,
      byteLength: jpegBuffer.length
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
  validateRenderedBuffer,
  escapeXml,
  wrapText
};
