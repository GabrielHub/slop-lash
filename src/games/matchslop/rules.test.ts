import { describe, expect, it } from "vite-plus/test";
import {
  MATCHSLOP_POINTS_PER_WEIGHTED_VOTE,
  MATCHSLOP_WINNER_BONUS,
} from "./config/game-config";
import {
  HUMAN_VOTE_WEIGHT,
  levelConsequences,
  moodPoints,
  resolveTurn,
  trimAtWord,
  verdictOf,
  type TurnInput,
} from "./rules";
import {
  MATCHSLOP_INITIAL_MOOD,
  MATCHSLOP_LEVEL_DELTA,
  MATCHSLOP_LEVELS,
  clampMatchSlopMood,
  type MatchSlopLevel,
} from "./types";

const turn = (overrides: Partial<TurnInput>) =>
  resolveTurn({ mood: 50, level: "meh", round: 2, totalRounds: 5, comeback: false, ...overrides });

/** Plays a sequence of levels from the start and returns each turn. */
function play(levels: MatchSlopLevel[], totalRounds = 5) {
  let mood = MATCHSLOP_INITIAL_MOOD;
  let comeback = false;
  const turns = [];
  for (const [index, level] of levels.entries()) {
    const result = resolveTurn({ mood, level, round: index + 1, totalRounds, comeback });
    turns.push(result);
    mood = result.mood;
    comeback = result.comebackRound !== null;
    if (result.outcome !== "IN_PROGRESS") break;
  }
  return turns;
}

describe("resolveTurn", () => {
  it("maps each judge level to its mood delta", () => {
    expect(MATCHSLOP_LEVEL_DELTA).toEqual({
      dealbreaker: -20,
      cringe: -10,
      meh: 0,
      cute: 5,
      good: 10,
      great: 15,
    });
    for (const level of MATCHSLOP_LEVELS) {
      const result = turn({ level });
      expect(result.delta).toBe(MATCHSLOP_LEVEL_DELTA[level]);
      expect(result.mood).toBe(50 + MATCHSLOP_LEVEL_DELTA[level]);
    }
  });

  it("the opener can neither seal nor unmatch", () => {
    expect(turn({ round: 1, level: "great" })).toMatchObject({
      mood: 65,
      message: "CONTINUE",
      outcome: "IN_PROGRESS",
    });
    expect(turn({ round: 1, level: "dealbreaker" })).toMatchObject({
      mood: 30,
      message: "CONTINUE",
      outcome: "IN_PROGRESS",
      comebackRound: null,
    });
  });

  it("reaching the date line seals the date at once", () => {
    expect(turn({ mood: 70, level: "good", round: 3 })).toMatchObject({
      mood: 80,
      message: "DATE_SEALED",
      outcome: "DATE_SEALED",
    });
  });

  it("dropping to 20 books one last shot", () => {
    expect(turn({ mood: 40, level: "dealbreaker", round: 2 })).toMatchObject({
      mood: 20,
      message: "UNMATCHED",
      outcome: "IN_PROGRESS",
      comebackRound: 3,
    });
  });

  it("the last message forces a verdict", () => {
    expect(turn({ mood: 70, level: "cute", round: 5 })).toMatchObject({
      mood: 75,
      message: "UNMATCHED",
      outcome: "UNMATCHED",
    });
    expect(turn({ mood: 75, level: "cute", round: 5 })).toMatchObject({
      mood: 80,
      message: "DATE_SEALED",
      outcome: "DATE_SEALED",
    });
    expect(turn({ mood: 30, level: "dealbreaker", round: 5 })).toMatchObject({
      mood: 10,
      message: "UNMATCHED",
      outcome: "UNMATCHED",
      comebackRound: null,
    });
  });

  it("a comeback that charms seals the date", () => {
    const saved = turn({ mood: 20, level: "good", round: 3, comeback: true });
    expect(saved).toMatchObject({ mood: 80, points: 100, outcome: "DATE_SEALED", delta: 10 });
    expect(turn({ mood: 20, level: "great", round: 3, comeback: true })).toMatchObject({
      mood: 80,
      points: 150,
      outcome: "DATE_SEALED",
    });
    expect(turn({ mood: 20, level: "cute", round: 3, comeback: true })).toMatchObject({
      mood: 25,
      message: "UNMATCHED",
      outcome: "UNMATCHED",
      comebackRound: null,
    });
  });

  it("a stand-in reply never moves mood or points", () => {
    expect(turn({ mood: 60, level: null })).toMatchObject({
      mood: 60,
      delta: 0,
      points: 0,
      message: "CONTINUE",
      outcome: "IN_PROGRESS",
    });
    expect(turn({ mood: 60, level: null, round: 5 })).toMatchObject({
      mood: 60,
      points: 0,
      message: "UNMATCHED",
      outcome: "UNMATCHED",
    });
    expect(turn({ mood: 20, level: null, round: 3, comeback: true })).toMatchObject({
      mood: 20,
      points: 0,
      message: "UNMATCHED",
      outcome: "UNMATCHED",
    });
  });

  it("the author earns ten points per mood point", () => {
    expect(MATCHSLOP_LEVELS.map((level) => turn({ level }).points)).toEqual([
      -200, -100, 0, 50, 100, 150,
    ]);
    expect(moodPoints(40)).toBe(200);
    expect(moodPoints(-40)).toBe(-200);
  });

  it("a dealbreaker costs more than a sent line earns from two human votes and the bonus", () => {
    const sentLineVotePoints =
      2 * HUMAN_VOTE_WEIGHT * MATCHSLOP_POINTS_PER_WEIGHTED_VOTE + MATCHSLOP_WINNER_BONUS;
    expect(sentLineVotePoints + turn({ level: "dealbreaker" }).points).toBeLessThan(0);
    expect(sentLineVotePoints + turn({ level: "cringe" }).points).toBeLessThanOrEqual(50);
  });

  it("calibration: good lines date by round 3, cute lines never do, two dealbreakers book the last shot", () => {
    const great = play(["great", "great"]);
    expect(great.map((result) => result.mood)).toEqual([65, 80]);
    expect(great.at(-1)!.outcome).toBe("DATE_SEALED");

    const good = play(["good", "good", "good"]);
    expect(good.map((result) => result.mood)).toEqual([60, 70, 80]);
    expect(good.at(-1)!.outcome).toBe("DATE_SEALED");

    const mixed = play(["good", "cute", "good", "cute"]);
    expect(mixed.map((result) => result.mood)).toEqual([60, 65, 75, 80]);
    expect(mixed.at(-1)!.outcome).toBe("DATE_SEALED");

    const cute = play(["cute", "cute", "cute", "cute", "cute"]);
    expect(cute.map((result) => result.mood)).toEqual([55, 60, 65, 70, 75]);
    expect(cute.at(-1)!.outcome).toBe("UNMATCHED");
    expect(verdictOf({ outcome: "UNMATCHED", mood: 75, comebackRound: null })).toBe(
      "NO_SECOND_DATE",
    );

    const rude = play(["dealbreaker", "dealbreaker"]);
    expect(rude.map((result) => result.mood)).toEqual([30, 10]);
    expect(rude.at(-1)).toMatchObject({ message: "UNMATCHED", outcome: "IN_PROGRESS", comebackRound: 3 });

    const awkward = play(["cringe", "cringe", "cringe"]);
    expect(awkward.map((result) => result.mood)).toEqual([40, 30, 20]);
    expect(awkward.at(-1)).toMatchObject({ outcome: "IN_PROGRESS", comebackRound: 4 });
  });

  it("the persona is told the consequences the code applies", () => {
    const expected = {
      DATE_SEALED: ["date"],
      CONTINUE: ["continue"],
      UNMATCHED: ["last-shot", "unmatch", "no-second-date"],
    } as const;
    for (const mood of [10, 20, 25, 40, 50, 65, 70, 75, 79]) {
      for (const totalRounds of [3, 5]) {
        for (let round = 1; round <= totalRounds; round += 1) {
          for (const comeback of [false, true]) {
            const state = { mood, round, totalRounds, comeback };
            const consequences = levelConsequences(state);
            for (const level of MATCHSLOP_LEVELS) {
              const result = resolveTurn({ ...state, level });
              const consequence = consequences[level];
              expect(expected[result.message]).toContain(consequence);
              if (consequence === "last-shot") {
                expect(result.outcome).toBe("IN_PROGRESS");
                expect(result.comebackRound).toBe(round + 1);
              }
              if (consequence === "unmatch" || consequence === "no-second-date") {
                expect(result.outcome).toBe("UNMATCHED");
                const verdict = verdictOf({
                  outcome: result.outcome,
                  mood: result.mood,
                  comebackRound: comeback ? round : null,
                });
                expect(verdict).toBe(consequence === "unmatch" ? "UNMATCHED" : "NO_SECOND_DATE");
              }
              if (consequence === "date") expect(result.outcome).toBe("DATE_SEALED");
            }
          }
        }
      }
    }
  });
});

describe("verdictOf", () => {
  it("verdicts name the ending", () => {
    expect(verdictOf({ outcome: "IN_PROGRESS", mood: 50 })).toBeNull();
    expect(verdictOf({ outcome: "DATE_SEALED", mood: 80 })).toBe("DATE");
    expect(verdictOf({ outcome: "UNMATCHED", mood: 10 })).toBe("UNMATCHED");
    expect(verdictOf({ outcome: "UNMATCHED", mood: 25, comebackRound: 3 })).toBe("UNMATCHED");
    expect(verdictOf({ outcome: "UNMATCHED", mood: 65, comebackRound: null })).toBe(
      "NO_SECOND_DATE",
    );
  });
});

describe("trimAtWord", () => {
  it("trimAtWord cuts at a word boundary under the cap", () => {
    expect(trimAtWord("short and sweet", 80)).toBe("short and sweet");
    const long = "I named a pumpkin, put it on a leash, and walked it past the pumpkin stand twice today";
    const cut = trimAtWord(long, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut).toBe("I named a pumpkin, put it on a leash…");
    const word = `${"a".repeat(30)} ${"b".repeat(60)}`;
    const hard = trimAtWord(word, 80);
    expect(hard).toHaveLength(80);
    expect(hard.endsWith("…")).toBe(true);
  });
});

describe("clampMatchSlopMood", () => {
  it("mood clamps to 0..100", () => {
    expect(clampMatchSlopMood(-15)).toBe(0);
    expect(clampMatchSlopMood(130)).toBe(100);
    expect(turn({ mood: 5, level: "dealbreaker", round: 1 }).mood).toBe(0);
    expect(turn({ mood: 95, level: "great", round: 1 }).mood).toBe(100);
  });
});
