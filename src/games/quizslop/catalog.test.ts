import { describe, expect, test } from "vite-plus/test";
import { QUIZSLOP_TOPIC_CATALOG } from "./config/topic-catalog";
import { availableCatalogTopics, isShippableCatalogTopic } from "./catalog";

describe("QuizSlop playable catalog gate", () => {
  test("offers only topics with complete human approval", () => {
    const offered = availableCatalogTopics();
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

  test("every shippable question fits the stage", () => {
    // The TV reveal is budgeted for these lengths (see the QuizSlop stage layout).
    for (const topic of availableCatalogTopics()) {
      expect(topic.label.length, topic.id).toBeLessThanOrEqual(40);
      for (const question of topic.questions) {
        expect(question.displayPrompt.length, question.id).toBeLessThanOrEqual(160);
        expect(question.explanation.length, question.id).toBeLessThanOrEqual(200);
        for (const choice of question.choices) {
          expect(choice.length, question.id).toBeLessThanOrEqual(44);
        }
      }
    }
  });
});

/** The stage is a fixed 80×45rem artboard; these caps keep every question on it without scrolling. */
const STAGE_FIT = { prompt: 160, explanation: 200, choice: 44, label: 40 } as const;

describe("QuizSlop catalog stage fit", () => {
  test("every shippable question fits the stage", () => {
    for (const topic of availableCatalogTopics()) {
      expect(topic.label.length, topic.label).toBeLessThanOrEqual(STAGE_FIT.label);
      for (const question of topic.questions) {
        expect(question.displayPrompt.length, question.id).toBeLessThanOrEqual(STAGE_FIT.prompt);
        expect(question.explanation.length, question.id).toBeLessThanOrEqual(STAGE_FIT.explanation);
        for (const choice of question.choices) {
          expect(choice.length, `${question.id}: ${choice}`).toBeLessThanOrEqual(STAGE_FIT.choice);
        }
      }
    }
  });
});
