import { describe, expect, test } from "vite-plus/test";
import {
  finalExamScore,
  proxySeatForCandidate,
  resolveGroupAnswer,
  sabotageForAnswer,
  strictMajorityChoice,
  topicIndexForAssignment,
} from "./cooperative";
import { sectionsForPlayerCount } from "./game-constants";

describe("QuizSlop cooperative exam rules", () => {
  test("maps 3-8 players to 18-24 official questions", () => {
    expect([3, 4, 5, 6, 7, 8].map((count) => count * sectionsForPlayerCount(count))).toEqual([
      18, 20, 20, 24, 21, 24,
    ]);
  });

  test("rotating proxy assignments are deranged bijections", () => {
    for (let count = 3; count <= 8; count += 1) {
      for (let section = 0; section < 6; section += 1) {
        const proxies = Array.from({ length: count }, (_, seat) =>
          proxySeatForCandidate(seat, section, count),
        );
        expect(new Set(proxies).size).toBe(count);
        expect(proxies.every((proxy, candidate) => proxy !== candidate)).toBe(true);
      }
    }
  });

  test("a 25-topic pack does not repeat a topic in any supported full exam", () => {
    for (let count = 3; count <= 8; count += 1) {
      const sectionCount = sectionsForPlayerCount(count);
      const indices = Array.from({ length: sectionCount }, (_, section) =>
        Array.from({ length: count }, (_, seat) =>
          topicIndexForAssignment(section, seat, count, 25),
        ),
      ).flat();
      expect(new Set(indices).size).toBe(indices.length);
    }
  });

  test("strict majority rejects plurality and split votes", () => {
    expect(strictMajorityChoice([1, 1, 2], 3)).toBe(1);
    expect(strictMajorityChoice([1, 1, 2, 2], 4)).toBeNull();
    expect(strictMajorityChoice([1, 1], 5)).toBeNull();
  });

  test("ballot helpers fail closed on impossible voter counts and answer choices", () => {
    expect(() => strictMajorityChoice([1, 1, 1], 2)).toThrow("more choices than eligible voters");
    expect(() =>
      resolveGroupAnswer({
        ballots: [4],
        eligibleVoterCount: 2,
        candidateScratch: null,
        seed: "exam:section:assignment",
        choiceCount: 4,
      }),
    ).toThrow("invalid answer choice");
  });

  test("a split group ballot falls back to scratch, then a stable seeded choice", () => {
    expect(
      resolveGroupAnswer({
        ballots: [0, 1, 2, 3],
        eligibleVoterCount: 4,
        candidateScratch: 2,
        seed: "exam:section:assignment",
        choiceCount: 4,
      }),
    ).toBe(2);
    const first = resolveGroupAnswer({
      ballots: [0, 1, 2, 3],
      eligibleVoterCount: 4,
      candidateScratch: null,
      seed: "exam:section:assignment",
      choiceCount: 4,
    });
    const second = resolveGroupAnswer({
      ballots: [0, 1, 2, 3],
      eligibleVoterCount: 4,
      candidateScratch: null,
      seed: "exam:section:assignment",
      choiceCount: 4,
    });
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(4);
  });

  test("the saboteur earns a bonus for corrupting a correct scratch answer", () => {
    expect(
      sabotageForAnswer({
        scratchCorrect: false,
        officialCorrect: false,
        answeredBySaboteur: true,
      }),
    ).toBe(1);
    expect(
      sabotageForAnswer({ scratchCorrect: true, officialCorrect: false, answeredBySaboteur: true }),
    ).toBe(2);
    expect(
      sabotageForAnswer({ scratchCorrect: true, officialCorrect: true, answeredBySaboteur: true }),
    ).toBe(0);
  });

  test("a correct final accusation restores sabotage deductions", () => {
    expect(
      finalExamScore({
        rawCorrect: 15,
        attempted: 20,
        sabotagePoints: 2,
        saboteurIdentified: false,
      }),
    ).toMatchObject({ adjustedCorrect: 13, gradePercent: 65, passed: false });
    expect(
      finalExamScore({
        rawCorrect: 15,
        attempted: 20,
        sabotagePoints: 2,
        saboteurIdentified: true,
      }),
    ).toMatchObject({ adjustedCorrect: 15, gradePercent: 75, passed: true });
  });
});
