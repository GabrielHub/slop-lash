import { describe, expect, test } from "vite-plus/test";
import { MIN_CATALOG_CATEGORIES, MIN_CATALOG_TOPICS } from "../game-constants";
import {
  collectApprovalFailures,
  collectStructuralFailures,
  collectVoiceBankFailures,
} from "../../../../scripts/quizslop/catalog-checks";
import { QUIZSLOP_TOPIC_CATALOG } from "./topic-catalog";
import { QUIZSLOP_VOICE_LINES } from "./voice-lines";

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

  test("voice bank passes structural checks", () => {
    const failures = collectVoiceBankFailures(QUIZSLOP_VOICE_LINES);
    expect(failures).toEqual([]);
  });

  test("content carries named human approval, so the gate passes", () => {
    const failures = collectApprovalFailures(QUIZSLOP_TOPIC_CATALOG, QUIZSLOP_VOICE_LINES);
    // Approved for production by a named human reviewer; see review metadata.
    expect(failures).toEqual([]);
  });

  test("approval requires named, timestamped human review", () => {
    const topic = QUIZSLOP_TOPIC_CATALOG[0];
    const line = QUIZSLOP_VOICE_LINES[0];
    expect(topic).toBeDefined();
    expect(line).toBeDefined();
    if (!topic || !line) return;

    const failures = collectApprovalFailures(
      [
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
      ],
      [{ ...line, review: { approved: true, reviewer: null, reviewedAt: null } }],
    );
    expect(failures).toContain(`topic ${topic.id}: reviewer must name the approving human`);
    expect(failures).toContain(`topic ${topic.id}: reviewedAt must be a canonical ISO timestamp`);
    expect(failures).toContain(`voice line ${line.id}: reviewer must name the approving human`);
    expect(failures).toContain(
      `voice line ${line.id}: reviewedAt must be a canonical ISO timestamp`,
    );
  });
});
