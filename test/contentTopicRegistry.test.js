/**
 * Unit Tests for Dream Topic Registry
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  RAW_TOPICS,
  DREAM_TOPIC_REGISTRY,
  getAllTopics,
  getTopicById,
  getTopicsByCategory,
  getTopicsByPriority,
  searchTopics
} = require("../content/topics/registry");

describe("Dream Topic Registry", () => {
  it("contains around 20 curated topics (at least 20)", () => {
    const topics = getAllTopics();
    assert.ok(topics.length >= 20, `Expected at least 20 topics, found ${topics.length}`);
    assert.equal(topics.length, RAW_TOPICS.length);
  });

  it("covers all requested key topics", () => {
    const requiredTopicIds = [
      "recurring-dreams",
      "falling-dreams",
      "being-chased",
      "dreams-about-an-ex",
      "dreams-about-someone-you-know",
      "teeth-falling-out",
      "flying-dreams",
      "water-dreams",
      "nightmares",
      "deceased-loved-ones",
      "relationship-dreams",
      "strange-dreams",
      "emotional-dreams",
      "common-dream-symbols"
    ];

    for (const id of requiredTopicIds) {
      const topic = getTopicById(id);
      assert.ok(topic, `Expected topic '${id}' to exist in registry`);
      assert.equal(topic.id, id);
      assert.ok(topic.title.length > 0);
      assert.ok(topic.category.length > 0);
      assert.ok(topic.keywords.length > 0);
      assert.ok(topic.searchIntent.length > 0);
      assert.ok(topic.socialAngles.length > 0);
      assert.ok(topic.priority > 0);
      assert.ok(topic.appCTA.headline.length > 0);
      assert.ok(topic.appCTA.body.length > 0);
    }
  });

  it("every registered topic is frozen and valid", () => {
    for (const topic of DREAM_TOPIC_REGISTRY) {
      assert.ok(Object.isFrozen(topic));
      assert.ok(Object.isFrozen(topic.keywords));
      assert.ok(Object.isFrozen(topic.socialAngles));
      assert.ok(Object.isFrozen(topic.appCTA));
    }
  });

  it("getTopicById retrieves topic case-insensitively and handles unknown IDs", () => {
    const topic = getTopicById("TEETH-FALLING-OUT");
    assert.ok(topic);
    assert.equal(topic.id, "teeth-falling-out");

    assert.equal(getTopicById("unknown-non-existent-topic"), undefined);
    assert.equal(getTopicById(null), undefined);
    assert.equal(getTopicById(123), undefined);
  });

  it("getTopicsByCategory filters topics correctly", () => {
    const symbolTopics = getTopicsByCategory("dream_symbols");
    assert.ok(symbolTopics.length > 0);
    for (const topic of symbolTopics) {
      assert.equal(topic.category, "dream_symbols");
    }

    const caseInsensitive = getTopicsByCategory("DREAM_SYMBOLS");
    assert.equal(caseInsensitive.length, symbolTopics.length);

    assert.equal(getTopicsByCategory("non-existent-category").length, 0);
    assert.equal(getTopicsByCategory(null).length, 0);
  });

  it("getTopicsByPriority filters and sorts topics in ascending order (1 = highest)", () => {
    const top5 = getTopicsByPriority(5);
    assert.ok(top5.length > 0);
    assert.ok(top5.length <= 5);

    for (let i = 0; i < top5.length - 1; i++) {
      assert.ok(top5[i].priority <= top5[i + 1].priority);
    }
  });

  it("searchTopics finds matches across title, keywords, and searchIntent", () => {
    const teethResults = searchTopics("teeth");
    assert.ok(teethResults.length > 0);
    assert.ok(teethResults.some((t) => t.id === "teeth-falling-out"));

    const waterResults = searchTopics("ocean");
    assert.ok(waterResults.length > 0);
    assert.ok(waterResults.some((t) => t.id === "water-dreams"));

    const noResults = searchTopics("xyz123nonexistentterm");
    assert.equal(noResults.length, 0);

    assert.equal(searchTopics("").length, 0);
    assert.equal(searchTopics(null).length, 0);
  });
});
