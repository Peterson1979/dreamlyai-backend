/**
 * Unit Tests for DreamTopic Model
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateDreamTopic,
  validateAppCTA,
  createDreamTopic,
  DEFAULT_CTA
} = require("../content/models/dreamTopic");

describe("DreamTopic Model Validation & Creation", () => {
  const validTopicData = {
    id: "falling-dreams",
    title: "Falling in Dreams: What It Means",
    category: "common_dreams",
    keywords: ["falling dream", "falling from cliff dream"],
    searchIntent: "Understand falling sensation during sleep",
    socialAngles: ["Why do we fall in dreams?", "Hypnic jerk vs stress"],
    priority: 2,
    appCTA: {
      headline: "Track Your Sleep Sensations",
      body: "Log dreams instantly with Dreamly AI voice journal.",
      buttonText: "Download on Google Play"
    }
  };

  it("validates a complete, valid topic successfully", () => {
    const result = validateDreamTopic(validTopicData);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("creates and freezes a canonical DreamTopic", () => {
    const topic = createDreamTopic(validTopicData);
    assert.equal(topic.id, "falling-dreams");
    assert.equal(topic.title, "Falling in Dreams: What It Means");
    assert.equal(topic.category, "common_dreams");
    assert.equal(topic.keywords.length, 2);
    assert.equal(topic.searchIntent, "Understand falling sensation during sleep");
    assert.equal(topic.socialAngles.length, 2);
    assert.equal(topic.priority, 2);
    assert.equal(topic.appCTA.headline, "Track Your Sleep Sensations");
    assert.equal(topic.appCTA.body, "Log dreams instantly with Dreamly AI voice journal.");
    assert.equal(topic.appCTA.buttonText, "Download on Google Play");

    // Immutability checks
    assert.ok(Object.isFrozen(topic));
    assert.ok(Object.isFrozen(topic.keywords));
    assert.ok(Object.isFrozen(topic.socialAngles));
    assert.ok(Object.isFrozen(topic.appCTA));

    assert.throws(() => {
      topic.title = "Changed Title";
    }, TypeError);
    assert.throws(() => {
      topic.keywords.push("new-keyword");
    }, TypeError);
  });

  it("supports string appCTA with fallback defaults", () => {
    const topic = createDreamTopic({
      ...validTopicData,
      appCTA: "Reflect on your falling dreams"
    });
    assert.equal(topic.appCTA.headline, "Reflect on your falling dreams");
    assert.equal(topic.appCTA.body, DEFAULT_CTA.body);
    assert.equal(topic.appCTA.buttonText, DEFAULT_CTA.buttonText);
  });

  it("rejects non-object or null input", () => {
    assert.equal(validateDreamTopic(null).valid, false);
    assert.equal(validateDreamTopic(undefined).valid, false);
    assert.equal(validateDreamTopic("string").valid, false);
    assert.equal(validateDreamTopic([]).valid, false);
  });

  it("rejects invalid id formats (uppercase, spaces, special chars)", () => {
    assert.equal(validateDreamTopic({ ...validTopicData, id: "" }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, id: "Falling_Dreams" }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, id: "falling dreams" }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, id: "-falling-" }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, id: "falling--dreams" }).valid, false);
  });

  it("rejects missing title or category", () => {
    assert.equal(validateDreamTopic({ ...validTopicData, title: "" }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, title: "   " }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, category: "" }).valid, false);
  });

  it("rejects invalid keywords array", () => {
    assert.equal(validateDreamTopic({ ...validTopicData, keywords: [] }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, keywords: ["valid", ""] }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, keywords: "not-array" }).valid, false);
  });

  it("rejects invalid socialAngles array", () => {
    assert.equal(validateDreamTopic({ ...validTopicData, socialAngles: [] }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, socialAngles: [""] }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, socialAngles: "not-array" }).valid, false);
  });

  it("rejects invalid priority values", () => {
    assert.equal(validateDreamTopic({ ...validTopicData, priority: 0 }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, priority: 101 }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, priority: -5 }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, priority: "1" }).valid, false);
    assert.equal(validateDreamTopic({ ...validTopicData, priority: 2.5 }).valid, false);
  });

  it("rejects invalid appCTA objects", () => {
    assert.equal(validateAppCTA(null).valid, false);
    assert.equal(validateAppCTA("").valid, false);
    assert.equal(validateAppCTA({ headline: "" }).valid, false);
    assert.equal(validateAppCTA({ headline: "Head", body: "" }).valid, false);
    assert.equal(validateAppCTA({ headline: "Head", body: "Body", buttonText: "" }).valid, false);
  });

  it("createDreamTopic throws a descriptive error on invalid input", () => {
    assert.throws(() => {
      createDreamTopic({ id: "invalid" });
    }, /Invalid DreamTopic data/);
  });
});
