import { describe, expect, test } from "vite-plus/test";
import { QUIZSLOP_TOPIC_CATALOG } from "./config/topic-catalog";
import { availableCatalogTopics, isShippableCatalogTopic } from "./catalog";

describe("QuizSlop playable catalog gate", () => {
  test("offers only topics with complete human approval", () => {
    const offered = availableCatalogTopics({
      canonicalKeys: new Set(),
      catalogTopicIds: new Set(),
    });
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every(isShippableCatalogTopic)).toBe(true);
  });

  test("rejects a draft even when its top-level approved flag is true", () => {
    const approved = QUIZSLOP_TOPIC_CATALOG[0];
    if (!approved) throw new Error("Expected a catalog topic");
    expect(
      isShippableCatalogTopic({
        ...approved,
        review: { ...approved.review, approved: true, factualState: "DRAFT" },
      }),
    ).toBe(false);
  });
});
