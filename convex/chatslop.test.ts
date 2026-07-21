/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Phase = "FINAL_RESULTS" | "ROUND_RESULTS" | "VOTING" | "WRITING" | null;

type StagePayload = {
  rounds: Array<{
    prompts: Array<{
      assignments: Array<{ playerId: string; promptId: string }>;
      responses: Array<{
        id: string;
        player: { id: string; name: string };
        playerId: string;
        text: string;
      }>;
      roundId: string;
      votes: Array<{
        id: string;
        responseId: string | null;
        voterId: string;
      }>;
    }>;
  }>;
  status: string;
};

const stage = makeFunctionReference<"query", { capability: string }, StagePayload>(
  "gameViews:stage",
);

const respond = makeFunctionReference<
  "mutation",
  { capability: string; promptId: Id<"prompts">; text: string },
  { phase: Phase; responseId: Id<"responses"> }
>("chatslop:respond");

const vote = makeFunctionReference<
  "mutation",
  {
    capability: string;
    promptId: Id<"prompts">;
    responseId: Id<"responses">;
  },
  { phase: Phase; voteId: Id<"votes"> }
>("chatslop:vote");

const advance = makeFunctionReference<
  "mutation",
  { capability: string; expectedPhaseGeneration: number },
  { phase: Phase }
>("chatslop:advance");

const end = makeFunctionReference<"mutation", { capability: string }, { success: true }>(
  "chatslop:end",
);

const settleQuorum = makeFunctionReference<"mutation", { gameId: Id<"games"> }, { phase: Phase }>(
  "chatslop:settleQuorum",
);

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workpoolTest.register(backend, "aiGenerationWorkpool");
  return backend;
}

async function getPhaseGeneration(
  backend: ReturnType<typeof createTestBackend>,
  gameId: Id<"games">,
): Promise<number> {
  const game = await backend.run(async (ctx) => ctx.db.get("games", gameId));
  if (!game) throw new Error("Expected game");
  return game.phaseGeneration;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ChatSlop Convex state machine", () => {
  test("serves reactive stage rounds without leaking writing text or unrevealed choices", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
      totalRounds: 1,
    });
    const guestOne = await backend.action(api.rooms.join, {
      name: "Guest One",
      roomCode: host.roomCode,
    });
    const guestTwo = await backend.action(api.rooms.join, {
      name: "Guest Two",
      roomCode: host.roomCode,
    });
    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    const prompt = await backend.run(async (ctx) =>
      ctx.db
        .query("prompts")
        .withIndex("by_roundId_and_ordinal", (index) =>
          index.eq("roundId", started.roundId).eq("ordinal", 0),
        )
        .unique(),
    );
    if (!prompt || !host.playerId || !guestOne.playerId || !guestTwo.playerId) {
      throw new Error("Expected three participating players and one prompt");
    }

    const hostResponse = await backend.mutation(respond, {
      capability: host.capability,
      promptId: prompt._id,
      text: "Host secret draft",
    });
    const hostWriting = await backend.query(stage, { capability: host.capability });
    const hostWritingPrompt = hostWriting.rounds[0]?.prompts[0];
    expect(hostWritingPrompt?.roundId).toBe(started.roundId);
    expect(hostWritingPrompt?.responses).toEqual([
      expect.objectContaining({
        playerId: host.playerId,
        text: "Host secret draft",
      }),
    ]);

    const guestWriting = await backend.query(stage, { capability: guestOne.capability });
    expect(guestWriting.rounds[0]?.prompts[0]?.responses).toEqual([
      expect.objectContaining({
        playerId: host.playerId,
        text: "",
      }),
    ]);

    const guestOneResponse = await backend.mutation(respond, {
      capability: guestOne.capability,
      promptId: prompt._id,
      text: "Guest one draft",
    });
    const guestTwoResponse = await backend.mutation(respond, {
      capability: guestTwo.capability,
      promptId: prompt._id,
      text: "Guest two draft",
    });
    const hostVoting = await backend.query(stage, { capability: host.capability });
    const hostVotingPrompt = hostVoting.rounds[0]?.prompts[0];
    expect(hostVoting.status).toBe("VOTING");
    expect(hostVotingPrompt?.assignments).toEqual([]);
    expect(hostVotingPrompt?.responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: hostResponse.responseId, playerId: host.playerId }),
        expect.objectContaining({ id: guestOneResponse.responseId, playerId: "" }),
        expect.objectContaining({ id: guestTwoResponse.responseId, playerId: "" }),
      ]),
    );

    await backend.mutation(vote, {
      capability: host.capability,
      promptId: prompt._id,
      responseId: guestOneResponse.responseId,
    });
    const guestVoting = await backend.query(stage, { capability: guestOne.capability });
    const guestVotingPrompt = guestVoting.rounds[0]?.prompts[0];
    expect(guestVotingPrompt?.votes).toEqual([
      expect.objectContaining({
        id: "",
        responseId: null,
        voterId: host.playerId,
      }),
    ]);
    expect(guestVotingPrompt?.responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: guestOneResponse.responseId, playerId: guestOne.playerId }),
        expect.objectContaining({ id: hostResponse.responseId, playerId: "" }),
      ]),
    );

    await backend.mutation(vote, {
      capability: guestOne.capability,
      promptId: prompt._id,
      responseId: hostResponse.responseId,
    });
    await backend.mutation(vote, {
      capability: guestTwo.capability,
      promptId: prompt._id,
      responseId: hostResponse.responseId,
    });
    const results = await backend.query(stage, { capability: host.capability });
    const resultsPrompt = results.rounds[0]?.prompts[0];
    expect(results.status).toBe("ROUND_RESULTS");
    expect(resultsPrompt?.responses.every((response) => response.playerId !== "")).toBe(true);
    expect(resultsPrompt?.votes.every((item) => item.responseId !== null)).toBe(true);
  });

  test("accepts capability-authenticated responses and votes idempotently, then scores once", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
      totalRounds: 1,
    });
    const guestOne = await backend.action(api.rooms.join, {
      name: "Guest One",
      roomCode: host.roomCode,
    });
    const guestTwo = await backend.action(api.rooms.join, {
      name: "Guest Two",
      roomCode: host.roomCode,
    });
    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    const prompt = await backend.run(async (ctx) =>
      ctx.db
        .query("prompts")
        .withIndex("by_roundId_and_ordinal", (index) =>
          index.eq("roundId", started.roundId).eq("ordinal", 0),
        )
        .unique(),
    );
    expect(prompt).not.toBeNull();
    if (!prompt || !host.playerId || !guestOne.playerId || !guestTwo.playerId) {
      throw new Error("Expected three participating players and one prompt");
    }

    const hostResponse = await backend.mutation(respond, {
      capability: host.capability,
      promptId: prompt._id,
      text: "  <b>Host answer</b>  ",
    });
    const hostRetry = await backend.mutation(respond, {
      capability: host.capability,
      promptId: prompt._id,
      text: "a retry cannot replace the first answer",
    });
    expect(hostRetry).toEqual(hostResponse);
    expect(hostResponse.phase).toBeNull();

    const guestOneResponse = await backend.mutation(respond, {
      capability: guestOne.capability,
      promptId: prompt._id,
      text: "Guest one answer",
    });
    const guestTwoResponse = await backend.mutation(respond, {
      capability: guestTwo.capability,
      promptId: prompt._id,
      text: "Guest two answer",
    });
    expect(guestTwoResponse.phase).toBe("VOTING");

    await expect(
      backend.mutation(vote, {
        capability: host.capability,
        promptId: prompt._id,
        responseId: hostResponse.responseId,
      }),
    ).rejects.toThrow("Cannot vote for your own response");

    const hostVote = await backend.mutation(vote, {
      capability: host.capability,
      promptId: prompt._id,
      responseId: guestOneResponse.responseId,
    });
    const hostVoteRetry = await backend.mutation(vote, {
      capability: host.capability,
      promptId: prompt._id,
      responseId: guestTwoResponse.responseId,
    });
    expect(hostVoteRetry).toEqual(hostVote);
    await backend.mutation(vote, {
      capability: guestOne.capability,
      promptId: prompt._id,
      responseId: hostResponse.responseId,
    });
    const finalVote = await backend.mutation(vote, {
      capability: guestTwo.capability,
      promptId: prompt._id,
      responseId: hostResponse.responseId,
    });
    expect(finalVote.phase).toBe("ROUND_RESULTS");
    const finalVoteRetry = await backend.mutation(vote, {
      capability: guestTwo.capability,
      promptId: prompt._id,
      responseId: guestOneResponse.responseId,
    });
    expect(finalVoteRetry.voteId).toBe(finalVote.voteId);
    expect(finalVoteRetry.phase).toBe("ROUND_RESULTS");

    const persisted = await backend.run(async (ctx) => {
      const [game, round, players, responses, votes] = await Promise.all([
        ctx.db.get("games", host.gameId),
        ctx.db.get("rounds", started.roundId),
        ctx.db
          .query("players")
          .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
          .take(16),
        ctx.db
          .query("responses")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", started.roundId),
          )
          .take(16),
        ctx.db
          .query("votes")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", started.roundId),
          )
          .take(16),
      ]);
      return { game, players, responses, round, votes };
    });
    expect(persisted.game).toMatchObject({
      status: "ROUND_RESULTS",
      votingRevealing: true,
    });
    expect(persisted.game?.phaseDeadline).toBeUndefined();
    expect(persisted.round?.completedAt).toEqual(expect.any(Number));
    expect(persisted.responses).toHaveLength(3);
    expect(persisted.responses.find((item) => item._id === hostResponse.responseId)?.text).toBe(
      "Host answer",
    );
    expect(persisted.votes).toHaveLength(3);
    expect(persisted.players.find((player) => player._id === host.playerId)?.score).toBeGreaterThan(
      0,
    );
    expect(
      persisted.responses.find((item) => item._id === hostResponse.responseId)?.pointsEarned,
    ).toBeGreaterThan(0);

    await expect(
      backend.mutation(advance, {
        capability: host.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, host.gameId),
      }),
    ).resolves.toEqual({ phase: "FINAL_RESULTS" });
    const finished = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(finished?.status).toBe("FINAL_RESULTS");
    expect(finished?.phaseDeadline).toBeUndefined();
  });

  test("rejects foreign records and non-host advancement while keeping closed-phase retries idempotent", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const first = await backend.action(api.rooms.create, {
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "First Host",
      hostSecret: "host-secret",
    });
    const firstGuestOne = await backend.action(api.rooms.join, {
      name: "First Guest One",
      roomCode: first.roomCode,
    });
    const firstGuestTwo = await backend.action(api.rooms.join, {
      name: "First Guest Two",
      roomCode: first.roomCode,
    });
    const firstStarted = await backend.mutation(api.lobby.start, {
      capability: first.capability,
    });

    const second = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.5-flash-lite", "openai/gpt-5.6-luna"],
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Second Host",
      hostSecret: "host-secret",
    });
    const secondStarted = await backend.mutation(api.lobby.start, {
      capability: second.capability,
    });
    const [firstPrompt, secondPrompt] = await backend.run(async (ctx) =>
      Promise.all([
        ctx.db
          .query("prompts")
          .withIndex("by_roundId_and_ordinal", (index) =>
            index.eq("roundId", firstStarted.roundId).eq("ordinal", 0),
          )
          .unique(),
        ctx.db
          .query("prompts")
          .withIndex("by_roundId_and_ordinal", (index) =>
            index.eq("roundId", secondStarted.roundId).eq("ordinal", 0),
          )
          .unique(),
      ]),
    );
    if (!firstPrompt || !secondPrompt) throw new Error("Expected both prompts");

    await expect(
      backend.mutation(respond, {
        capability: first.capability,
        promptId: secondPrompt._id,
        text: "foreign prompt",
      }),
    ).rejects.toThrow("Prompt is not from the current round");
    await expect(
      backend.mutation(advance, {
        capability: firstGuestOne.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, first.gameId),
      }),
    ).rejects.toThrow("Host capability required");

    const firstHostResponse = await backend.mutation(respond, {
      capability: first.capability,
      promptId: firstPrompt._id,
      text: "First host response",
    });
    await backend.mutation(respond, {
      capability: firstGuestOne.capability,
      promptId: firstPrompt._id,
      text: "First guest one response",
    });
    await backend.mutation(respond, {
      capability: firstGuestTwo.capability,
      promptId: firstPrompt._id,
      text: "First guest two response",
    });

    const foreignResponseId = await backend.run(async (ctx) => {
      const secondAi = await ctx.db
        .query("players")
        .withIndex("by_gameId_and_type", (index) =>
          index.eq("gameId", second.gameId).eq("type", "AI"),
        )
        .first();
      if (!secondAi) throw new Error("Expected a second-room AI player");
      return ctx.db.insert("responses", {
        gameId: second.gameId,
        roundId: secondStarted.roundId,
        promptId: secondPrompt._id,
        playerId: secondAi._id,
        text: "Foreign response",
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
    });
    await expect(
      backend.mutation(vote, {
        capability: first.capability,
        promptId: firstPrompt._id,
        responseId: foreignResponseId,
      }),
    ).rejects.toThrow("Response does not belong to this prompt");

    await backend.mutation(vote, {
      capability: first.capability,
      promptId: firstPrompt._id,
      responseId: (await backend.run(async (ctx) =>
        ctx.db
          .query("responses")
          .withIndex("by_promptId_and_playerId", (index) =>
            index.eq("promptId", firstPrompt._id).eq("playerId", firstGuestOne.playerId!),
          )
          .unique(),
      ))!._id,
    });
    await backend.mutation(vote, {
      capability: firstGuestOne.capability,
      promptId: firstPrompt._id,
      responseId: firstHostResponse.responseId,
    });
    await backend.mutation(vote, {
      capability: firstGuestTwo.capability,
      promptId: firstPrompt._id,
      responseId: firstHostResponse.responseId,
    });
    await expect(
      backend.mutation(respond, {
        capability: firstGuestOne.capability,
        promptId: firstPrompt._id,
        text: "late replacement",
      }),
    ).resolves.toMatchObject({ phase: "ROUND_RESULTS" });
  });

  test("host force-advance fills forfeits and abstains, queues AI work, and opens the next round", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.5-flash-lite", "openai/gpt-5.6-luna"],
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
      totalRounds: 2,
    });
    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    const prompt = await backend.run(async (ctx) =>
      ctx.db
        .query("prompts")
        .withIndex("by_roundId_and_ordinal", (index) =>
          index.eq("roundId", started.roundId).eq("ordinal", 0),
        )
        .unique(),
    );
    if (!prompt) throw new Error("Expected the first prompt");

    await backend.mutation(respond, {
      capability: host.capability,
      promptId: prompt._id,
      text: "The one completed response",
    });
    await expect(
      backend.mutation(advance, {
        capability: host.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, host.gameId),
      }),
    ).resolves.toEqual({ phase: "VOTING" });
    const votingState = await backend.run(async (ctx) => {
      const [game, responses, jobs] = await Promise.all([
        ctx.db.get("games", host.gameId),
        ctx.db
          .query("responses")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", started.roundId),
          )
          .take(16),
        ctx.db
          .query("generationJobs")
          .withIndex("by_gameId_and_generationKey", (index) => index.eq("gameId", host.gameId))
          .take(16),
      ]);
      return { game, jobs, responses };
    });
    expect(votingState.game).toMatchObject({ status: "VOTING" });
    expect(votingState.game?.phaseDeadline).toBeUndefined();
    expect(votingState.responses).toHaveLength(3);
    expect(votingState.responses.filter((response) => response.text === "[forfeit]")).toHaveLength(
      2,
    );
    expect(votingState.jobs.filter((job) => job.kind === "VOTE")).toHaveLength(2);
    expect(votingState.jobs.filter((job) => job.kind === "VOTE")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generationKey: expect.stringMatching(`^vote:1:${prompt._id}:`),
          status: "QUEUED",
        }),
      ]),
    );

    const staleSettle = await backend.mutation(settleQuorum, { gameId: host.gameId });
    expect(staleSettle.phase).toBeNull();
    await expect(
      backend.mutation(advance, {
        capability: host.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, host.gameId),
      }),
    ).resolves.toEqual({ phase: "ROUND_RESULTS" });
    const results = await backend.run(async (ctx) => {
      const [votes, hostPlayer] = await Promise.all([
        ctx.db
          .query("votes")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", started.roundId),
          )
          .take(16),
        host.playerId ? ctx.db.get("players", host.playerId) : null,
      ]);
      return { hostPlayer, votes };
    });
    expect(results.votes).toHaveLength(3);
    expect(results.votes.every((item) => item.responseId === undefined)).toBe(true);
    expect(results.hostPlayer?.score).toBeGreaterThan(0);

    await expect(
      backend.mutation(advance, {
        capability: host.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, host.gameId),
      }),
    ).resolves.toEqual({ phase: "WRITING" });
    const nextRound = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const round = await ctx.db
        .query("rounds")
        .withIndex("by_gameId_and_roundNumber", (index) =>
          index.eq("gameId", host.gameId).eq("roundNumber", 2),
        )
        .unique();
      if (!round) return { assignments: [], game, jobs: [], prompts: [] };
      const [prompts, assignments, jobs] = await Promise.all([
        ctx.db
          .query("prompts")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", round._id),
          )
          .take(4),
        ctx.db
          .query("promptAssignments")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", round._id),
          )
          .take(16),
        ctx.db
          .query("generationJobs")
          .withIndex("by_gameId_and_generationKey", (index) => index.eq("gameId", host.gameId))
          .take(32),
      ]);
      return { assignments, game, jobs, prompts };
    });
    expect(nextRound.game).toMatchObject({
      currentRound: 2,
      status: "WRITING",
    });
    expect(nextRound.game?.phaseDeadline).toBeUndefined();
    expect(nextRound.prompts).toHaveLength(1);
    expect(nextRound.assignments).toHaveLength(3);
    expect(
      nextRound.jobs.filter(
        (job) => job.kind === "RESPONSE" && job.generationKey.startsWith("response:2:"),
      ),
    ).toHaveLength(2);
  });

  test("ends active games early exactly once and treats repeated end calls as safe", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.5-flash-lite", "openai/gpt-5.6-luna"],
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
      totalRounds: 3,
    });
    const started = await backend.mutation(api.lobby.start, {
      capability: host.capability,
    });
    const before = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    await expect(backend.mutation(end, { capability: host.capability })).resolves.toEqual({
      success: true,
    });
    const firstEnd = await backend.run(async (ctx) => {
      const [game, round, responses] = await Promise.all([
        ctx.db.get("games", host.gameId),
        ctx.db.get("rounds", started.roundId),
        ctx.db
          .query("responses")
          .withIndex("by_gameId_and_roundId", (index) =>
            index.eq("gameId", host.gameId).eq("roundId", started.roundId),
          )
          .take(16),
      ]);
      return { game, responses, round };
    });
    expect(firstEnd.game).toMatchObject({
      finalizedAt: expect.any(Number),
      phaseGeneration: (before?.phaseGeneration ?? 0) + 1,
      status: "FINAL_RESULTS",
    });
    expect(firstEnd.game?.phaseDeadline).toBeUndefined();
    expect(firstEnd.responses).toHaveLength(3);
    expect(firstEnd.round?.completedAt).toEqual(expect.any(Number));

    await expect(backend.mutation(end, { capability: host.capability })).resolves.toEqual({
      success: true,
    });
    const repeated = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(repeated?.phaseGeneration).toBe(firstEnd.game?.phaseGeneration);
    expect((await backend.mutation(settleQuorum, { gameId: host.gameId })).phase).toBeNull();
  });
});
