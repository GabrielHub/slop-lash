import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SloplashPrompt, SloplashRound } from "../../../convex/sloplash/view";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { computeAwards, type AwardPlayer } from "./awards";
import { orderMatchups, scoreMatchup } from "./scoring";

/** [author, has an answer]; votes are [voter, picked answer index or null]. */
type Spec = [key: string, answers: [string, boolean][], votes: [string, number | null][]];

const id = <T extends "players" | "prompts" | "responses">(text: string) => text as Id<T>;

/** A round as the finished view sends it: revealed, ordered, scored. */
function round(number: number, specs: Spec[]): SloplashRound {
  const ordered = orderMatchups(
    specs.map((spec) => ({ item: spec, present: spec[1].filter(([, has]) => has).length })),
  );
  const prompts = specs.map(([key, answers, votes]): SloplashPrompt => {
    const answerId = (index: number) => id<"responses">(`${key}-${index}`);
    const position = ordered.findIndex((entry) => entry.item[0] === key);
    const score = scoreMatchup(
      answers.map(([, has], index) => ({ id: answerId(index), forfeited: !has })),
      votes.map(([, pick]) => (pick === null ? null : answerId(pick))),
      number,
    );
    return {
      id: id<"prompts">(key),
      text: key,
      assigneeIds: answers.map(([by]) => id<"players">(by)),
      kind: position < 0 ? "void" : ordered[position]!.kind,
      order: position < 0 ? null : position,
      revealed: true,
      answers: answers.map(([by, has], index) => ({
        id: answerId(index),
        text: has ? `${by} answer` : FORFEIT_MARKER,
        forfeited: !has,
        playerId: id<"players">(by),
        pointsEarned: score.points[answerId(index)] ?? 0,
        reactions: [],
      })),
      votes: votes.map(([voter, pick]) => ({
        voterId: id<"players">(voter),
        responseId: pick === null ? null : answerId(pick),
        timedOut: false,
      })),
      liveReactions: [],
    };
  });
  return { number, prompts };
}

/** Totals per player across rounds, from the points each answer earned. */
function totals(rounds: SloplashRound[]) {
  const sums = new Map<string, number>();
  for (const answer of rounds.flatMap((r) => r.prompts).flatMap((p) => p.answers)) {
    sums.set(answer.playerId!, (sums.get(answer.playerId!) ?? 0) + answer.pointsEarned);
  }
  return sums;
}

const TYPES: Record<string, "HUMAN" | "AI"> = {
  ong: "HUMAN",
  amy: "HUMAN",
  beau: "HUMAN",
  slopbot: "AI",
  hank: "AI",
};

function seats(rounds: SloplashRound[], scores: Record<string, number> = {}): AwardPlayer[] {
  const sums = totals(rounds);
  return Object.keys(TYPES).map((player) => ({
    id: player,
    type: TYPES[player]!,
    score: scores[player] ?? sums.get(player) ?? 0,
  }));
}

/** The spec's five-player game (§6). */
const ROUND_ONE: Spec[] = [
  ["r1-dentist", [["ong", true], ["amy", false]], []],
  [
    "r1-meditation",
    [["amy", true], ["beau", true]],
    [["ong", 0], ["slopbot", 1], ["hank", null]],
  ],
  ["r1-gym", [["beau", true], ["slopbot", true]], [["ong", 1], ["amy", 1], ["hank", 1]]],
  [
    "r1-sparkling",
    [["slopbot", true], ["hank", true]],
    [["ong", null], ["amy", null], ["beau", null]],
  ],
  ["r1-lacroix", [["hank", true], ["ong", true]], [["amy", 0], ["beau", 1], ["slopbot", 0]]],
];

function roundTwo(funeral: [string, number][]): Spec[] {
  return [
    ["r2-hotel", [["ong", true], ["amy", true]], [["beau", 1], ["slopbot", 1], ["hank", 0]]],
    ["r2-fridge", [["amy", true], ["beau", true]], [["ong", 1], ["slopbot", 1], ["hank", 1]]],
    ["r2-rideshare", [["beau", false], ["slopbot", true]], []],
    [
      "r2-interview",
      [["slopbot", true], ["hank", true]],
      [["ong", 0], ["amy", 0], ["beau", 1]],
    ],
    ["r2-funeral", [["hank", true], ["ong", true]], funeral],
  ];
}

const GAME = [
  round(1, ROUND_ONE),
  round(2, roundTwo([["amy", 1], ["beau", 1], ["slopbot", 0]])),
];
const HUMAN_GAME = [
  round(1, ROUND_ONE),
  round(2, roundTwo([["amy", 1], ["beau", 1], ["slopbot", 1]])),
];

const kinds = (awards: ReturnType<typeof computeAwards>) =>
  awards.map((award) => `${award.kind}:${award.playerId}`);

describe("computeAwards", () => {
  it("scores the spec's five-player game", () => {
    expect(Object.fromEntries(totals(GAME))).toEqual({
      slopbot: 1050,
      beau: 1000,
      ong: 800,
      hank: 600,
      amy: 500,
    });
    expect(Object.fromEntries(totals(HUMAN_GAME))).toMatchObject({ ong: 1300, hank: 400 });
  });

  it("hands out the spec's awards in priority order", () => {
    expect(kinds(computeAwards(GAME, seats(GAME)))).toEqual([
      "mvp:slopbot",
      "botSlayer:ong",
      "flawless:beau",
    ]);
    expect(kinds(computeAwards(HUMAN_GAME, seats(HUMAN_GAME)))).toEqual([
      "mvp:ong",
      "crowdFavorite:slopbot",
      "flawless:beau",
    ]);
  });

  it("skips MVP on a tied top score", () => {
    const awards = computeAwards(GAME, seats(GAME, { ong: 1050 }));
    expect(kinds(awards)).toEqual(["crowdFavorite:slopbot", "botSlayer:ong", "flawless:beau"]);
  });

  it("at most one award per player and five in total", () => {
    // Six players, each winning one unanimous matchup over a different loser.
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const rounds = [
      round(
        1,
        players.slice(0, 6).map((winner, index): Spec => {
          const voters = players.filter((p) => p !== winner && p !== players[index + 1]);
          return [
            `m${index}`,
            [
              [winner, true],
              [players[index + 1]!, true],
            ],
            voters.slice(0, 2 + index).map((voter) => [voter, 0]),
          ];
        }),
      ),
    ];
    const awards = computeAwards(
      rounds,
      players.map((player, index) => ({ id: player, type: "HUMAN", score: 700 - index * 100 })),
    );
    expect(awards.length).toBeLessThanOrEqual(5);
    expect(new Set(awards.map((award) => award.playerId)).size).toBe(awards.length);
  });

  it("Crowd Favorite only goes to a top-voted player", () => {
    // slopbot (MVP) has the most votes, so nobody else may claim "Most votes".
    expect(computeAwards(GAME, seats(GAME)).some((a) => a.kind === "crowdFavorite")).toBe(false);
  });

  it("Bot Slayer and Slopped only go to humans", () => {
    const rounds = [
      round(1, [
        ["a", [["bot", true], ["ana", true]], [["x", 0], ["y", 0]]],
        ["b", [["ana", true], ["bot2", true]], [["x", 0], ["y", 1]]],
        ["c", [["bot", true], ["bot2", true]], [["x", 1], ["y", 0], ["ana", 1]]],
      ]),
    ];
    const players: AwardPlayer[] = [
      { id: "ana", type: "HUMAN", score: 100 },
      { id: "bot", type: "AI", score: 300 },
      { id: "bot2", type: "AI", score: 200 },
    ];
    const awards = computeAwards(rounds, players);
    for (const award of awards.filter((a) => a.kind === "botSlayer" || a.kind === "slopped")) {
      expect(award.playerId).toBe("ana");
    }
    expect(kinds(awards)).toContain("slopped:ana");
  });

  it("Hot Streak needs three contested wins in a row; walkovers are skipped", () => {
    const win = (key: string, by: string): Spec => [
      key,
      [
        [by, true],
        ["foe", true],
      ],
      [["v", 0]],
    ];
    const walkover = (key: string, by: string): Spec => [
      key,
      [
        [by, true],
        ["foe", false],
      ],
      [],
    ];
    const players: AwardPlayer[] = [
      { id: "top", type: "HUMAN", score: 900 },
      { id: "foe", type: "HUMAN", score: 0 },
      { id: "ana", type: "HUMAN", score: 300 },
      { id: "v", type: "HUMAN", score: 0 },
    ];
    const landslide: Spec = [
      "t",
      [
        ["top", true],
        ["foe", true],
      ],
      [
        ["v", 0],
        ["v2", 0],
        ["v3", 0],
        ["v4", 0],
      ],
    ];
    // Top takes MVP and the most votes; ana wins three, either side of a walkover.
    const streak = [
      round(1, [landslide, win("a1", "ana"), walkover("w", "ana")]),
      round(2, [win("a2", "ana"), win("a3", "ana")]),
    ];
    const hot = computeAwards(streak, players).find((award) => award.kind === "hotStreak");
    expect(hot).toMatchObject({ playerId: "ana", description: "3 wins in a row" });

    const broken = [
      round(1, [landslide, win("a1", "ana"), win("a2", "ana")]),
      round(2, [["tie", [["ana", true], ["foe", true]], [["v", 0], ["top", 1]]], win("a3", "ana")]),
    ];
    expect(computeAwards(broken, players).some((award) => award.kind === "hotStreak")).toBe(
      false,
    );
  });

  it("walkovers and voids never count", () => {
    const rounds = [
      round(1, [
        ["w1", [["ana", true], ["bot", false]], []],
        ["w2", [["ana", true], ["bot", false]], []],
        ["v1", [["ana", false], ["bot", false]], []],
      ]),
    ];
    const players: AwardPlayer[] = [
      { id: "ana", type: "HUMAN", score: 0 },
      { id: "bot", type: "AI", score: 0 },
    ];
    expect(computeAwards(rounds, players)).toEqual([]);
  });
});
