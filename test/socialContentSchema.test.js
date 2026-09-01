// test/socialContentSchema.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  SOCIAL_SCHEMA_VERSION,
  SLIDE_COUNT,
  SLIDE_ROLES,
  SUPPORTED_PLATFORMS,
  GOOGLE_PLAY_URL,
  TEXT_LIMITS
} = require("../social/config");

const {
  TOPIC_CATEGORIES,
  TOPIC_CATEGORY_IDS,
  getTopicCategoryForDate,
  isValidDateString
} = require("../social/topics");

const {
  validateCreativePayload,
  buildPreparedContent,
  validatePreparedContent
} = require("../social/contentSchema");

function createValidCreativePayload() {
  return {
    topic: "Water and Ocean Dreams",
    slides: [
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
    captions: {
      instagram: "Have you ever dreamed of open water? Water often reflects our emotional state. What was your most memorable water dream? #dreamlyai #dreamsymbols",
      facebook: "Water in dreams often mirrors our emotional landscape. Calm seas may signify clarity, while stormy waters can indicate stress. What have your dreams looked like lately?"
    }
  };
}

describe("Social Architecture & Deterministic Schema", () => {
  describe("Config & Invariants", () => {
    it("exports expected schema version, slide count, and roles", () => {
      assert.equal(SOCIAL_SCHEMA_VERSION, 1);
      assert.equal(SLIDE_COUNT, 5);
      assert.deepEqual(SLIDE_ROLES, ["cover", "content", "content", "content", "cta"]);
    });

    it("supports only facebook and instagram without pinterest", () => {
      assert.deepEqual(SUPPORTED_PLATFORMS, ["facebook", "instagram"]);
      assert.equal(SUPPORTED_PLATFORMS.includes("pinterest"), false);
    });

    it("defines the deterministic DreamlyAI Google Play URL", () => {
      assert.equal(
        GOOGLE_PLAY_URL,
        "https://play.google.com/store/apps/details?id=com.oberon.dreamlyai"
      );
    });
  });

  describe("Creative Payload Validation", () => {
    it("1. valid creative payload passes", () => {
      const payload = createValidCreativePayload();
      const result = validateCreativePayload(payload);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    it("2. missing field fails", () => {
      const withoutTopic = createValidCreativePayload();
      delete withoutTopic.topic;
      assert.equal(validateCreativePayload(withoutTopic).valid, false);

      const withoutSlides = createValidCreativePayload();
      delete withoutSlides.slides;
      assert.equal(validateCreativePayload(withoutSlides).valid, false);

      const withoutCaptions = createValidCreativePayload();
      delete withoutCaptions.captions;
      assert.equal(validateCreativePayload(withoutCaptions).valid, false);

      const withoutHeadline = createValidCreativePayload();
      delete withoutHeadline.slides[0].headline;
      assert.equal(validateCreativePayload(withoutHeadline).valid, false);

      const withoutIgCaption = createValidCreativePayload();
      delete withoutIgCaption.captions.instagram;
      assert.equal(validateCreativePayload(withoutIgCaption).valid, false);
    });

    it("3. extra top-level field fails", () => {
      const payload = createValidCreativePayload();
      payload.unexpectedField = "should_fail";
      const result = validateCreativePayload(payload);
      assert.equal(result.valid, false);
      assert.match(result.errors.join(" "), /unexpected.*field.*unexpectedField/i);
    });

    it("4. wrong slide count fails", () => {
      const tooFew = createValidCreativePayload();
      tooFew.slides.pop(); // 4 slides
      const resTooFew = validateCreativePayload(tooFew);
      assert.equal(resTooFew.valid, false);
      assert.match(resTooFew.errors.join(" "), /exactly 5 slides/i);

      const tooMany = createValidCreativePayload();
      tooMany.slides.push({
        role: "content",
        title: "Extra",
        body: "Extra slide body"
      });
      const resTooMany = validateCreativePayload(tooMany);
      assert.equal(resTooMany.valid, false);
      assert.match(resTooMany.errors.join(" "), /exactly 5 slides/i);
    });

    it("5. wrong slide role/order fails", () => {
      const wrongOrder = createValidCreativePayload();
      // Swap cover and content
      const temp = wrongOrder.slides[0];
      wrongOrder.slides[0] = wrongOrder.slides[1];
      wrongOrder.slides[1] = temp;
      const resOrder = validateCreativePayload(wrongOrder);
      assert.equal(resOrder.valid, false);

      const unknownRole = createValidCreativePayload();
      unknownRole.slides[0] = {
        role: "intro",
        headline: "Hello",
        subheadline: "Intro"
      };
      const resUnknown = validateCreativePayload(unknownRole);
      assert.equal(resUnknown.valid, false);
    });

    it("6. empty text fails", () => {
      const emptyTopic = createValidCreativePayload();
      emptyTopic.topic = "   ";
      assert.equal(validateCreativePayload(emptyTopic).valid, false);

      const emptyHeadline = createValidCreativePayload();
      emptyHeadline.slides[0].headline = "  ";
      assert.equal(validateCreativePayload(emptyHeadline).valid, false);

      const emptyBody = createValidCreativePayload();
      emptyBody.slides[1].body = "";
      assert.equal(validateCreativePayload(emptyBody).valid, false);

      const emptyFb = createValidCreativePayload();
      emptyFb.captions.facebook = "\n\t ";
      assert.equal(validateCreativePayload(emptyFb).valid, false);
    });

    it("7. configured max length violation fails", () => {
      const longCoverHeadline = createValidCreativePayload();
      longCoverHeadline.slides[0].headline = "A".repeat(TEXT_LIMITS.COVER_HEADLINE_MAX + 1);
      assert.equal(validateCreativePayload(longCoverHeadline).valid, false);

      const longCoverSubheadline = createValidCreativePayload();
      longCoverSubheadline.slides[0].subheadline = "A".repeat(TEXT_LIMITS.COVER_SUBHEADLINE_MAX + 1);
      assert.equal(validateCreativePayload(longCoverSubheadline).valid, false);

      const longContentTitle = createValidCreativePayload();
      longContentTitle.slides[1].title = "A".repeat(TEXT_LIMITS.CONTENT_TITLE_MAX + 1);
      assert.equal(validateCreativePayload(longContentTitle).valid, false);

      const longContentBody = createValidCreativePayload();
      longContentBody.slides[1].body = "A".repeat(TEXT_LIMITS.CONTENT_BODY_MAX + 1);
      assert.equal(validateCreativePayload(longContentBody).valid, false);

      const longCtaHeadline = createValidCreativePayload();
      longCtaHeadline.slides[4].headline = "A".repeat(TEXT_LIMITS.CTA_HEADLINE_MAX + 1);
      assert.equal(validateCreativePayload(longCtaHeadline).valid, false);

      const longCtaBody = createValidCreativePayload();
      longCtaBody.slides[4].body = "A".repeat(TEXT_LIMITS.CTA_BODY_MAX + 1);
      assert.equal(validateCreativePayload(longCtaBody).valid, false);

      const longIgCaption = createValidCreativePayload();
      longIgCaption.captions.instagram = "A".repeat(TEXT_LIMITS.INSTAGRAM_CAPTION_MAX + 1);
      assert.equal(validateCreativePayload(longIgCaption).valid, false);

      const longFbCaption = createValidCreativePayload();
      longFbCaption.captions.facebook = "A".repeat(TEXT_LIMITS.FACEBOOK_CAPTION_MAX + 1);
      assert.equal(validateCreativePayload(longFbCaption).valid, false);
    });

    it("8. placeholder/meta text fails", () => {
      const placeholders = [
        { field: "topic", val: "As an AI, I suggest exploring water dreams" },
        { field: "topic", val: "I am a language model" },
        { field: "headline", val: "Insert text here" },
        { field: "subheadline", val: "This is a placeholder" },
        { field: "title", val: "Lorem Ipsum dolor sit amet" },
        { field: "body", val: "Your text here" },
        { field: "topic", val: "Exploring [topic] in depth" },
        { field: "headline", val: "Slide 1: [headline]" },
        { field: "body", val: "Click the [cta] button" },
        { field: "headline", val: "Dream symbols TBD" }
      ];

      for (const p of placeholders) {
        const payload = createValidCreativePayload();
        if (p.field === "topic") {
          payload.topic = p.val;
        } else if (p.field === "headline") {
          payload.slides[0].headline = p.val;
        } else if (p.field === "subheadline") {
          payload.slides[0].subheadline = p.val;
        } else if (p.field === "title") {
          payload.slides[1].title = p.val;
        } else if (p.field === "body") {
          payload.slides[1].body = p.val;
        }
        const res = validateCreativePayload(payload);
        assert.equal(res.valid, false, `Failed to reject placeholder: ${p.val}`);
        assert.match(res.errors.join(" "), /placeholder|meta/i);
      }
    });

    it("9. AI attempting to return publishDate/contentId fails", () => {
      const forbiddenKeys = [
        "publishDate",
        "contentId",
        "category",
        "storageKey",
        "media",
        "manifest",
        "platform",
        "googlePlayUrl",
        "url"
      ];

      for (const forbidden of forbiddenKeys) {
        const payload = createValidCreativePayload();
        payload[forbidden] = "forbidden_val";
        const result = validateCreativePayload(payload);
        assert.equal(result.valid, false, `Should reject top-level ${forbidden}`);

        const slidePayload = createValidCreativePayload();
        slidePayload.slides[0][forbidden] = "forbidden_val";
        const slideResult = validateCreativePayload(slidePayload);
        assert.equal(slideResult.valid, false, `Should reject slide-level ${forbidden}`);
      }
    });
  });

  describe("Prepared Envelope Validation & Construction", () => {
    it("10. valid prepared content passes", () => {
      const creative = createValidCreativePayload();
      const prepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative
      });
      const result = validatePreparedContent(prepared);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    it("11. contentId is derived deterministically", () => {
      const creative = createValidCreativePayload();
      const prepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative
      });
      assert.equal(prepared.contentId, "social-2026-08-28");
      assert.equal(prepared.schemaVersion, 1);
      assert.equal(prepared.slideCount, 5);
      assert.equal(prepared.publishDate, "2026-08-28");
      assert.equal(prepared.category, "dream_symbols");
    });

    it("12. incorrect prepared contentId fails", () => {
      const creative = createValidCreativePayload();
      const prepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative
      });
      const bad = { ...prepared, contentId: "custom-id-override" };
      const res = validatePreparedContent(bad);
      assert.equal(res.valid, false);
      assert.match(res.errors.join(" "), /Invalid contentId/i);
    });

    it("13. incorrect slideCount fails", () => {
      const creative = createValidCreativePayload();
      const prepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative
      });
      const bad = { ...prepared, slideCount: 4 };
      const res = validatePreparedContent(bad);
      assert.equal(res.valid, false);
      assert.match(res.errors.join(" "), /Invalid slideCount/i);
    });

    it("14. unknown category fails", () => {
      const creative = createValidCreativePayload();
      assert.throws(
        () =>
          buildPreparedContent({
            publishDate: "2026-08-28",
            category: "astrology_horoscope",
            creative
          }),
        /Invalid category/i
      );

      const prepared = buildPreparedContent({
        publishDate: "2026-08-28",
        category: "dream_symbols",
        creative
      });
      const badCategory = { ...prepared, category: "astrology_horoscope" };
      const res = validatePreparedContent(badCategory);
      assert.equal(res.valid, false);
      assert.match(res.errors.join(" "), /Invalid category/i);
    });
  });

  describe("Topic Rotation & Date Determinism", () => {
    it("15. same publishDate always produces the same topic category", () => {
      const date = "2026-08-28";
      const catA = getTopicCategoryForDate(date);
      const catB = getTopicCategoryForDate(date);
      assert.equal(catA.id, catB.id);
      assert.deepEqual(catA, catB);
      assert.equal(typeof catA.description, "string");
      assert.equal(typeof catA.safetyGuidance, "string");
    });

    it("16. seven consecutive rotation positions produce the seven categories in order", () => {
      assert.equal(TOPIC_CATEGORIES.length, 7);
      assert.deepEqual(TOPIC_CATEGORY_IDS, [
        "dream_symbols",
        "dream_science",
        "common_dreams",
        "emotions_themes",
        "dream_recall",
        "lucid_vivid",
        "reflection"
      ]);

      const consecutiveDates = [
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07"
      ];

      const categories = consecutiveDates.map((date) => getTopicCategoryForDate(date));
      const categoryIds = categories.map((cat) => cat.id);

      // Verify all 7 categories are unique
      const uniqueIds = new Set(categoryIds);
      assert.equal(uniqueIds.size, 7);

      // Verify consecutive indices follow cyclic order
      for (let i = 0; i < 6; i++) {
        const currentIndex = TOPIC_CATEGORIES.findIndex((c) => c.id === categoryIds[i]);
        const nextIndex = TOPIC_CATEGORIES.findIndex((c) => c.id === categoryIds[i + 1]);
        assert.equal(nextIndex, (currentIndex + 1) % 7);
      }
    });

    it("17. invalid date is rejected", () => {
      const invalidDates = [
        "invalid-date",
        "2026-02-31", // Non-existent date
        "2026-02-29", // 2026 is not a leap year
        "2026-13-01", // Invalid month
        "2026-00-10", // Invalid month
        "2026/08/28", // Wrong delimiter
        "2026-8-28",  // Missing zero padding
        "",
        null,
        undefined,
        12345678
      ];

      for (const invalid of invalidDates) {
        assert.equal(isValidDateString(invalid), false, `Should identify '${invalid}' as invalid date`);
        assert.throws(
          () => getTopicCategoryForDate(invalid),
          /Invalid publishDate/i,
          `Should throw for invalid date: ${invalid}`
        );
      }
    });
  });
});
