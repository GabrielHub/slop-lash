/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Doc, Id } from "./_generated/dataModel";
import {
  chatReplyWorkCompleteRef,
  claimChatReplyJobRef,
  executeChatReplyRef,
  persistChatReplyRef,
  type ChatReplyWorkArgs,
} from "./aiChatReplyContracts";
import schema from "./schema";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: generateTextMock };
});

const modules = import.meta.glob("./**/*.ts");

const createRoom = makeFunctionReference<
  "action",
  {
    aiModelIds: string[];
    gameType: "AI_CHAT_SHOWDOWN";
    hostName: string;
    hostSecret: string;
  },
  { capability: string; gameId: Id<"games">; roomCode: string }
>("rooms:create");

const startGame = makeFunctionReference<
  "mutation",
  { capability: string },
  { roundId: Id<"rounds"> }
>("lobby:start");

const sendChat = makeFunctionReference<
  "mutation",
  { capability: string; clientId?: string; content: string },
  {
    clientId: string | null;
    content: string;
    createdAt: string;
    id: Id<"chatMessages">;
    playerId: Id<"players">;
    replyToId: Id<"chatMessages"> | null;
  }
>("chat:send");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workpoolTest.register(backend, "aiGenerationWorkpool");
  return backend;
}

type TestBackend = ReturnType<typeof createTestBackend>;

async function createStartedGame(backend: TestBackend) {
  vi.stubEnv("HOST_SECRET", "host-secret");
  const host = await backend.action(createRoom, {
    aiModelIds: ["google/gemini-3-flash", "openai/gpt-5.4-mini"],
    gameType: "AI_CHAT_SHOWDOWN",
    hostName: "Host",
    hostSecret: "host-secret",
  });
  await backend.mutation(startGame, { capability: host.capability });
  const players = await backend.run(async (ctx) =>
    ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
      .take(16),
  );
  const hostPlayer = players.find((player) => player.type === "HUMAN");
  const aiPlayers = players.filter(
    (player): player is Doc<"players"> & { type: "AI"; modelId: string } =>
      player.type === "AI" && typeof player.modelId === "string",
  );
  if (!hostPlayer || aiPlayers.length < 2) throw new Error("Expected one host and two AI players");
  return { aiPlayers, host, hostPlayer };
}

async function sendMentionedMessage(
  backend: TestBackend,
  started: Awaited<ReturnType<typeof createStartedGame>>,
  suffix = "what have you got?",
) {
  const aiPlayer = started.aiPlayers[0];
  if (!aiPlayer) throw new Error("Expected an AI player");
  const message = await backend.mutation(sendChat, {
    capability: started.host.capability,
    clientId: `chat-${suffix}`,
    content: `${aiPlayer.name}, ${suffix}`,
  });
  const snapshot = await backend.run(async (ctx) => {
    const game = await ctx.db.get("games", started.host.gameId);
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_generationKey", (index) =>
        index.eq("gameId", started.host.gameId).eq("generationKey", `chat-reply:${message.id}`),
      )
      .take(2);
    return { game, job: jobs[0] };
  });
  if (!snapshot.game || !snapshot.job) throw new Error("Expected a queued chat reply job");
  const args: ChatReplyWorkArgs = {
    jobId: snapshot.job._id,
    gameId: started.host.gameId,
    triggerMessageId: message.id,
    phaseGeneration: snapshot.game.phaseGeneration,
    attempt: snapshot.job.attempt,
  };
  return { aiPlayer, args, job: snapshot.job, message };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-api-key");
});

afterEach(() => {
  vi.useRealTimers();
  generateTextMock.mockReset();
  vi.unstubAllEnvs();
});

describe("durable ChatSlop AI chat replies", () => {
  test("hands off one exact queued attempt and atomically claims bounded redacted context", async () => {
    const backend = createTestBackend();
    const started = await createStartedGame(backend);
    const baseTime = Date.now() - 20_000;
    await backend.run(async (ctx) => {
      for (let index = 0; index < 12; index += 1) {
        await ctx.db.insert("chatMessages", {
          gameId: started.host.gameId,
          playerId: started.hostPlayer._id,
          roundNumber: 1,
          content: `older message ${index}`,
          createdAt: baseTime + index,
        });
      }
    });

    const sent = await sendMentionedMessage(backend, started);
    expect(sent.job).toMatchObject({
      attempt: 1,
      kind: "CHAT_REPLY",
      status: "QUEUED",
      targetId: sent.message.id,
    });
    expect(sent.job.workId).toEqual(expect.any(String));

    const claimed = await backend.mutation(claimChatReplyJobRef, sent.args);
    if (claimed.status !== "CLAIMED") throw new Error(claimed.reason);
    expect(claimed.context.responderId).toBe(sent.aiPlayer._id);
    expect(claimed.context.messages).toHaveLength(8);
    expect(
      claimed.context.messages.every(
        (message) => Object.keys(message).toSorted().join(",") === "authorName,content",
      ),
    ).toBe(true);
    expect(
      claimed.context.scoreboard.every(
        (entry) => Object.keys(entry).toSorted().join(",") === "name,score,type",
      ),
    ).toBe(true);

    await expect(backend.mutation(claimChatReplyJobRef, sent.args)).resolves.toMatchObject({
      status: "IGNORED",
    });
    const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", sent.args.jobId));
    expect(job?.status).toBe("RUNNING");
  });

  test("generates through the shared AI SDK gateway and transactionally stores reply, usage, and success", async () => {
    generateTextMock.mockResolvedValue({
      text: '"<b>AI reply</b>"',
      usage: { inputTokens: 7, outputTokens: 4 },
    });
    const backend = createTestBackend();
    const started = await createStartedGame(backend);
    const sent = await sendMentionedMessage(backend, started, "roast my message");

    const result = await backend.action(executeChatReplyRef, sent.args);
    expect(result).toMatchObject({ status: "SUCCEEDED" });
    expect(result.messageId).not.toBeNull();

    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", started.host.gameId);
      const job = await ctx.db.get("generationJobs", sent.args.jobId);
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", started.host.gameId))
        .take(16);
      const usage = await ctx.db
        .query("gameModelUsage")
        .withIndex("by_gameId_and_modelId", (index) =>
          index.eq("gameId", started.host.gameId).eq("modelId", sent.aiPlayer.modelId),
        )
        .unique();
      return { game, job, messages, usage };
    });
    const reply = persisted.messages.find((message) => message._id === result.messageId);
    expect(reply).toMatchObject({
      content: "AI reply",
      playerId: sent.aiPlayer._id,
      replyToId: sent.message.id,
    });
    expect(persisted.job?.status).toBe("SUCCEEDED");
    expect(persisted.game).toMatchObject({ aiInputTokens: 7, aiOutputTokens: 4 });
    expect(persisted.usage).toMatchObject({ inputTokens: 7, outputTokens: 4 });

    const request = generateTextMock.mock.calls.at(-1)?.[0] as
      | { instructions?: string; prompt?: string }
      | undefined;
    expect(request?.instructions).toContain("untrusted context");
    expect(request?.prompt).toContain("<recent-chat>");
    expect(request?.prompt).not.toContain(started.hostPlayer._id);
    expect(request?.prompt).not.toContain(sent.message.id);

    await expect(backend.action(executeChatReplyRef, sent.args)).resolves.toEqual({
      status: "SKIPPED",
      messageId: null,
    });
    const afterDuplicate = await backend.run(async (ctx) =>
      ctx.db
        .query("chatMessages")
        .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", started.host.gameId))
        .take(16),
    );
    expect(afterDuplicate.filter((message) => message.replyToId === sent.message.id)).toHaveLength(
      1,
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  test("rejects cross-room work and cancels an exact queued job when its game closes", async () => {
    const backend = createTestBackend();
    const first = await createStartedGame(backend);
    const second = await createStartedGame(backend);
    const sent = await sendMentionedMessage(backend, first, "are you listening?");

    await expect(
      backend.mutation(claimChatReplyJobRef, { ...sent.args, gameId: second.host.gameId }),
    ).resolves.toMatchObject({ status: "IGNORED" });
    await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", first.host.gameId);
      if (!game) throw new Error("Expected game");
      await ctx.db.patch("games", game._id, {
        status: "FINAL_RESULTS",
        phaseGeneration: game.phaseGeneration + 1,
        updatedAt: Date.now(),
      });
    });

    await expect(backend.mutation(claimChatReplyJobRef, sent.args)).resolves.toMatchObject({
      status: "CANCELED",
    });
    const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", sent.args.jobId));
    expect(job).toMatchObject({ status: "CANCELED", error: "Chat reply phase is closed" });
  });

  test("rejects duplicate durable work for the same trigger", async () => {
    const backend = createTestBackend();
    const started = await createStartedGame(backend);
    const sent = await sendMentionedMessage(backend, started, "do not answer twice");
    await backend.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("generationJobs", {
        gameId: started.host.gameId,
        kind: "CHAT_REPLY",
        generationKey: `chat-reply:${sent.message.id}`,
        targetId: sent.message.id,
        status: "QUEUED",
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(backend.mutation(claimChatReplyJobRef, sent.args)).resolves.toMatchObject({
      status: "CANCELED",
      reason: "Duplicate chat reply work was rejected",
    });
    expect(generateTextMock).not.toHaveBeenCalled();
    const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", sent.args.jobId));
    expect(job).toMatchObject({
      status: "CANCELED",
      error: "Duplicate chat reply work was rejected",
    });
  });

  test("cancels safely when no mentioned AI remains active", async () => {
    const backend = createTestBackend();
    const started = await createStartedGame(backend);
    const sent = await sendMentionedMessage(backend, started, "answer me");
    await backend.run(async (ctx) => {
      for (const player of started.aiPlayers) {
        await ctx.db.patch("players", player._id, { participationStatus: "DISCONNECTED" });
      }
    });

    await expect(backend.action(executeChatReplyRef, sent.args)).resolves.toEqual({
      status: "CANCELED",
      messageId: null,
    });
    expect(generateTextMock).not.toHaveBeenCalled();
    const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", sent.args.jobId));
    expect(job).toMatchObject({
      status: "CANCELED",
      error: "Reserved AI responder is no longer active",
    });
  });

  test("rejects a stale post-generation write without reply or usage", async () => {
    const backend = createTestBackend();
    const started = await createStartedGame(backend);
    const sent = await sendMentionedMessage(backend, started, "wait for the phase change");
    const claimed = await backend.mutation(claimChatReplyJobRef, sent.args);
    if (claimed.status !== "CLAIMED") throw new Error(claimed.reason);
    await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", started.host.gameId);
      if (!game) throw new Error("Expected game");
      await ctx.db.patch("games", game._id, {
        phaseGeneration: game.phaseGeneration + 1,
        updatedAt: Date.now(),
      });
    });

    await expect(
      backend.mutation(persistChatReplyRef, {
        ...sent.args,
        responderId: claimed.context.responderId,
        text: "must not persist",
        usage: {
          modelId: claimed.context.modelId,
          inputTokens: 9,
          outputTokens: 5,
          costUsd: 0.01,
        },
      }),
    ).resolves.toMatchObject({ status: "CANCELED" });

    const persisted = await backend.run(async (ctx) => ({
      game: await ctx.db.get("games", started.host.gameId),
      job: await ctx.db.get("generationJobs", sent.args.jobId),
      messages: await ctx.db
        .query("chatMessages")
        .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", started.host.gameId))
        .take(16),
    }));
    expect(persisted.job).toMatchObject({
      status: "CANCELED",
      error: "Chat reply phase is no longer current",
    });
    expect(persisted.messages.filter((message) => message.replyToId === sent.message.id)).toEqual(
      [],
    );
    expect(persisted.game).toMatchObject({ aiInputTokens: 0, aiOutputTokens: 0, aiCostUsd: 0 });
  });

  test("records a matching Workpool failure while ignoring a foreign completion", async () => {
    const backend = createTestBackend();
    const started = await createStartedGame(backend);
    const sent = await sendMentionedMessage(backend, started, "please fail durably");
    const claimed = await backend.mutation(claimChatReplyJobRef, sent.args);
    if (claimed.status !== "CLAIMED") throw new Error(claimed.reason);
    if (!sent.job.workId) throw new Error("Expected Workpool id");

    await backend.mutation(chatReplyWorkCompleteRef, {
      workId: "foreign-work",
      context: sent.args,
      result: { kind: "failed", error: "must be ignored" },
    });
    await backend.mutation(chatReplyWorkCompleteRef, {
      workId: sent.job.workId,
      context: sent.args,
      result: { kind: "failed", error: "gateway unavailable" },
    });

    const job = await backend.run(async (ctx) => ctx.db.get("generationJobs", sent.args.jobId));
    expect(job).toMatchObject({ status: "FAILED", error: "gateway unavailable" });
  });
});
