import { describe, expect, test } from "vite-plus/test";
import {
  codePointLength,
  normalizeForDuplicateCheck,
  validatePackStructure,
  validateQuestionContent,
  type QuestionValidationIssue,
} from "./content-validation";
import { MAX_DISPLAY_PROMPT_LENGTH } from "./game-constants";
import type { QuizslopComedyDevice, QuizslopQuestionContent, QuizslopSourceRecord } from "./types";
import { QUIZSLOP_TIERS } from "./types";

function makeSource(overrides: Partial<QuizslopSourceRecord> = {}): QuizslopSourceRecord {
  return {
    url: "https://example.org/octopus-hearts",
    title: "Octopus physiology",
    locator: "Circulatory system",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: "0".repeat(64),
    supportExcerpt: "An octopus has three hearts.",
    primary: true,
    ...overrides,
  };
}

function makeValidQuestion(
  overrides: Partial<QuizslopQuestionContent> = {},
): QuizslopQuestionContent {
  return {
    id: "q-easy",
    tier: "EASY",
    neutralQuestion: "How many hearts does an octopus have?",
    displayPrompt: "How many hearts does an octopus keep on payroll?",
    choices: ["One", "Two", "Three", "Four"],
    correctIndex: 2,
    canonicalFact: "An octopus has three hearts.",
    explanation: "An octopus has three hearts. Executive-level cardiovascular benefits.",
    comedyDevices: ["ANTHROPOMORPHISM"],
    sources: [makeSource()],
    ...overrides,
  };
}

function issueMessages(
  issues: readonly QuestionValidationIssue[],
  field?: string,
): readonly string[] {
  return issues
    .filter((entry) => field === undefined || entry.field === field)
    .map((entry) => entry.message);
}

describe("validateQuestionContent", () => {
  test("a fully valid question produces no issues", () => {
    expect(validateQuestionContent(makeValidQuestion())).toEqual([]);
  });

  test("empty text is rejected", () => {
    const issues = validateQuestionContent(makeValidQuestion({ displayPrompt: "" }));
    expect(issueMessages(issues, "displayPrompt")).toContain("must not be empty");
  });

  test(`a display prompt longer than ${MAX_DISPLAY_PROMPT_LENGTH} characters is rejected`, () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ displayPrompt: "x".repeat(MAX_DISPLAY_PROMPT_LENGTH + 1) }),
    );
    expect(issueMessages(issues, "displayPrompt")).toContain(
      `exceeds ${MAX_DISPLAY_PROMPT_LENGTH} characters`,
    );
  });

  test("more than four choices is rejected", () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ choices: ["One", "Two", "Three", "Four", "Five"] }),
    );
    expect(issueMessages(issues, "choices")).toContain("must have exactly 4 choices");
  });

  test('choices that collide after normalization ("The Moon" vs "the moon!") are rejected', () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ choices: ["The Moon", "the moon!", "Mars", "Venus"] }),
    );
    expect(issueMessages(issues, "choices")).toContain("must be distinct after normalization");
  });

  test('"All of the above" is not an allowed choice', () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ choices: ["Mercury", "Venus", "Mars", "All of the above"] }),
    );
    expect(issueMessages(issues, "choices[3]")).toContain("all/none of the above is not allowed");
  });

  test("a correctIndex outside the choice range is rejected", () => {
    for (const correctIndex of [4, -1, 1.5]) {
      const issues = validateQuestionContent(makeValidQuestion({ correctIndex }));
      expect(issueMessages(issues, "correctIndex")).toContain("must index one of the four choices");
    }
  });

  test('a negative stem such as "Which is not..." is rejected', () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ neutralQuestion: "Which of these is not a moon of Jupiter?" }),
    );
    expect(issueMessages(issues, "neutralQuestion")).toContain(
      "must not depend on a negative stem",
    );
  });

  test("zero sources is rejected", () => {
    const issues = validateQuestionContent(makeValidQuestion({ sources: [] }));
    expect(issueMessages(issues, "sources")).toContain("must retain 1-3 sources");
  });

  test("two primary sources are rejected: exactly one must directly support the keyed fact", () => {
    const issues = validateQuestionContent(
      makeValidQuestion({
        sources: [
          makeSource({ primary: true }),
          makeSource({ url: "https://example.org/backup", primary: true }),
        ],
      }),
    );
    expect(issueMessages(issues, "sources")).toContain("must flag exactly one primary source");
  });

  test("four sources are rejected: at most three may be retained", () => {
    const issues = validateQuestionContent(
      makeValidQuestion({
        sources: [
          makeSource({ primary: true }),
          makeSource({ url: "https://example.org/two", primary: false }),
          makeSource({ url: "https://example.org/three", primary: false }),
          makeSource({ url: "https://example.org/four", primary: false }),
        ],
      }),
    );
    expect(issueMessages(issues, "sources")).toContain("must retain 1-3 sources");
  });

  test("a control character in player-facing text is rejected", () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ displayPrompt: "Which planet\u0007 hums the loudest?" }),
    );
    expect(issueMessages(issues, "displayPrompt")).toContain(
      "contains control characters or invalid Unicode",
    );
  });

  test("source audit metadata must be complete and canonical", () => {
    const invalidSources = [
      makeSource({ locator: "" }),
      makeSource({ retrievedAt: "July 16, 2026" }),
      makeSource({ contentHash: "ABC" }),
    ];
    const issues = validateQuestionContent(makeValidQuestion({ sources: invalidSources }));

    expect(issueMessages(issues, "sources[0].locator")).toContain("must not be empty");
    expect(issueMessages(issues, "sources[1].retrievedAt")).toContain(
      "must be a canonical ISO timestamp",
    );
    expect(issueMessages(issues, "sources[2].contentHash")).toContain(
      "must be 64 lowercase hexadecimal characters",
    );
  });

  test("an HTTP-looking source without a host is rejected", () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ sources: [makeSource({ url: "https://" })] }),
    );
    expect(issueMessages(issues, "sources[0].url")).toContain("must be a public HTTP(S) URL");
  });

  test("an unpaired surrogate (invalid Unicode) is rejected", () => {
    const issues = validateQuestionContent(
      makeValidQuestion({ displayPrompt: "Which planet\uD800 hums the loudest?" }),
    );
    expect(issueMessages(issues, "displayPrompt")).toContain(
      "contains control characters or invalid Unicode",
    );
  });
});

const PACK_PRIMARY_DEVICES: readonly QuizslopComedyDevice[] = [
  "UNEXPECTED_SPECIFICITY",
  "DRY_ASIDE",
  "INCONGRUITY",
  "ANTHROPOMORPHISM",
];

function makeValidPack(): QuizslopQuestionContent[] {
  return QUIZSLOP_TIERS.map((tier, index) => {
    const ordinal = index + 1;
    return makeValidQuestion({
      id: `q-${tier.toLowerCase()}`,
      tier,
      neutralQuestion: `Which planet claims pack slot ${ordinal}?`,
      displayPrompt: `Which planet swaggers into pack slot ${ordinal} like it owns the marquee?`,
      canonicalFact: `Pack fact number ${ordinal} stands alone.`,
      explanation: `Pack fact number ${ordinal} first, then exactly one quick joke.`,
      choices: [
        `Mercury ${ordinal}`,
        `Venus ${ordinal}`,
        `Jupiter ${ordinal}`,
        `Saturn ${ordinal}`,
      ],
      comedyDevices: [PACK_PRIMARY_DEVICES[index]],
    });
  });
}

function withDevices(
  pack: readonly QuizslopQuestionContent[],
  devices: readonly (readonly QuizslopComedyDevice[])[],
): QuizslopQuestionContent[] {
  return pack.map((question, index) => ({
    ...question,
    comedyDevices: devices[index] ?? question.comedyDevices,
  }));
}

function packMessages(questions: readonly QuizslopQuestionContent[]): readonly string[] {
  return validatePackStructure(questions).map((entry) => entry.message);
}

describe("validatePackStructure", () => {
  test("a valid four-question pack with one question per tier passes", () => {
    expect(validatePackStructure(makeValidPack())).toEqual([]);
  });

  test("a pack missing a tier fails", () => {
    const pack = makeValidPack().map((question) =>
      question.tier === "INSANE" ? { ...question, tier: "HARD" as const } : question,
    );
    expect(packMessages(pack)).toContain("pack must have exactly one INSANE question");
  });

  test("a pack with a duplicated tier fails", () => {
    const pack = makeValidPack().map((question) =>
      question.tier === "INSANE" ? { ...question, tier: "HARD" as const } : question,
    );
    expect(packMessages(pack)).toContain("pack must have exactly one HARD question");
  });

  test("duplicate canonical facts after normalization fail", () => {
    const pack = makeValidPack();
    const duplicated = pack.map((question, index) =>
      index === 1
        ? { ...question, canonicalFact: "PACK   fact Number 1 stands alone!!" }
        : question,
    );
    expect(packMessages(duplicated)).toContain("canonical facts must not repeat");
  });

  test("fewer than three distinct primary comedy devices fail even with unique device pairings", () => {
    const pack = withDevices(makeValidPack(), [
      ["WORDPLAY"],
      ["WORDPLAY", "DRY_ASIDE"],
      ["WORDPLAY", "INCONGRUITY"],
      ["WORDPLAY", "UNDERSTATEMENT"],
    ]);
    const messages = packMessages(pack);
    expect(messages).toContain("pack must use at least 3 distinct primary comedy devices");
    expect(messages).not.toContain("device pairings must not repeat exactly");
  });

  test("two questions with identical comedyDevices arrays fail even when primary diversity passes", () => {
    const pack = withDevices(makeValidPack(), [
      ["DRY_ASIDE", "WORDPLAY"],
      ["DRY_ASIDE", "WORDPLAY"],
      ["INCONGRUITY"],
      ["ANTHROPOMORPHISM"],
    ]);
    const messages = packMessages(pack);
    expect(messages).toContain("device pairings must not repeat exactly");
    expect(messages).not.toContain("pack must use at least 3 distinct primary comedy devices");
  });

  test("a three-question pack fails the exact-count rule", () => {
    expect(packMessages(makeValidPack().slice(0, 3))).toContain(
      "pack must contain exactly 4 questions",
    );
  });
});

describe("normalizeForDuplicateCheck", () => {
  test("character bounds count an astral code point once", () => {
    expect(codePointLength("A😀B")).toBe(3);
  });

  test("punctuation- and case-insensitive equality", () => {
    expect(normalizeForDuplicateCheck("The Moon!")).toBe(normalizeForDuplicateCheck("the   moon"));
    expect(normalizeForDuplicateCheck("Mascarpone.")).toBe(
      normalizeForDuplicateCheck("mascarpone"),
    );
  });

  test("width-insensitive equality via NFKC", () => {
    expect(normalizeForDuplicateCheck("Ｔｈｅ Ｍｏｏｎ")).toBe("the moon");
  });

  test("distinct facts stay distinct", () => {
    expect(normalizeForDuplicateCheck("The Moon")).not.toBe(normalizeForDuplicateCheck("The Sun"));
  });
});
