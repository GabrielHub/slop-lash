/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workflowTest from "@convex-dev/workflow/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const deleteGameIfStale = makeFunctionReference<
  "mutation",
  {
    cutoff: number;
    expectedUpdatedAt: number;
    gameId: Id<"games">;
    policy: "STALE_LOBBY" | "ABANDONED_GAME" | "TRANSIENT_FINAL";
  },
  { status: "CONTINUING" | "DELETED" | "SKIPPED" }
>("cleanup:deleteGameIfStale");

const cleanupExpiredSessions = makeFunctionReference<
  "mutation",
  { now?: number },
  { deleted: number }
>("cleanup:cleanupExpiredSessions");

const cleanupStalePresenceSessions = makeFunctionReference<
  "mutation",
  { now?: number },
  { deleted: number; status: "CONTINUING" | "DONE" }
>("cleanup:cleanupStalePresenceSessions");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workpoolTest.register(backend, "aiGenerationWorkpool");
  workflowTest.register(backend);
  return backend;
}

async function seedGameWithDependents(
  gameType: "SLOPLASH" | "AI_CHAT_SHOWDOWN",
  status: "LOBBY" | "WRITING" | "FINAL_RESULTS",
  timestamp: number,
) {
  const backend = createTestBackend();
  const seeded = await backend.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      roomCode: gameType === "SLOPLASH" ? "KEEP" : "DROP",
      gameType,
      status,
      currentRound: status === "LOBBY" ? 0 : 1,
      totalRounds: 1,
      maxPlayers: 8,
      playerCount: 1,
      phaseGeneration: 1,
      timersDisabled: true,
      ttsMode: "OFF",
      ttsVoice: "RANDOM",
      votingPromptIndex: 0,
      votingRevealing: false,
      aiInputTokens: 1,
      aiOutputTokens: 1,
      aiCostUsd: 0.001,
      ...(status === "FINAL_RESULTS" ? { finalizedAt: timestamp } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const playerId = await ctx.db.insert("players", {
      gameId,
      name: "Player",
      normalizedName: "player",
      type: "HUMAN",
      idleRounds: 0,
      score: 0,
      humorRating: 1,
      winStreak: 0,
      participationStatus: "ACTIVE",
      joinedAt: timestamp,
    });
    const sessionId = await ctx.db.insert("playerSessions", {
      gameId,
      playerId,
      role: "PLAYER",
      capabilityHash: "hash",
      createdAt: timestamp,
      lastSeenAt: timestamp,
    });
    const roundId = await ctx.db.insert("rounds", {
      gameId,
      roundNumber: 1,
      openedAt: timestamp,
    });
    const promptId = await ctx.db.insert("prompts", {
      gameId,
      roundId,
      ordinal: 0,
      text: "Prompt",
    });
    await ctx.db.insert("promptAssignments", { gameId, roundId, promptId, playerId });
    const responseId = await ctx.db.insert("responses", {
      gameId,
      roundId,
      promptId,
      playerId,
      text: "Response",
      pointsEarned: 0,
      submittedAt: timestamp,
    });
    await ctx.db.insert("votes", {
      gameId,
      roundId,
      promptId,
      voterId: playerId,
      responseId,
      castAt: timestamp,
    });
    await ctx.db.insert("reactions", {
      gameId,
      roundId,
      responseId,
      playerId,
      emoji: "fire",
      createdAt: timestamp,
    });
    await ctx.db.insert("chatMessages", {
      gameId,
      playerId,
      content: "message",
      createdAt: timestamp,
    });
    await ctx.db.insert("gameModelUsage", {
      gameId,
      modelId: "google/gemini-3.1-flash-lite",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.001,
    });
    await ctx.db.insert("generationJobs", {
      gameId,
      kind: "RESPONSE",
      generationKey: "response:1:player",
      targetId: playerId,
      status: "SUCCEEDED",
      attempt: 1,
      createdAt: timestamp,
      completedAt: timestamp,
      updatedAt: timestamp,
    });
    return { gameId, playerId, sessionId };
  });
  return { backend, ...seeded };
}

function createTestWorkflow(backend: ReturnType<typeof createTestBackend>) {
  return backend.mutation(components.workflow.workflow.create, {
    workflowName: "cleanup-test",
    workflowHandle: "function://;cleanup.test:noop",
    workflowArgs: {},
    createOnly: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Convex scheduled cleanup", () => {
  test("deletes completed transient games and every owned dependent row", async () => {
    const { backend, gameId } = await seedGameWithDependents(
      "AI_CHAT_SHOWDOWN",
      "FINAL_RESULTS",
      1_000,
    );
    await expect(
      backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId,
        policy: "TRANSIENT_FINAL",
      }),
    ).resolves.toEqual({ status: "DELETED" });

    const remaining = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", gameId),
      players: await ctx.db.query("players").take(8),
      sessions: await ctx.db.query("playerSessions").take(8),
      rounds: await ctx.db.query("rounds").take(8),
      prompts: await ctx.db.query("prompts").take(8),
      assignments: await ctx.db.query("promptAssignments").take(8),
      responses: await ctx.db.query("responses").take(8),
      votes: await ctx.db.query("votes").take(8),
      reactions: await ctx.db.query("reactions").take(8),
      messages: await ctx.db.query("chatMessages").take(8),
      usages: await ctx.db.query("gameModelUsage").take(8),
      jobs: await ctx.db.query("generationJobs").take(8),
    }));
    expect(remaining).toEqual({
      game: null,
      players: [],
      sessions: [],
      rounds: [],
      prompts: [],
      assignments: [],
      responses: [],
      votes: [],
      reactions: [],
      messages: [],
      usages: [],
      jobs: [],
    });
  });

  test("cancels exact active work before deleting any other room state", async () => {
    vi.useFakeTimers();
    const { backend, gameId, playerId } = await seedGameWithDependents(
      "AI_CHAT_SHOWDOWN",
      "FINAL_RESULTS",
      1_000,
    );
    const workflowId = await createTestWorkflow(backend);
    await backend.run(async (ctx) => {
      for (let index = 0; index < 40; index += 1) {
        await ctx.db.insert("generationJobs", {
          gameId,
          kind: "RESPONSE",
          generationKey: `failed:${index}`,
          targetId: playerId,
          status: "FAILED",
          attempt: 1,
          error: "Expected test failure",
          createdAt: 500 + index,
          completedAt: 500 + index,
          updatedAt: 500 + index,
        });
      }
      await ctx.db.insert("generationJobs", {
        gameId,
        kind: "RESPONSE",
        generationKey: "active:workflow",
        targetId: playerId,
        status: "QUEUED",
        attempt: 1,
        workflowId,
        createdAt: 500,
        updatedAt: 500,
      });
    });

    await expect(
      backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId,
        policy: "TRANSIENT_FINAL",
      }),
    ).resolves.toEqual({ status: "CONTINUING" });

    const afterCancellation = await backend.run(async (ctx) => ({
      activeJob: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", gameId).eq("generationKey", "active:workflow"),
        )
        .unique(),
      failedJobs: await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", gameId).eq("status", "FAILED"),
        )
        .take(64),
      game: await ctx.db.get("games", gameId),
      player: await ctx.db.get("players", playerId),
    }));
    expect(afterCancellation).toMatchObject({
      activeJob: null,
      game: expect.any(Object),
      player: expect.any(Object),
    });
    expect(afterCancellation.failedJobs).toHaveLength(40);
    await expect(
      backend.query(components.workflow.workflow.getStatus, { workflowId }),
    ).rejects.toThrow("Workflow not found:");

    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(backend.run(async (ctx) => ctx.db.get("games", gameId))).resolves.toBeNull();
  });

  test("cleans terminal workflow storage and tolerates already-missing workflows", async () => {
    const { backend, gameId, playerId } = await seedGameWithDependents(
      "AI_CHAT_SHOWDOWN",
      "FINAL_RESULTS",
      1_000,
    );
    const terminalWorkflowId = await createTestWorkflow(backend);
    const missingWorkflowId = await createTestWorkflow(backend);
    await backend.mutation(components.workflow.workflow.cancel, {
      workflowId: terminalWorkflowId,
    });
    await backend.mutation(components.workflow.workflow.cancel, {
      workflowId: missingWorkflowId,
    });
    await backend.mutation(components.workflow.workflow.cleanup, {
      workflowId: missingWorkflowId,
    });
    await backend.run(async (ctx) => {
      await ctx.db.insert("generationJobs", {
        gameId,
        kind: "RESPONSE",
        generationKey: "terminal:workflow",
        targetId: playerId,
        status: "FAILED",
        attempt: 1,
        workflowId: terminalWorkflowId,
        error: "Expected test failure",
        createdAt: 500,
        completedAt: 500,
        updatedAt: 500,
      });
      await ctx.db.insert("generationJobs", {
        gameId,
        kind: "RESPONSE",
        generationKey: "missing:workflow",
        targetId: playerId,
        status: "CANCELED",
        attempt: 1,
        workflowId: missingWorkflowId,
        createdAt: 500,
        completedAt: 500,
        updatedAt: 500,
      });
    });

    await expect(
      backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId,
        policy: "TRANSIENT_FINAL",
      }),
    ).resolves.toEqual({ status: "DELETED" });
    await expect(
      backend.query(components.workflow.workflow.getStatus, {
        workflowId: terminalWorkflowId,
      }),
    ).rejects.toThrow("Workflow not found:");
    await expect(
      backend.query(components.workflow.workflow.getStatus, {
        workflowId: missingWorkflowId,
      }),
    ).rejects.toThrow("Workflow not found:");
  });

  test("continues cleanup in scheduled batches when a room exceeds one transaction", async () => {
    vi.useFakeTimers();
    const { backend, gameId, playerId } = await seedGameWithDependents(
      "AI_CHAT_SHOWDOWN",
      "FINAL_RESULTS",
      1_000,
    );
    await backend.run(async (ctx) => {
      for (let index = 0; index < 40; index += 1) {
        await ctx.db.insert("chatMessages", {
          gameId,
          playerId,
          content: `message-${index}`,
          createdAt: 1_001 + index,
        });
      }
    });

    await expect(
      backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId,
        policy: "TRANSIENT_FINAL",
      }),
    ).resolves.toEqual({ status: "CONTINUING" });
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(backend.run(async (ctx) => ctx.db.get("games", gameId))).resolves.toBeNull();
    await expect(
      backend.run(async (ctx) =>
        ctx.db
          .query("chatMessages")
          .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", gameId))
          .take(1),
      ),
    ).resolves.toEqual([]);
  });

  test("preserves final Slop-Lash history and rooms with recently active sessions", async () => {
    const retained = await seedGameWithDependents("SLOPLASH", "FINAL_RESULTS", 1_000);
    await expect(
      retained.backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId: retained.gameId,
        policy: "TRANSIENT_FINAL",
      }),
    ).resolves.toEqual({ status: "SKIPPED" });
    await expect(
      retained.backend.run(async (ctx) =>
        ctx.db.get("responses", (await ctx.db.query("responses").first())!._id),
      ),
    ).resolves.not.toBeNull();

    const active = await seedGameWithDependents("AI_CHAT_SHOWDOWN", "WRITING", 1_000);
    await active.backend.run(async (ctx) => {
      await ctx.db.patch("playerSessions", active.sessionId, { lastSeenAt: 2_500 });
    });
    await expect(
      active.backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId: active.gameId,
        policy: "ABANDONED_GAME",
      }),
    ).resolves.toEqual({ status: "SKIPPED" });
    await expect(
      active.backend.run(async (ctx) => ctx.db.get("games", active.gameId)),
    ).resolves.not.toBeNull();
  });

  test("measures transient retention from finalization rather than room creation", async () => {
    const recentFinal = await seedGameWithDependents("AI_CHAT_SHOWDOWN", "FINAL_RESULTS", 3_000);
    await recentFinal.backend.run(async (ctx) => {
      await ctx.db.patch("games", recentFinal.gameId, { createdAt: 1_000 });
    });

    await expect(
      recentFinal.backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 3_000,
        gameId: recentFinal.gameId,
        policy: "TRANSIENT_FINAL",
      }),
    ).resolves.toEqual({ status: "SKIPPED" });
    await expect(
      recentFinal.backend.run(async (ctx) => ctx.db.get("games", recentFinal.gameId)),
    ).resolves.not.toBeNull();
  });

  test("uses Presence to protect a live room even when its durable session timestamp is old", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
      timersDisabled: true,
      totalRounds: 1,
    });
    await backend.mutation(api.presence.heartbeat, {
      capability: host.capability,
      interval: 5_000,
      sessionId: "d72f7690-63a4-4af6-9dfb-f9f9c648590a",
    });
    await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      if (!game) throw new Error("Expected room");
      await ctx.db.patch("games", game._id, { updatedAt: 1_000 });
      await ctx.db.patch("playerSessions", host.sessionId, { lastSeenAt: 1_000 });
    });

    await expect(
      backend.mutation(deleteGameIfStale, {
        cutoff: 2_000,
        expectedUpdatedAt: 1_000,
        gameId: host.gameId,
        policy: "STALE_LOBBY",
      }),
    ).resolves.toEqual({ status: "SKIPPED" });
    await expect(
      backend.run(async (ctx) => ctx.db.get("games", host.gameId)),
    ).resolves.not.toBeNull();
  });

  test("removes revoked and expired capabilities without touching live sessions", async () => {
    const backend = createTestBackend();
    const ids = await backend.run(async (ctx) => {
      const gameId = await ctx.db.insert("games", {
        roomCode: "SESS",
        gameType: "SLOPLASH",
        status: "LOBBY",
        currentRound: 0,
        totalRounds: 1,
        maxPlayers: 8,
        playerCount: 0,
        phaseGeneration: 0,
        timersDisabled: true,
        ttsMode: "OFF",
        ttsVoice: "RANDOM",
        votingPromptIndex: 0,
        votingRevealing: false,
        aiInputTokens: 0,
        aiOutputTokens: 0,
        aiCostUsd: 0,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      const base = {
        gameId,
        role: "HOST" as const,
        capabilityHash: "hash",
        createdAt: 1_000,
        lastSeenAt: 1_000,
      };
      const expired = await ctx.db.insert("playerSessions", { ...base, expiresAt: 1_999 });
      const revoked = await ctx.db.insert("playerSessions", { ...base, revokedAt: 1_500 });
      const live = await ctx.db.insert("playerSessions", { ...base, expiresAt: 3_000 });
      return { expired, live, revoked };
    });

    await expect(backend.mutation(cleanupExpiredSessions, { now: 2_000 })).resolves.toEqual({
      deleted: 2,
    });
    const remaining = await backend.run(async (ctx) => ({
      expired: await ctx.db.get("playerSessions", ids.expired),
      revoked: await ctx.db.get("playerSessions", ids.revoked),
      live: await ctx.db.get("playerSessions", ids.live),
    }));
    expect(remaining.expired).toBeNull();
    expect(remaining.revoked).toBeNull();
    expect(remaining.live).not.toBeNull();
  });

  test("reaps orphaned Presence leases in bounded continuation batches", async () => {
    vi.useFakeTimers();
    const { backend, gameId, sessionId } = await seedGameWithDependents("SLOPLASH", "LOBBY", 1_000);
    await backend.run(async (ctx) => {
      for (let index = 0; index < 66; index += 1) {
        await ctx.db.insert("roomPresenceSessions", {
          gameId,
          roomSessionId: sessionId,
          tabSessionId: `stale-tab-${index}`,
          sessionToken: `stale-token-${index}`,
          lastHeartbeatAt: index,
        });
      }
      await ctx.db.insert("roomPresenceSessions", {
        gameId,
        roomSessionId: sessionId,
        tabSessionId: "fresh-tab",
        sessionToken: "fresh-token",
        lastHeartbeatAt: 180_000,
      });
    });

    await expect(backend.mutation(cleanupStalePresenceSessions, { now: 180_000 })).resolves.toEqual(
      { deleted: 64, status: "CONTINUING" },
    );
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers());

    const remaining = await backend.run(async (ctx) =>
      ctx.db
        .query("roomPresenceSessions")
        .withIndex("by_roomSessionId", (index) => index.eq("roomSessionId", sessionId))
        .take(80),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      sessionToken: "fresh-token",
      tabSessionId: "fresh-tab",
    });
  });
});
