import { describe, expect, test } from "vite-plus/test";
import { MIN_CATALOG_CATEGORIES, MIN_CATALOG_TOPICS } from "../game-constants";
import {
  collectApprovalFailures,
  collectStructuralFailures,
} from "../../../../scripts/quizslop/catalog-checks";
import { QUIZSLOP_TOPIC_CATALOG } from "./topic-catalog";

describe("QuizSlop reviewed catalog", () => {
  test("passes every structural check", async () => {
    const failures = await collectStructuralFailures(QUIZSLOP_TOPIC_CATALOG);
    expect(failures).toEqual([]);
  });

  test("meets the launch minimums", () => {
    expect(QUIZSLOP_TOPIC_CATALOG.length).toBeGreaterThanOrEqual(MIN_CATALOG_TOPICS);
    const categories = new Set(
      QUIZSLOP_TOPIC_CATALOG.filter((topic) => !topic.retired)
        .map((topic) => topic.category)
        .filter((category) => category !== "OTHER"),
    );
    expect(categories.size).toBeGreaterThanOrEqual(MIN_CATALOG_CATEGORIES);
  });

  test("content carries named human approval, so the gate passes", () => {
    const failures = collectApprovalFailures(QUIZSLOP_TOPIC_CATALOG);
    // Approved for production by a named human reviewer; see review metadata.
    expect(failures).toEqual([]);
  });

  test("approval requires named, timestamped human review", () => {
    const topic = QUIZSLOP_TOPIC_CATALOG[0];
    expect(topic).toBeDefined();
    if (!topic) return;

    const failures = collectApprovalFailures([
      {
        ...topic,
        review: {
          approved: true,
          reviewer: null,
          reviewedAt: null,
          factualState: "APPROVED",
          comedyState: "APPROVED",
          comedyRating: "WITTY",
        },
      },
    ]);
    expect(failures).toContain(`topic ${topic.id}: reviewer must name the approving human`);
    expect(failures).toContain(`topic ${topic.id}: reviewedAt must be a canonical ISO timestamp`);
  });
});
