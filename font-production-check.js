const fs = require("node:fs");
const { buildPreparedContent } = require("./social/contentSchema");
const { renderCarousel } = require("./social/renderer");

const creative = {
  topic: "Dreams and Emotional Clarity",
  slides: [
    {
      role: "cover",
      headline: "What Do Your Dreams Reveal?",
      subheadline: "Explore the hidden symbolism behind your nighttime experiences."
    },
    {
      role: "content",
      title: "Dreams & Emotions",
      body: "Dreams can reflect emotions, memories, and thoughts that remain active beneath the surface."
    },
    {
      role: "content",
      title: "Recurring Symbols",
      body: "Repeated people, places, or situations may point toward patterns worth exploring."
    },
    {
      role: "content",
      title: "Inner Reflection",
      body: "Writing down your dreams can help you notice connections between your dreams and waking life."
    },
    {
      role: "cta",
      headline: "Understand Your Dreams",
      body: "Explore your dreams with DreamlyAI."
    }
  ],
  captions: {
    instagram: "What do your dreams reveal? Explore the hidden symbolism behind your nighttime experiences. #dreamlyai #dreamsymbols",
    facebook: "Dreams can reflect emotions, memories, and thoughts beneath the surface. What has your dream life been telling you lately?"
  }
};

(async () => {
  const prepared = buildPreparedContent({
    publishDate: "2026-09-02",
    category: "dream_symbols",
    creative
  });

  const result = await renderCarousel(prepared);

  for (const slide of result.slides) {
    fs.writeFileSync(
      `font-production-check-${slide.index}.jpg`,
      slide.buffer
    );
  }

  console.log(`CREATED ${result.slides.length} English production slides`);
})();
