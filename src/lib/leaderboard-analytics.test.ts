import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/models", () => ({
  getLeaderboardModelNames: (modelId: string) => ({
    name: `Model ${modelId}`,
    shortName: modelId.toUpperCase(),
  }),
  getModelByModelId: (modelId: string) => ({
    id: modelId,
    name: `Model ${modelId}`,
    shortName: modelId.toUpperCase(),
  }),
}));

import { computeLeaderboardPromptAnalytics, type PromptAnalyticsInput } from "./leaderboard-analytics";

describe("computeLeaderboardPromptAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function response(opts: {
    text: string;
    votes: number;
    playerName: string;
    type: "HUMAN" | "AI";
    modelId?: string | null;
  }) {
    return {
      text: opts.text,
      player: {
        type: opts.type,
        modelId: opts.type === "AI" ? (opts.modelId ?? "m1") : null,
        name: opts.playerName,
      },
      _count: { votes: opts.votes },
    };
  }

  it("aggregates leaderboard totals and win rates across prompts", () => {
    const prompts: PromptAnalyticsInput[] = [
      {
        text: "Prompt 1",
        responses: [
          response({ text: "human wins", votes: 3, playerName: "Alice", type: "HUMAN" }),
          response({ text: "ai loses", votes: 1, playerName: "Bot", type: "AI", modelId: "m1" }),
        ],
      },
      {
        text: "Prompt 2",
        responses: [
          response({ text: "ai wins", votes: 4, playerName: "Bot", type: "AI", modelId: "m1" }),
          response({ text: "human loses", votes: 2, playerName: "Bob", type: "HUMAN" }),
        ],
      },
    ];

    const result = computeLeaderboardPromptAnalytics(prompts, 10);

    expect(result.leaderboard.map((x) => [x.key, x.totalVotes, x.matchupsWon, x.matchupsPlayed, x.voteShare])).toEqual([
      ["HUMAN", 5, 1, 2, 50],
      ["m1", 5, 1, 2, 50],
    ]);
    expect(result.leaderboard[0]?.winRate).toBe(50);
    expect(result.leaderboard[1]?.winRate).toBe(50);
  });

  it("builds human-vs-ai head-to-head records including ties", () => {
    const prompts: PromptAnalyticsInput[] = [
      {
        text: "H wins",
        responses: [
          response({ text: "h", votes: 3, playerName: "Alice", type: "HUMAN" }),
          response({ text: "a", votes: 1, playerName: "Bot", type: "AI", modelId: "m2" }),
        ],
      },
      {
        text: "AI wins",
        responses: [
          response({ text: "h", votes: 1, playerName: "Alice", type: "HUMAN" }),
          response({ text: "a", votes: 4, playerName: "Bot", type: "AI", modelId: "m2" }),
        ],
      },
      {
        text: "Tie",
        responses: [
          response({ text: "h", votes: 2, playerName: "Alice", type: "HUMAN" }),
          response({ text: "a", votes: 2, playerName: "Bot", type: "AI", modelId: "m2" }),
        ],
      },
    ];

    const result = computeLeaderboardPromptAnalytics(prompts, 13);

    expect(result.headToHead).toHaveLength(1);
    expect(result.headToHead[0]).toMatchObject({
      modelId: "m2",
      humanWins: 1,
      aiWins: 1,
      ties: 1,
      total: 3,
    });
  });

  it("returns top best responses with min-2-votes filter and sorted by pct then count", () => {
    const prompts: PromptAnalyticsInput[] = [
      {
        text: "Prompt A",
        responses: [
          response({ text: "A1", votes: 3, playerName: "Alice", type: "HUMAN" }), // 75%
          response({ text: "A2", votes: 1, playerName: "Bot", type: "AI", modelId: "m1" }),
        ],
      },
      {
        text: "Prompt B",
        responses: [
          response({ text: "B1", votes: 2, playerName: "Carol", type: "HUMAN" }), // 67%
          response({ text: "B2", votes: 1, playerName: "Bot", type: "AI", modelId: "m1" }),
        ],
      },
      {
        text: "Prompt C",
        responses: [
          response({ text: "C1", votes: 1, playerName: "Dave", type: "HUMAN" }), // filtered (<2 total? no, total 1)
        ],
      },
      {
        text: "Prompt D",
        responses: [
          response({ text: "D1", votes: 2, playerName: "Eve", type: "HUMAN" }), // 50%, count 2
          response({ text: "D2", votes: 2, playerName: "Bot2", type: "AI", modelId: "m2" }), // 50%, count 2
        ],
      },
    ];

    const result = computeLeaderboardPromptAnalytics(prompts, 11);

    expect(result.bestResponses.map((r) => [r.responseText, r.votePct, r.voteCount])).toEqual([
      ["A1", 75, 3],
      ["B1", 67, 2],
      ["D1", 50, 2],
      ["D2", 50, 2],
      ["B2", 33, 1],
    ]);
    expect(result.bestResponses.every((r) => r.totalVotes >= 2)).toBe(true);
  });
});
