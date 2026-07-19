/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Convex lobby controls", () => {
  test("seeds configured AI players and protects add, remove, and kick with host capability", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: [
        "google/gemini-3.1-flash-lite",
        "openai/gpt-5.6-luna",
        "google/gemini-3.1-flash-lite",
        "unknown/model",
      ],
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const guest = await backend.action(api.rooms.join, {
      name: "Guest",
      roomCode: host.roomCode,
    });

    const initial = await backend.query(api.gameViews.lobby, {
      capability: host.capability,
    });
    expect(initial.me).toMatchObject({
      isHost: true,
      playerId: host.playerId,
      role: "HOST",
    });
    expect(initial.players.map((player: { name: string }) => player.name).toSorted()).toEqual([
      "GPT",
      "Gemini",
      "Guest",
      "Host",
    ]);

    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: guest.capability,
        modelId: "anthropic/claude-haiku-4.5",
      }),
    ).rejects.toThrow("Host capability required");

    const added = await backend.mutation(api.lobby.addAiPlayer, {
      capability: host.capability,
      modelId: "anthropic/claude-haiku-4.5",
    });
    expect(added.replacedPlayerId).toBeNull();
    await backend.mutation(api.lobby.removeAiPlayer, {
      capability: host.capability,
      targetPlayerId: added.playerId,
    });

    await expect(
      backend.mutation(api.lobby.removeAiPlayer, {
        capability: host.capability,
        targetPlayerId: guest.playerId!,
      }),
    ).rejects.toThrow("Can only remove AI players");
    await expect(
      backend.mutation(api.lobby.kickHuman, {
        capability: host.capability,
        targetPlayerId: host.playerId!,
      }),
    ).rejects.toThrow("Cannot kick yourself");

    await backend.mutation(api.lobby.kickHuman, {
      capability: host.capability,
      targetPlayerId: guest.playerId!,
    });
    await expect(
      backend.query(api.rooms.summary, { capability: guest.capability }),
    ).rejects.toThrow("Invalid or expired room capability");
    const summary = await backend.query(api.rooms.summary, {
      capability: host.capability,
    });
    expect(summary.game.playerCount).toBe(3);
  });

  test("keeps AI additions idempotent and rejects duplicate human names", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Gemini",
      hostSecret: "host-secret",
    });

    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: host.capability,
        modelId: "google/gemini-3.1-flash-lite",
      }),
    ).rejects.toThrow("That AI player's name is already taken");

    const added = await backend.mutation(api.lobby.addAiPlayer, {
      capability: host.capability,
      modelId: "openai/gpt-5.6-luna",
    });
    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: host.capability,
        modelId: "openai/gpt-5.6-luna",
      }),
    ).resolves.toEqual({ playerId: added.playerId, replacedPlayerId: null });
    const game = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(game?.playerCount).toBe(2);
  });

  test("lets a QuizSlop host remove lobby players but preserves the frozen roster", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "QUIZSLOP",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const removed = await backend.action(api.rooms.join, {
      name: "Removed Candidate",
      roomCode: host.roomCode,
    });
    const remaining = await backend.action(api.rooms.join, {
      name: "Remaining Candidate",
      roomCode: host.roomCode,
    });

    await backend.mutation(api.lobby.kickHuman, {
      capability: host.capability,
      targetPlayerId: removed.playerId!,
    });

    await expect(
      backend.query(api.rooms.summary, { capability: removed.capability }),
    ).rejects.toThrow("Invalid or expired room capability");
    const lobby = await backend.query(api.quizslopViews.stageView, {
      capability: host.capability,
    });
    expect(lobby.roster.map((player) => player.name)).toEqual(["Host", "Remaining Candidate"]);

    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "ROUND_RESULTS" });
    });
    await expect(
      backend.mutation(api.lobby.kickHuman, {
        capability: host.capability,
        targetPlayerId: remaining.playerId!,
      }),
    ).rejects.toThrow("QuizSlop roster is frozen after the game starts");
  });

  test("starts Slop-Lash with paired prompts, a writing deadline, and AI jobs", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna"],
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });

    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    expect(started).toMatchObject({
      gameType: "SLOPLASH",
      queuedGenerationJobs: 2,
      started: true,
    });

    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const prompts = await ctx.db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(16);
      const assignments = await ctx.db
        .query("promptAssignments")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(128);
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .take(16);
      return { assignments, game, jobs, prompts };
    });
    expect(persisted.game).toMatchObject({ currentRound: 1, status: "WRITING" });
    expect(persisted.game?.phaseDeadline).toBeGreaterThan(Date.now());
    expect(persisted.prompts).toHaveLength(3);
    expect(persisted.assignments).toHaveLength(6);
    expect(persisted.jobs.map((job) => job.kind)).toEqual(["RESPONSE", "RESPONSE"]);

    const controller = await backend.query(api.gameViews.controller, {
      capability: host.capability,
    });
    expect(controller.writing?.prompts).toHaveLength(2);
    const retried = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    expect(retried.started).toBe(false);
    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: host.capability,
        modelId: "anthropic/claude-haiku-4.5",
      }),
    ).rejects.toThrow("during lobby");
  });

  test("kicks between rounds without deleting historical player identity", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const kicked = await backend.action(api.rooms.join, {
      name: "Kicked Guest",
      roomCode: host.roomCode,
    });
    const remaining = await backend.action(api.rooms.join, {
      name: "Remaining Guest",
      roomCode: host.roomCode,
    });
    await backend.mutation(api.lobby.start, { capability: host.capability });
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "ROUND_RESULTS" });
    });

    await backend.mutation(api.lobby.kickHuman, {
      capability: host.capability,
      targetPlayerId: kicked.playerId!,
    });

    await expect(
      backend.query(api.rooms.summary, { capability: kicked.capability }),
    ).rejects.toThrow("Invalid or expired room capability");
    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", host.gameId),
      player: await ctx.db.get("players", kicked.playerId!),
    }));
    expect(persisted.player).toMatchObject({
      name: "Kicked Guest",
      participationStatus: "DISCONNECTED",
    });
    expect(persisted.game?.playerCount).toBe(2);

    await expect(
      backend.mutation(api.lobby.kickHuman, {
        capability: host.capability,
        targetPlayerId: kicked.playerId!,
      }),
    ).resolves.toEqual({ success: true });
    const afterRetry = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    if (!afterRetry) throw new Error("Expected game after repeated kick");
    expect(afterRetry?.playerCount).toBe(2);

    await expect(
      backend.mutation(api.lobby.kickHuman, {
        capability: host.capability,
        targetPlayerId: remaining.playerId!,
      }),
    ).rejects.toThrow("Need at least 2 active players to continue the game");

    await expect(
      backend.mutation(api.sloplash.advance, {
        capability: host.capability,
        expectedPhaseGeneration: afterRetry.phaseGeneration,
      }),
    ).resolves.toEqual({ phase: "WRITING" });
    const nextRound = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      if (!game) throw new Error("Expected game");
      const round = await ctx.db
        .query("rounds")
        .withIndex("by_gameId_and_roundNumber", (index) =>
          index.eq("gameId", host.gameId).eq("roundNumber", game.currentRound),
        )
        .unique();
      if (!round) throw new Error("Expected next round");
      const assignments = await ctx.db
        .query("promptAssignments")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", round._id),
        )
        .take(128);
      return { assignments, game };
    });
    expect(nextRound.game.currentRound).toBe(2);
    expect(
      nextRound.assignments.every((assignment) => assignment.playerId !== kicked.playerId),
    ).toBe(true);
  });

  test("starts ChatSlop with one prompt assigned to every active player", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna"],
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
    });

    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    expect(started.queuedGenerationJobs).toBe(2);
    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const prompts = await ctx.db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(16);
      const assignments = await ctx.db
        .query("promptAssignments")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(128);
      return { assignments, game, prompts };
    });
    expect(persisted.game?.phaseDeadline).toBeUndefined();
    expect(persisted.prompts).toHaveLength(1);
    expect(persisted.assignments).toHaveLength(3);

    const controller = await backend.query(api.gameViews.controller, {
      capability: host.capability,
    });
    expect(controller.writing?.prompts).toHaveLength(1);
  });

  test("starts MatchSlop with display host, sampled context, and a profile job", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: [
        "openai/gpt-5.6-luna",
        "google/gemini-3.1-flash-lite",
        "anthropic/claude-haiku-4.5",
      ],
      gameType: "MATCHSLOP",
      hostSecret: "host-secret",
      personaIdentity: "WOMAN",
      personaModelId: "openai/gpt-5.6-luna",
      seekerIdentity: "MAN",
    });
    const lobby = await backend.query(api.gameViews.lobby, {
      capability: host.capability,
    });
    expect(lobby.players.map((player) => player.modelId)).toEqual([
      "google/gemini-3.1-flash-lite",
      "anthropic/claude-haiku-4.5",
    ]);

    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    expect(started).toMatchObject({
      gameType: "MATCHSLOP",
      queuedGenerationJobs: 1,
      started: true,
    });
    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const state = await ctx.db
        .query("matchSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique();
      const prompts = await ctx.db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(16);
      const assignments = await ctx.db
        .query("promptAssignments")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", host.gameId).eq("roundId", started.roundId),
        )
        .take(128);
      const job = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", host.gameId).eq("generationKey", "matchslop-profile"),
        )
        .unique();
      return { assignments, game, job, prompts, state };
    });
    expect(persisted.game?.phaseDeadline).toBeUndefined();
    expect(persisted.prompts).toHaveLength(1);
    expect(persisted.prompts[0]?.text).toBe("Write the funniest opening line to this profile.");
    expect(persisted.assignments).toHaveLength(2);
    expect(persisted.state?.selectedPersonaExampleIds).toHaveLength(1);
    expect(persisted.state?.selectedPlayerExamples).toHaveLength(4);
    expect(persisted.job).toMatchObject({
      kind: "MATCHSLOP_PROFILE",
      status: "QUEUED",
    });

    const controller = await backend.query(api.gameViews.controller, {
      capability: host.capability,
    });
    expect(controller.me).toBeNull();
    expect(controller.matchslop?.profileGeneration.status).toBe("NOT_REQUESTED");
    expect(controller.matchslop?.progressCount).toEqual({ submitted: 0, total: 2 });
  });
});
