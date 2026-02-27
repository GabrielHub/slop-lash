import { describe, it, expect } from "vitest";
import { computeAchievements } from "./achievements";
import type { GameState } from "@/lib/types";

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    id: "game1",
    roomCode: "ABCD",
    gameType: "SLOPLASH",
    status: "FINAL_RESULTS",
    currentRound: 1,
    totalRounds: 1,
    hostPlayerId: "p1",
    phaseDeadline: null,
    timersDisabled: false,
    ttsMode: "OFF",
    ttsVoice: "MALE",
    votingPromptIndex: 0,
    votingRevealing: false,
    nextGameCode: null,
    version: 1,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiCostUsd: 0,
    modelUsages: [],
    players: [
      { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 100, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      { id: "ai1", name: "GPT", type: "AI", modelId: "openai/gpt-5.2", score: 200, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
    ],
    rounds: [],
    ...overrides,
  };
}

function makePrompt(
  id: string,
  responses: { id: string; playerId: string; text: string; playerType: "HUMAN" | "AI" | "SPECTATOR"; modelId: string | null }[],
  votes: { responseId: string; voterId: string; voterType?: "HUMAN" | "AI" | "SPECTATOR" }[],
  assignments?: { promptId: string; playerId: string }[],
) {
  return {
    id,
    roundId: "r1",
    text: `Prompt ${id}`,
    responses: responses.map((r) => ({
      id: r.id,
      promptId: id,
      playerId: r.playerId,
      text: r.text,
      pointsEarned: 0,
      failReason: null,
      reactions: [],
      player: {
        id: r.playerId,
        name: r.playerId,
        type: r.playerType,
        modelId: r.modelId,
        idleRounds: 0,
        humorRating: 1.0,
        winStreak: 0,
        participationStatus: "ACTIVE" as const, lastSeen: "",
      },
    })),
    votes: votes.map((v, i) => ({
      id: `vote-${i}`,
      promptId: id,
      voterId: v.voterId,
      responseId: v.responseId,
      failReason: null,
      voter: { id: v.voterId, type: v.voterType ?? ("HUMAN" as const) },
    })),
    assignments: assignments ?? responses.map((r) => ({ promptId: id, playerId: r.playerId })),
  };
}

describe("computeAchievements", () => {
  it("returns empty for a game with no rounds and zero scores", () => {
    const game = makeGame({
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    expect(computeAchievements(game)).toEqual([]);
  });

  it("awards MVP to the player with highest score", () => {
    const game = makeGame({
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 500, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    const mvp = achievements.find((a) => a.achievement.id === "mvp");
    expect(mvp).toBeDefined();
    expect(mvp?.playerName).toBe("Alice");
  });

  it("does not award MVP on tie", () => {
    const game = makeGame({
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    expect(achievements.find((a) => a.achievement.id === "mvp")).toBeUndefined();
  });

  it("awards Slop Master for unanimous win", () => {
    const game = makeGame({
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [makePrompt(
          "pr1",
          [
            { id: "resp1", playerId: "p1", text: "Funny", playerType: "HUMAN", modelId: null },
            { id: "resp2", playerId: "p2", text: "Meh", playerType: "HUMAN", modelId: null },
          ],
          [
            { responseId: "resp1", voterId: "ai1" },
            { responseId: "resp1", voterId: "p3" },
          ],
        )],
      }],
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 100, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "ai1", name: "GPT", type: "AI", modelId: "openai/gpt-5.2", score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p3", name: "Carol", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    expect(achievements.find((a) => a.achievement.id === "slopMaster")).toBeDefined();
  });

  it("awards Slopped for getting 0 votes unanimously", () => {
    const game = makeGame({
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [makePrompt(
          "pr1",
          [
            { id: "resp1", playerId: "p1", text: "Great", playerType: "HUMAN", modelId: null },
            { id: "resp2", playerId: "p2", text: "Bad", playerType: "HUMAN", modelId: null },
          ],
          [
            { responseId: "resp1", voterId: "ai1" },
            { responseId: "resp1", voterId: "p3" },
          ],
        )],
      }],
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "ai1", name: "GPT", type: "AI", modelId: "openai/gpt-5.2", score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p3", name: "Carol", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    const slopped = achievements.find((a) => a.achievement.id === "slopped");
    expect(slopped).toBeDefined();
    expect(slopped?.playerName).toBe("Bob");
  });

  it("awards AI Slayer when human beats AI", () => {
    const game = makeGame({
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [makePrompt(
          "pr1",
          [
            { id: "resp1", playerId: "p1", text: "Human wins", playerType: "HUMAN", modelId: null },
            { id: "resp2", playerId: "ai1", text: "AI loses", playerType: "AI", modelId: "openai/gpt-5.2" },
          ],
          [
            { responseId: "resp1", voterId: "p2" },
            { responseId: "resp1", voterId: "p3" },
            { responseId: "resp2", voterId: "p4" },
          ],
        )],
      }],
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 200, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p3", name: "Carol", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p4", name: "Dave", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "ai1", name: "GPT", type: "AI", modelId: "openai/gpt-5.2", score: 100, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    const slayer = achievements.find((a) => a.achievement.id === "aiSlayer");
    expect(slayer).toBeDefined();
    expect(slayer?.playerName).toBe("Alice");
  });

  it("awards Clutch for winning by exactly 1 vote", () => {
    const game = makeGame({
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [makePrompt(
          "pr1",
          [
            { id: "resp1", playerId: "p1", text: "Close", playerType: "HUMAN", modelId: null },
            { id: "resp2", playerId: "p2", text: "Also close", playerType: "HUMAN", modelId: null },
          ],
          [
            { responseId: "resp1", voterId: "ai1" },
            { responseId: "resp1", voterId: "p3" },
            { responseId: "resp2", voterId: "p4" },
          ],
        )],
      }],
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 200, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 100, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "ai1", name: "GPT", type: "AI", modelId: "openai/gpt-5.2", score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p3", name: "Carol", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p4", name: "Dave", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    expect(achievements.find((a) => a.achievement.id === "clutch")).toBeDefined();
  });

  it("awards Iron Will for submitting all responses without placeholders", () => {
    const game = makeGame({
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [
          makePrompt(
            "pr1",
            [
              { id: "resp1", playerId: "p1", text: "Answer 1", playerType: "HUMAN", modelId: null },
              { id: "resp2", playerId: "p2", text: "...", playerType: "HUMAN", modelId: null },
            ],
            [],
          ),
          makePrompt(
            "pr2",
            [
              { id: "resp3", playerId: "p1", text: "Answer 2", playerType: "HUMAN", modelId: null },
              { id: "resp4", playerId: "ai1", text: "AI answer", playerType: "AI", modelId: "openai/gpt-5.2" },
            ],
            [],
          ),
        ],
      }],
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "ai1", name: "GPT", type: "AI", modelId: "openai/gpt-5.2", score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    const ironWill = achievements.filter((a) => a.achievement.id === "ironWill");
    expect(ironWill).toHaveLength(1);
    expect(ironWill[0].playerName).toBe("Alice");
  });

  it("returns empty for AI_CHAT_SHOWDOWN games (achievements are Slop-Lash only)", () => {
    const game = makeGame({
      gameType: "AI_CHAT_SHOWDOWN",
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 500, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 300, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [makePrompt(
          "pr1",
          [
            { id: "resp1", playerId: "p1", text: "Funny", playerType: "HUMAN", modelId: null },
            { id: "resp2", playerId: "p2", text: "Meh", playerType: "HUMAN", modelId: null },
          ],
          [
            { responseId: "resp1", voterId: "p3" },
            { responseId: "resp1", voterId: "p4" },
          ],
        )],
      }],
    });
    expect(computeAchievements(game)).toEqual([]);
  });

  it("does not award Iron Will to a player with placeholder responses", () => {
    const game = makeGame({
      rounds: [{
        id: "r1",
        gameId: "game1",
        roundNumber: 1,
        prompts: [makePrompt(
          "pr1",
          [
            { id: "resp1", playerId: "p1", text: "...", playerType: "HUMAN", modelId: null },
            { id: "resp2", playerId: "p2", text: "Answer", playerType: "HUMAN", modelId: null },
          ],
          [],
        )],
      }],
      players: [
        { id: "p1", name: "Alice", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
        { id: "p2", name: "Bob", type: "HUMAN", modelId: null, score: 0, humorRating: 1.0, winStreak: 0, idleRounds: 0, participationStatus: "ACTIVE", lastSeen: "" },
      ],
    });
    const achievements = computeAchievements(game);
    const ironWill = achievements.filter((a) => a.achievement.id === "ironWill");
    // Bob submitted all responses, Alice has a placeholder
    expect(ironWill.find((a) => a.playerName === "Alice")).toBeUndefined();
    expect(ironWill.find((a) => a.playerName === "Bob")).toBeDefined();
  });
});
