import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({ prisma: {} }));
vi.mock("./ai", () => ({
  generateJoke: vi.fn(),
  aiVote: vi.fn(),
  FORFEIT_TEXT: "[forfeit]",
}));

import { generateRoomCode, assignPrompts, buildPlayerHistory } from "./game-logic";

describe("generateRoomCode", () => {
  it("returns a 4-character string", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
  });

  it("only contains valid characters (no ambiguous chars like 0, O, 1, I)", () => {
    const valid = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(valid).toContain(char);
      }
    }
  });

  it("produces varying codes (not deterministic)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generateRoomCode());
    }
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("assignPrompts", () => {
  const players = ["alice", "bob", "carol", "dave"];

  it("returns the requested number of assignments", () => {
    const assignments = assignPrompts(players, 4);
    expect(assignments).toHaveLength(4);
  });

  it("assigns exactly 2 players per prompt", () => {
    const assignments = assignPrompts(players, 4);
    for (const a of assignments) {
      expect(a.playerIds).toHaveLength(2);
    }
  });

  it("assigns different players to each prompt (no self-pairing)", () => {
    const assignments = assignPrompts(players, 4);
    for (const a of assignments) {
      expect(a.playerIds[0]).not.toBe(a.playerIds[1]);
    }
  });

  it("pairs players in round-robin order", () => {
    const assignments = assignPrompts(players, 4);
    expect(assignments[0].playerIds).toEqual(["alice", "bob"]);
    expect(assignments[1].playerIds).toEqual(["bob", "carol"]);
    expect(assignments[2].playerIds).toEqual(["carol", "dave"]);
    expect(assignments[3].playerIds).toEqual(["dave", "alice"]); // wraps around
  });

  it("wraps around with fewer prompts than players", () => {
    const assignments = assignPrompts(players, 2);
    expect(assignments).toHaveLength(2);
    expect(assignments[0].playerIds).toEqual(["alice", "bob"]);
    expect(assignments[1].playerIds).toEqual(["bob", "carol"]);
  });

  it("wraps around with more prompts than players", () => {
    const assignments = assignPrompts(["a", "b", "c"], 5);
    expect(assignments).toHaveLength(5);
    // Player assignment cycles: a,b / b,c / c,a / a,b / b,c
    expect(assignments[3].playerIds).toEqual(["a", "b"]);
    expect(assignments[4].playerIds).toEqual(["b", "c"]);
  });

  it("each assignment has a unique prompt text", () => {
    const assignments = assignPrompts(players, 4);
    const texts = assignments.map((a) => a.promptText);
    expect(new Set(texts).size).toBe(4);
  });

  it("excludes prompts from the exclude set", () => {
    const first = assignPrompts(players, 4);
    const exclude = new Set(first.map((a) => a.promptText));
    const second = assignPrompts(players, 4, exclude);

    for (const a of second) {
      expect(exclude.has(a.promptText)).toBe(false);
    }
  });
});

describe("buildPlayerHistory", () => {
  const PLAYER = "player-1";
  const OPPONENT = "player-2";

  /** Create a single-round fixture with one prompt matchup. */
  function makeRound(opts: {
    roundNumber?: number;
    text: string;
    playerText: string;
    opponentText: string;
    playerResponseId?: string;
    opponentResponseId?: string;
    votes: { responseId: string | null }[];
  }) {
    return {
      roundNumber: opts.roundNumber ?? 1,
      prompts: [{
        text: opts.text,
        responses: [
          { id: opts.playerResponseId ?? "r1", playerId: PLAYER, text: opts.playerText },
          { id: opts.opponentResponseId ?? "r2", playerId: OPPONENT, text: opts.opponentText },
        ],
        votes: opts.votes,
      }],
    };
  }

  it("returns empty array when no previous rounds", () => {
    expect(buildPlayerHistory(PLAYER, [])).toEqual([]);
  });

  it("returns won: true when player got more votes", () => {
    const rounds = [makeRound({
      text: "Worst superpower",
      playerText: "Lactose tolerance",
      opponentText: "Invisibility but only when alone",
      votes: [{ responseId: "r1" }, { responseId: "r1" }, { responseId: "r2" }],
    })];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([{
      round: 1,
      prompt: "Worst superpower",
      yourJoke: "Lactose tolerance",
      won: true,
    }]);
  });

  it("returns won: false with winningJoke when opponent got more votes", () => {
    const rounds = [makeRound({
      text: "Bad restaurant name",
      playerText: "Salmonella Shack",
      opponentText: "Just Okay Sushi",
      votes: [{ responseId: "r1" }, { responseId: "r2" }, { responseId: "r2" }],
    })];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([{
      round: 1,
      prompt: "Bad restaurant name",
      yourJoke: "Salmonella Shack",
      won: false,
      winningJoke: "Just Okay Sushi",
    }]);
  });

  it("returns won: true when opponent forfeited", () => {
    const rounds = [makeRound({
      text: "Famous last words",
      playerText: "Watch this",
      opponentText: "[forfeit]",
      votes: [],
    })];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([{
      round: 1,
      prompt: "Famous last words",
      yourJoke: "Watch this",
      won: true,
    }]);
  });

  it("returns won: false with winningJoke when player forfeited", () => {
    const rounds = [makeRound({
      text: "Famous last words",
      playerText: "[forfeit]",
      opponentText: "Hold my beer",
      votes: [],
    })];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([{
      round: 1,
      prompt: "Famous last words",
      yourJoke: "[forfeit]",
      won: false,
      winningJoke: "Hold my beer",
    }]);
  });

  it("returns won: false with no winningJoke when both forfeited", () => {
    const rounds = [makeRound({
      text: "Famous last words",
      playerText: "[forfeit]",
      opponentText: "[forfeit]",
      votes: [],
    })];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([{
      round: 1,
      prompt: "Famous last words",
      yourJoke: "[forfeit]",
      won: false,
    }]);
  });

  it("returns won: false with winningJoke on tie (equal votes)", () => {
    const rounds = [makeRound({
      text: "Worst holiday",
      playerText: "National Dentist Day",
      opponentText: "Thanksgiving 2",
      votes: [{ responseId: "r1" }, { responseId: "r2" }],
    })];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([{
      round: 1,
      prompt: "Worst holiday",
      yourJoke: "National Dentist Day",
      won: false,
      winningJoke: "Thanksgiving 2",
    }]);
  });

  it("returns entries ordered by round number across multiple rounds", () => {
    const rounds = [
      makeRound({
        roundNumber: 1,
        text: "Prompt A",
        playerText: "Joke A",
        opponentText: "Opp A",
        votes: [{ responseId: "r1" }, { responseId: "r1" }],
      }),
      makeRound({
        roundNumber: 2,
        text: "Prompt B",
        playerText: "Joke B",
        opponentText: "Opp B",
        playerResponseId: "r3",
        opponentResponseId: "r4",
        votes: [{ responseId: "r4" }, { responseId: "r4" }],
      }),
    ];

    const history = buildPlayerHistory(PLAYER, rounds);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      round: 1,
      prompt: "Prompt A",
      yourJoke: "Joke A",
      won: true,
    });
    expect(history[1]).toEqual({
      round: 2,
      prompt: "Prompt B",
      yourJoke: "Joke B",
      won: false,
      winningJoke: "Opp B",
    });
  });

  it("skips prompts where the player was not assigned", () => {
    const rounds = [{
      roundNumber: 1,
      prompts: [{
        text: "Not my prompt",
        responses: [
          { id: "r1", playerId: "other-1", text: "Joke 1" },
          { id: "r2", playerId: "other-2", text: "Joke 2" },
        ],
        votes: [{ responseId: "r1" }],
      }],
    }];

    expect(buildPlayerHistory(PLAYER, rounds)).toEqual([]);
  });
});
