/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workflowTest from "@convex-dev/workflow/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Phase = "FINAL_RESULTS" | "ROUND_RESULTS" | "VOTING" | "WRITING" | null;
type Session = {
  capability: string;
  gameId: Id<"games">;
  playerId: Id<"players"> | null;
  roomCode: string;
};

const submitResponseRef = makeFunctionReference<
  "mutation",
  {
    capability: string;
    promptId: Id<"prompts">;
    text: string;
    selectedPromptId: string | null;
  },
  { phase: Phase; responseId: Id<"responses"> }
>("matchslop:submitResponse");

const castVoteRef = makeFunctionReference<
  "mutation",
  {
    capability: string;
    promptId: Id<"prompts">;
    responseId: Id<"responses"> | null;
  },
  { phase: Phase; voteId: Id<"votes"> }
>("matchslop:castVote");

const advanceRef = makeFunctionReference<
  "mutation",
  { capability: string; expectedPhaseGeneration: number },
  { phase: Phase }
>("matchslop:advance");

const managePersonaRef = makeFunctionReference<
  "mutation",
  { capability: string; action: "generate" | "skip" },
  { started: boolean; workflowId: string | null }
>("matchslop:managePersona");

const enforceDeadlineRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; deadline: number; phaseGeneration: number },
  { advanced: boolean; phase: Phase }
>("matchslop:enforceDeadline");

const startGamePipelinesRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { profileStarted: boolean; responseJobs: number }
>("matchslopWorkflow:startGamePipelines");

const startProfilePipelineRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { started: boolean; workflowId: string | null }
>("matchslopWorkflow:startProfilePipeline");

const claimProfileRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; jobId: Id<"generationJobs"> },
  { kind: string; reason?: string }
>("matchslopEngine:claimProfile");

const persistProfileRef = makeFunctionReference<
  "mutation",
  {
    gameId: Id<"games">;
    jobId: Id<"generationJobs">;
    profile: unknown;
    usage: { modelId: string; inputTokens: number; outputTokens: number; costUsd: number };
  },
  { status: "CANCELED" | "DUPLICATE" | "SUCCEEDED" }
>("matchslopEngine:persistProfile");

const claimResponseRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; jobId: Id<"generationJobs"> },
  { kind: string; reason?: string }
>("matchslopEngine:claimResponse");

const persistResponseRef = makeFunctionReference<
  "mutation",
  {
    gameId: Id<"games">;
    jobId: Id<"generationJobs">;
    text: string;
    selectedPromptId: string | null;
    failReason: string | null;
    usage: { modelId: string; inputTokens: number; outputTokens: number; costUsd: number };
  },
  { status: "CANCELED" | "DUPLICATE" | "SUCCEEDED" }
>("matchslopEngine:persistResponse");

const PROFILE = {
  displayName: "Riley",
  backstory: "Riley writes in dry lowercase messages and takes soup very seriously.",
  appearance: "Adult with short dark hair, denim jacket, amused expression, cafe patio.",
  age: 27,
  location: "Oakland",
  bio: "soup critic. amateur bird lawyer.",
  tagline: null,
  prompts: [
    { id: "profile-1", prompt: "My most irrational fear", answer: "Escalators." },
    { id: "profile-2", prompt: "Typical Sunday", answer: "Soup and binoculars." },
    { id: "profile-3", prompt: "A hill I will die on", answer: "Brunch is lunch." },
  ],
  details: {
    job: "Technical writer",
    school: null,
    height: "5'8\"",
    languages: ["English"],
  },
};

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workflowTest.register(backend);
  return backend;
}

type Backend = ReturnType<typeof createTestBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T20:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function createMatch(
  backend: Backend,
  options?: { aiModelIds?: string[]; humanNames?: string[]; timersDisabled?: boolean },
) {
  vi.stubEnv("HOST_SECRET", "host-secret");
  const host: Session = await backend.action(api.rooms.create, {
    aiModelIds: options?.aiModelIds ?? [],
    gameType: "MATCHSLOP",
    hostSecret: "host-secret",
    personaIdentity: "WOMAN",
    personaModelId: "openai/gpt-5.6-luna",
    seekerIdentity: "MAN",
    timersDisabled: options?.timersDisabled ?? true,
    totalRounds: 2,
  });
  const guests: Session[] = [];
  for (const name of options?.humanNames ?? ["Avery", "Blake", "Casey"]) {
    guests.push(await backend.action(api.rooms.join, { name, roomCode: host.roomCode }));
  }
  await backend.run(async (ctx) => {
    const state = await ctx.db
      .query("matchSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
      .unique();
    if (!state) throw new Error("Missing MatchSlop state");
    await ctx.db.patch("matchSlopState", state._id, {
      profile: PROFILE,
      profileGeneration: {
        status: "READY",
        updatedAt: new Date().toISOString(),
        generationId: "seeded-profile",
      },
      personaImage: {
        status: "READY",
        imageUrl: "https://example.com/riley.webp",
        updatedAt: new Date().toISOString(),
      },
      updatedAt: Date.now(),
    });
  });
  const started = await backend.mutation(api.lobby.start, { capability: host.capability });
  return { guests, host, started };
}

async function loadCurrentRound(backend: Backend, gameId: Id<"games">) {
  return backend.run(async (ctx) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Missing game");
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_gameId_and_roundNumber", (index) =>
        index.eq("gameId", gameId).eq("roundNumber", game.currentRound),
      )
      .unique();
    if (!round) throw new Error("Missing round");
    const prompt = await ctx.db
      .query("prompts")
      .withIndex("by_roundId_and_ordinal", (index) =>
        index.eq("roundId", round._id).eq("ordinal", 0),
      )
      .unique();
    if (!prompt) throw new Error("Missing prompt");
    return { game, prompt, round };
  });
}

describe("Convex MatchSlop backend", () => {
  test("keeps persona generation host-only, idempotent, and restartable", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host: Session = await backend.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      hostSecret: "host-secret",
      personaIdentity: "WOMAN",
      personaModelId: "openai/gpt-5.6-luna",
      seekerIdentity: "MAN",
    });
    const guest: Session = await backend.action(api.rooms.join, {
      name: "Avery",
      roomCode: host.roomCode,
    });
    await expect(
      backend.mutation(managePersonaRef, {
        capability: guest.capability,
        action: "generate",
      }),
    ).rejects.toThrow("Host capability required");

    const first = await backend.mutation(managePersonaRef, {
      capability: host.capability,
      action: "generate",
    });
    expect(first).toMatchObject({ started: true, workflowId: expect.any(String) });
    await expect(
      backend.mutation(managePersonaRef, {
        capability: host.capability,
        action: "generate",
      }),
    ).resolves.toEqual({ started: false, workflowId: first.workflowId });

    const skipped = await backend.mutation(managePersonaRef, {
      capability: host.capability,
      action: "skip",
    });
    expect(skipped).toMatchObject({ started: true, workflowId: expect.any(String) });
    expect(skipped.workflowId).not.toBe(first.workflowId);
    const jobs = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) => index.eq("gameId", host.gameId))
        .take(16),
    );
    expect(jobs.find((job) => job.workflowId === first.workflowId)).toMatchObject({
      status: "CANCELED",
    });
    expect(jobs.find((job) => job.workflowId === skipped.workflowId)).toMatchObject({
      status: "QUEUED",
    });
  });

  test("hands a generated profile into its own durable portrait workflow", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host: Session = await backend.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      hostSecret: "host-secret",
      personaIdentity: "WOMAN",
      personaModelId: "openai/gpt-5.6-luna",
      seekerIdentity: "MAN",
      timersDisabled: false,
      totalRounds: 2,
    });
    await backend.action(api.rooms.join, { name: "Avery", roomCode: host.roomCode });
    await backend.action(api.rooms.join, { name: "Blake", roomCode: host.roomCode });
    await backend.mutation(api.lobby.start, { capability: host.capability });

    const started = await backend.mutation(startProfilePipelineRef, { gameId: host.gameId });
    expect(started).toMatchObject({ started: true, workflowId: expect.any(String) });
    const profileJob = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", host.gameId).eq("generationKey", "matchslop-profile"),
        )
        .unique(),
    );
    if (!profileJob) throw new Error("Missing profile job");
    await expect(
      backend.mutation(claimProfileRef, { gameId: host.gameId, jobId: profileJob._id }),
    ).resolves.toMatchObject({ kind: "ready" });
    await expect(
      backend.mutation(persistProfileRef, {
        gameId: host.gameId,
        jobId: profileJob._id,
        profile: PROFILE,
        usage: {
          modelId: "openai/gpt-5.6-luna",
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.001,
        },
      }),
    ).resolves.toEqual({ status: "SUCCEEDED" });

    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const state = await ctx.db
        .query("matchSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique();
      const imageJob = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index.eq("gameId", host.gameId).eq("generationKey", `matchslop:image:${profileJob._id}`),
        )
        .unique();
      return { game, imageJob, state };
    });
    expect(persisted.game?.phaseDeadline).toEqual(expect.any(Number));
    expect(persisted.state).toMatchObject({
      profile: PROFILE,
      profileGeneration: { status: "READY", generationId: profileJob._id },
      personaImage: { status: "PENDING", imageUrl: null },
    });
    expect(persisted.imageJob).toMatchObject({
      kind: "MATCHSLOP_IMAGE",
      status: "QUEUED",
      workflowId: expect.any(String),
    });
  });

  test("authenticates players and host, scores weighted votes, and advances with transcript and mood", async () => {
    const backend = createTestBackend();
    const fixture = await createMatch(backend);
    const current = await loadCurrentRound(backend, fixture.host.gameId);

    await expect(
      backend.mutation(advanceRef, {
        capability: fixture.guests[0]!.capability,
        expectedPhaseGeneration: current.game.phaseGeneration,
      }),
    ).rejects.toThrow("Host capability required");

    const submitted: Array<{ phase: Phase; responseId: Id<"responses"> }> = [];
    for (const [index, guest] of fixture.guests.entries()) {
      submitted.push(
        await backend.mutation(submitResponseRef, {
          capability: guest.capability,
          promptId: current.prompt._id,
          text: `line-${index + 1}`,
          selectedPromptId: "profile-1",
        }),
      );
    }
    expect(submitted.at(-1)?.phase).toBe("VOTING");

    await backend.mutation(castVoteRef, {
      capability: fixture.guests[0]!.capability,
      promptId: current.prompt._id,
      responseId: submitted[1]!.responseId,
    });
    await backend.mutation(castVoteRef, {
      capability: fixture.guests[1]!.capability,
      promptId: current.prompt._id,
      responseId: submitted[0]!.responseId,
    });
    const finalVote = await backend.mutation(castVoteRef, {
      capability: fixture.guests[2]!.capability,
      promptId: current.prompt._id,
      responseId: submitted[1]!.responseId,
    });
    expect(finalVote.phase).toBe("ROUND_RESULTS");

    const results = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", fixture.host.gameId);
      const state = await ctx.db
        .query("matchSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", fixture.host.gameId))
        .unique();
      const responses = await ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", fixture.host.gameId).eq("roundId", current.round._id),
        )
        .take(16);
      const replyJob = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) =>
          index
            .eq("gameId", fixture.host.gameId)
            .eq("generationKey", `matchslop:reply:1:${game?.phaseGeneration ?? -1}`),
        )
        .unique();
      return { game, replyJob, responses, state };
    });
    expect(results.game?.status).toBe("ROUND_RESULTS");
    expect(results.state?.lastRoundResult).toMatchObject({
      winnerResponseId: submitted[1]!.responseId,
      weightedVotes: 4,
      rawVotes: 2,
    });
    expect(
      results.responses.find((response) => response._id === submitted[1]!.responseId),
    ).toMatchObject({ pointsEarned: 150 });
    expect(
      results.responses.find((response) => response._id === submitted[0]!.responseId),
    ).toMatchObject({ pointsEarned: 50 });
    expect(results.replyJob).toMatchObject({
      kind: "MATCHSLOP_PERSONA_REPLY",
      status: "QUEUED",
    });
    expect(results.replyJob?.workflowId).toEqual(expect.any(String));

    await backend.run(async (ctx) => {
      if (!results.state || !results.replyJob) throw new Error("Missing results state");
      await ctx.db.patch("matchSlopState", results.state._id, {
        pendingPersonaReply: {
          status: "READY",
          reply: "fine, the escalator spreadsheet got me. keep going.",
          outcome: "CONTINUE",
          moodDelta: 8,
          generationId: results.replyJob._id,
          signalCategory: "solid",
          sideComment: "annoyingly specific",
          nextSignal: "stay weirdly precise",
        },
      });
    });
    const oldDeadline = results.game?.phaseDeadline;
    const oldGeneration = results.game?.phaseGeneration;
    if (oldGeneration === undefined) throw new Error("Expected phase generation");
    const advanced = await backend.mutation(advanceRef, {
      capability: fixture.host.capability,
      expectedPhaseGeneration: oldGeneration,
    });
    expect(advanced.phase).toBe("WRITING");

    const advancedState = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", fixture.host.gameId);
      const state = await ctx.db
        .query("matchSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", fixture.host.gameId))
        .unique();
      const transcript = await ctx.db
        .query("matchSlopTranscriptEntries")
        .withIndex("by_gameId_and_turn_and_ordinal", (index) =>
          index.eq("gameId", fixture.host.gameId),
        )
        .take(32);
      return { game, state, transcript };
    });
    expect(advancedState.game).toMatchObject({ currentRound: 2, status: "WRITING" });
    expect(advancedState.state).toMatchObject({
      mood: 58,
      latestSignalCategory: "solid",
      latestNextSignal: "stay weirdly precise",
    });
    expect(advancedState.transcript.map((entry) => entry.speaker)).toEqual(["PLAYERS", "PERSONA"]);

    if (oldDeadline !== undefined && oldGeneration !== undefined) {
      await expect(
        backend.mutation(enforceDeadlineRef, {
          gameId: fixture.host.gameId,
          deadline: oldDeadline,
          phaseGeneration: oldGeneration,
        }),
      ).resolves.toEqual({ advanced: false, phase: null });
    }
  });

  test("serves privacy-safe reactive stage rounds and controller progress", async () => {
    const backend = createTestBackend();
    const fixture = await createMatch(backend);
    const current = await loadCurrentRound(backend, fixture.host.gameId);

    const initialStage = await backend.query(api.gameViews.stage, {
      capability: fixture.host.capability,
    });
    expect(initialStage.rounds).toHaveLength(1);
    expect(initialStage.rounds[0]?.prompts[0]).toMatchObject({
      id: current.prompt._id,
      responses: [],
      text: current.prompt.text,
    });

    const firstController = await backend.query(api.gameViews.controller, {
      capability: fixture.guests[0]!.capability,
    });
    expect(firstController.serverNow).toEqual(expect.any(String));
    expect(firstController.matchslop?.writing).toMatchObject({
      promptId: current.prompt._id,
      submitted: false,
    });
    expect(firstController.matchslop?.progressCount).toEqual({ submitted: 0, total: 3 });

    const submitted: Array<{ phase: Phase; responseId: Id<"responses"> }> = [];
    for (const [index, guest] of fixture.guests.entries()) {
      submitted.push(
        await backend.mutation(submitResponseRef, {
          capability: guest.capability,
          promptId: current.prompt._id,
          selectedPromptId: "profile-1",
          text: `view-line-${index + 1}`,
        }),
      );
      if (index === 0) {
        const stageWhileWriting = await backend.query(api.gameViews.stage, {
          capability: fixture.host.capability,
        });
        expect(stageWhileWriting.rounds[0]?.prompts[0]?.responses).toMatchObject([
          {
            playerId: fixture.guests[0]!.playerId,
            text: "",
          },
        ]);
      }
    }

    const votingController = await backend.query(api.gameViews.controller, {
      capability: fixture.guests[0]!.capability,
    });
    expect(votingController.status).toBe("VOTING");
    expect(votingController.voting?.currentPrompt?.responses).toHaveLength(2);
    expect(votingController.matchslop?.voteProgressCount).toEqual({ voted: 0, total: 3 });

    await backend.mutation(castVoteRef, {
      capability: fixture.guests[0]!.capability,
      promptId: current.prompt._id,
      responseId: submitted[1]!.responseId,
    });
    const hostController = await backend.query(api.gameViews.controller, {
      capability: fixture.host.capability,
    });
    expect(hostController.matchslop?.voteProgressCount).toEqual({ voted: 1, total: 3 });

    const votingStage = await backend.query(api.gameViews.stage, {
      capability: fixture.host.capability,
    });
    const votingPrompt = votingStage.rounds[0]?.prompts[0];
    const votingResponses = votingPrompt?.responses as Array<{ playerId: string }> | undefined;
    expect(votingResponses).toHaveLength(3);
    expect(votingResponses?.every((response) => response.playerId === "")).toBe(true);
    expect(votingPrompt?.votes).toMatchObject([
      {
        responseId: null,
        voterId: fixture.guests[0]!.playerId,
      },
    ]);
  });

  test("returns a typed MatchSlop mode state from the final recap", async () => {
    const backend = createTestBackend();
    const fixture = await createMatch(backend);
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", fixture.host.gameId, { status: "FINAL_RESULTS" });
    });

    const recap = await backend.query(api.recaps.getByRoomCode, {
      roomCode: fixture.host.roomCode,
    });
    if (recap.kind !== "READY") throw new Error("Expected a ready recap");
    expect(recap.game.modeState).toMatchObject({
      outcome: "IN_PROGRESS",
      personaIdentity: "WOMAN",
      profile: { displayName: "Riley" },
      seekerIdentity: "MAN",
      transcript: [],
    });
    expect(recap.game.modeState).not.toHaveProperty("_id");
    expect(recap.game.winnerTaglinePending).toBe(false);
  });

  test("starts mode-local AI workflows and cancels a response that becomes stale", async () => {
    const backend = createTestBackend();
    const fixture = await createMatch(backend, {
      aiModelIds: ["google/gemini-3.5-flash-lite"],
      humanNames: ["Avery"],
    });
    const started = await backend.mutation(startGamePipelinesRef, {
      gameId: fixture.host.gameId,
    });
    expect(started.responseJobs).toBe(1);

    const pending = await backend.run(async (ctx) => {
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", fixture.host.gameId).eq("status", "QUEUED"),
        )
        .take(16);
      return jobs.find((job) => job.generationKey.startsWith("matchslop:response:"));
    });
    expect(pending).toMatchObject({ kind: "RESPONSE", workflowId: expect.any(String) });
    if (!pending) throw new Error("Missing AI response job");

    await expect(
      backend.mutation(claimResponseRef, {
        gameId: fixture.host.gameId,
        jobId: pending._id,
      }),
    ).resolves.toMatchObject({ kind: "ready" });
    await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", fixture.host.gameId);
      if (!game) throw new Error("Missing game");
      await ctx.db.patch("games", game._id, { phaseGeneration: game.phaseGeneration + 1 });
    });
    await expect(
      backend.mutation(persistResponseRef, {
        gameId: fixture.host.gameId,
        jobId: pending._id,
        text: "stale generated line",
        selectedPromptId: "profile-1",
        failReason: null,
        usage: {
          modelId: "google/gemini-3.5-flash-lite",
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.001,
        },
      }),
    ).resolves.toEqual({ status: "CANCELED" });

    const persisted = await backend.run(async (ctx) => ({
      job: await ctx.db.get("generationJobs", pending._id),
      responses: await ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", fixture.host.gameId))
        .take(16),
    }));
    expect(persisted.job).toMatchObject({ status: "CANCELED" });
    expect(persisted.responses).toHaveLength(0);
  });
});
