/**
 * Social Carousel Renderer Configuration for DreamlyAI
 *
 * Defines deterministic layout, typography, dimensions, and visual theme constants.
 */

const WIDTH = 1080;
const HEIGHT = 1350;
const FORMAT = "jpeg";

const BRAND_NAME = "DreamlyAI";
const CTA_BUTTON_TEXT = "Understand your dreams";

const THEME = Object.freeze({
  bgPrimary: "#070913",
  bgNavy: "#0c1026",
  bgIndigo: "#151c3d",
  primaryText: "#ffffff",
  secondaryText: "#c7d2fe",
  bodyText: "#e2e8f0",
  mutedText: "#94a3b8",
  accentIndigo: "#6366f1",
  accentPurple: "#8b5cf6",
  accentBlue: "#38bdf8",
  accentCyan: "#06b6d4",
  cardBg: "rgba(255, 255, 255, 0.035)",
  cardBorder: "rgba(255, 255, 255, 0.09)",
  cardBorderGlow: "rgba(165, 180, 252, 0.18)",
  buttonGradStart: "#6366f1",
  buttonGradEnd: "#8b5cf6"
});

const TYPOGRAPHY = Object.freeze({
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  brandFontSize: 28,
  brandLetterSpacing: 4,
  slideNumberFontSize: 22,
  
  // Cover slide
  coverHeadlineFontSize: 56,
  coverHeadlineLineHeight: 74,
  coverSubheadlineFontSize: 32,
  coverSubheadlineLineHeight: 48,
  coverMaxCharsPerLine: 28,
  coverMaxHeadlineLines: 4,
  coverMaxSubheadlineLines: 4,
  
  // Content slides
  contentTitleFontSize: 50,
  contentTitleLineHeight: 66,
  contentBodyFontSize: 32,
  contentBodyLineHeight: 50,
  contentMaxTitleCharsPerLine: 30,
  contentMaxBodyCharsPerLine: 44,
  contentMaxTitleLines: 3,
  contentMaxBodyLines: 8,
  
  // CTA slide
  ctaHeadlineFontSize: 54,
  ctaHeadlineLineHeight: 72,
  ctaBodyFontSize: 32,
  ctaBodyLineHeight: 50,
  ctaButtonFontSize: 28,
  ctaMaxHeadlineCharsPerLine: 28,
  ctaMaxBodyCharsPerLine: 42,
  ctaMaxHeadlineLines: 3,
  ctaMaxBodyLines: 5
});

const LAYOUT = Object.freeze({
  marginX: 80,
  marginY: 90,
  contentWidth: 920, // 1080 - 2 * 80
  headerY: 120,
  footerY: 1250,
  cardX: 80,
  cardY: 220,
  cardWidth: 920,
  cardHeight: 960,
  cardRadius: 28,
  buttonWidth: 620,
  buttonHeight: 88,
  buttonRadius: 44
});

module.exports = {
  WIDTH,
  HEIGHT,
  FORMAT,
  BRAND_NAME,
  CTA_BUTTON_TEXT,
  THEME,
  TYPOGRAPHY,
  LAYOUT
};
