// test/socialRenderer.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const { buildPreparedContent } = require("../social/contentSchema");
const {
  renderCarousel,
  generateSlideSvg,
  escapeXml,
  wrapText
} = require("../social/renderer");
const {
  WIDTH,
  HEIGHT,
  FORMAT,
  CTA_BUTTON_TEXT
} = require("../social/renderConfig");

function createValidCreativePayload(overrides = {}) {
  return {
    topic: overrides.topic || "Water and Ocean Dreams",
    slides: overrides.slides || [
      {
        role: "cover",
        headline: "What Does It Mean When You Dream of Oceans?",
        subheadline: "Explore the psychological symbolism of deep water in dreams."
      },
      {
        role: "content",
        title: "Calm Waters & Peace",
        body: "Tranquil oceans in dreams may reflect inner emotional clarity and a sense of calm in waking life."
      },
      {
        role: "content",
        title: "Turbulent Waves & Stress",
        body: "High waves and stormy seas can symbolize feeling overwhelmed by recent emotional challenges."
      },
      {
        role: "content",
        title: "Diving into the Depths",
        body: "Exploring underwater realms might suggest readiness to uncover subconscious thoughts and memories."
      },
      {
        role: "cta",
        headline: "Track Your Dreams Tonight",
        body: "Reflect on your nighttime thoughts and journal with DreamlyAI."
      }
    ],
    captions: overrides.captions || {
      instagram: "Have you ever dreamed of open water? Water often reflects our emotional state. What was your most memorable water dream? #dreamlyai #dreamsymbols",
      facebook: "Water in dreams often mirrors our emotional landscape. Calm seas may signify clarity, while stormy waters can indicate stress. What have your dreams looked like lately?"
    }
  };
}

describe("Social Carousel Renderer", () => {
  it("1. valid prepared content renders successfully", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    assert.equal(result.width, WIDTH);
    assert.equal(result.height, HEIGHT);
    assert.equal(result.format, FORMAT);
  });

  it("2. exactly 5 slides are returned", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    assert.equal(result.slideCount, 5);
    assert.equal(result.slides.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(result.slides[i].index, i + 1);
    }
  });

  it("3. roles remain cover/content/content/content/cta", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    const roles = result.slides.map((s) => s.role);
    assert.deepEqual(roles, ["cover", "content", "content", "content", "cta"]);
  });

  it("4. every output is a Buffer", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    for (const slide of result.slides) {
      assert.equal(Buffer.isBuffer(slide.buffer), true);
      assert.equal(typeof slide.byteLength, "number");
      assert.equal(slide.byteLength, slide.buffer.length);
    }
  });

  it("5. every slide is valid JPEG", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    for (const slide of result.slides) {
      const meta = await sharp(slide.buffer).metadata();
      assert.equal(meta.format, "jpeg");
    }
  });

  it("6. every slide is exactly 1080x1350", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    for (const slide of result.slides) {
      const meta = await sharp(slide.buffer).metadata();
      assert.equal(meta.width, 1080);
      assert.equal(meta.height, 1350);
    }
  });

  it("7. every JPEG is > 10000 bytes", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result = await renderCarousel(prepared);
    for (const slide of result.slides) {
      assert.equal(
        slide.buffer.length > 10000,
        true,
        `Slide ${slide.index} byte length (${slide.buffer.length}) must be > 10000`
      );
    }
  });

  it("8. malformed prepared content is rejected before rendering", async () => {
    const malformedPrepared = {
      schemaVersion: 1,
      publishDate: "2026-08-28",
      contentId: "social-2026-08-28",
      category: "dream_symbols",
      slideCount: 5,
      creative: {
        topic: "Malformed",
        slides: [] // empty slides
      }
    };

    await assert.rejects(
      async () => renderCarousel(malformedPrepared),
      /Invalid prepared content for rendering/i
    );
  });

  it("9. wrong contentId is rejected", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const wrongContentId = { ...prepared, contentId: "custom-id-invalid" };
    await assert.rejects(
      async () => renderCarousel(wrongContentId),
      /Invalid contentId/i
    );
  });

  it("10. wrong slideCount is rejected", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const wrongSlideCount = { ...prepared, slideCount: 4 };
    await assert.rejects(
      async () => renderCarousel(wrongSlideCount),
      /Invalid slideCount/i
    );
  });

  it("11. XML-sensitive text renders safely without breaking SVG", async () => {
    const creative = createValidCreativePayload({
      slides: [
        {
          role: "cover",
          headline: 'Dreams & Symbols <Meaning> "Maybe"',
          subheadline: "Testing & <XML> 'quotes' & special \"characters\"."
        },
        {
          role: "content",
          title: "Water & Fire: <Conflict>",
          body: "When symbols 'clash' & interact, meaning <emerges> dynamically."
        },
        {
          role: "content",
          title: 'Title with "Quotes" & More',
          body: "Testing body with <tags> & 'single quotes' and \"double quotes\"."
        },
        {
          role: "content",
          title: "Symbol & Metaphor",
          body: "Body text & insights <safely> handled without 'breaks'."
        },
        {
          role: "cta",
          headline: "Reflect & Understand Tonight",
          body: "Journal 'thoughts' & uncover <hidden> patterns with DreamlyAI."
        }
      ]
    });

    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative
    });

    const result = await renderCarousel(prepared);
    assert.equal(result.slides.length, 5);
    for (const slide of result.slides) {
      assert.equal(slide.buffer.length > 10000, true);
    }
  });

  it("12. normal Unicode text renders without crashing", async () => {
    const creative = createValidCreativePayload({
      slides: [
        {
          role: "cover",
          headline: "Rêves & Mystères nocturnes",
          subheadline: "Exploration des émotions profondes et archétypes."
        },
        {
          role: "content",
          title: "Sogni & Emozioni",
          body: "Comprendere i sogni può favorire la chiarezza interiore e la riflessione."
        },
        {
          role: "content",
          title: "Träume verstehen",
          body: "Nächtliche Bilder spiegeln oft unbewusste Gedanken und Gefühle wider."
        },
        {
          role: "content",
          title: "Sueños y Reflexión",
          body: "Las imágenes oníricas pueden reflejar aspectos importantes de la vida despierta."
        },
        {
          role: "cta",
          headline: "Découvrez vos rêves",
          body: "Notez vos réflexions nocturnes avec DreamlyAI."
        }
      ]
    });

    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative
    });

    const result = await renderCarousel(prepared);
    assert.equal(result.slides.length, 5);
  });

  it("13. repeated rendering of the same input produces identical JPEG buffers within the same runtime", async () => {
    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    const result1 = await renderCarousel(prepared);
    const result2 = await renderCarousel(prepared);

    assert.equal(result1.slides.length, result2.slides.length);
    for (let i = 0; i < result1.slides.length; i++) {
      const buf1 = result1.slides[i].buffer;
      const buf2 = result2.slides[i].buffer;
      assert.equal(
        buf1.equals(buf2),
        true,
        `Slide ${i + 1} JPEG buffer is not byte-identical across runs`
      );
    }
  });

  it("14. renderer does not write any output files into the repository", async () => {
    const rootDir = path.resolve(__dirname, "..");
    const filesBefore = fs.readdirSync(rootDir);
    const socialBefore = fs.readdirSync(path.join(rootDir, "social"));

    const prepared = buildPreparedContent({
      publishDate: "2026-08-28",
      category: "dream_symbols",
      creative: createValidCreativePayload()
    });

    await renderCarousel(prepared);

    const filesAfter = fs.readdirSync(rootDir);
    const socialAfter = fs.readdirSync(path.join(rootDir, "social"));

    assert.deepEqual(filesBefore, filesAfter);
    assert.deepEqual(socialBefore, socialAfter);
  });

  it("15. CTA slide contains the static CTA treatment logically in the generated SVG/render path", () => {
    const ctaSlide = {
      role: "cta",
      headline: "Track Your Dreams Tonight",
      body: "Reflect on your nighttime thoughts and journal with DreamlyAI."
    };

    const svg = generateSlideSvg(ctaSlide, 5);
    assert.match(svg, new RegExp(CTA_BUTTON_TEXT, "i"));
    assert.match(svg, /id="cta-button"/i);
  });
});
