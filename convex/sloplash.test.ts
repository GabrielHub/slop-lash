/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import schema from "./schema";
import { FORFEIT_MARKER } from "../src/games/core/constants";

const modules = import.meta.glob("./**/*.ts");

type AdvancePhase =
  | "FINAL_RESULTS"
  | "ROUND_RESULTS"
  | "VOTING"
  | "VOTING_SUBPHASE"
  | "WRITING"
  | null;

type Session = {
  capability: string;
  gameId: Id<"games">;
  playerId: Id<"players"> | null;
  roomCode: string;
};

type StagePayload = {
  currentRound: number;
  me: { isHost: boolean; playerId: string | null };
  rounds: Array<{
    roundNumber: number;
    prompts: Array<{
      assignments: Array<{ playerId: string; promptId: string }>;
      id: string;
      responses: Array<{
        id: string;
        playerId: string;
        player: { id: string; name: string };
        reactions: Array<{ emoji: string; playerId: string }>;
        text: string;
      }>;
      text: string;
      votes: Array<{ id: string; responseId: string | null; voterId: string }>;
    }>;
  }>;
  status: string;
  votingPromptIndex: number;
  votingRevealing: boolean;
};

const submitResponseRef = makeFunctionReference<
  "mutation",
  { capability: string; promptId: Id<"prompts">; text: string },
  { phase: AdvancePhase; responseId: Id<"responses"> }
>("sloplash:submitResponse");

const castVoteRef = makeFunctionReference<
  "mutation",
  {
    capability: string;
    promptId: Id<"prompts">;
    responseId: Id<"responses"> | null;
  },
  { phase: AdvancePhase; voteId: Id<"votes"> }
>("sloplash:castVote");

const advanceRef = makeFunctionReference<
  "mutation",
  { capability: string; expectedPhaseGeneration: number },
  { phase: AdvancePhase }
>("sloplash:advance");

const endRef = makeFunctionReference<"mutation", { capability: string }, { success: true }>(
  "sloplash:end",
);

const settleQuorumRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { phase: AdvancePhase }
>("sloplash:settleQuorum");

const enforceDeadlineRef = makeFunctionReference<
  "mutation",
  { deadline: number; gameId: Id<"games">; phaseGeneration: number },
  { advanced: boolean; phase: AdvancePhase }
>("sloplash:enforceDeadline");

const stageRef = makeFunctionReference<"query", { capability: string }, StagePayload>(
  "gameViews:stage",
);

const toggleReactionRef = makeFunctionReference<
  "mutation",
  { capability: string; emoji: "fire"; responseId: Id<"responses"> },
  { added: boolean }
>("reactions:toggle");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

type Backend = ReturnType<typeof createTestBackend>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function createHumanGame(
  backend: Backend,
  args: { timersDisabled: boolean; totalRounds: number },
) {
  const host = await backend.action(api.rooms.create, {
    gameType: "SLOPLASH",
    hostName: "Host",
    hostSecret: "host-secret",
    timersDisabled: args.timersDisabled,
    totalRounds: args.totalRounds,
  });
  const guests: Session[] = [];
  for (const name of ["Guest A", "Guest B", "Guest C"]) {
    guests.push(
      await backend.action(api.rooms.join, {
        name,
        roomCode: host.roomCode,
      }),
    );
  }
  await backend.mutation(api.lobby.start, { capability: host.capability });
  const sessions: Session[] = [host, ...guests];
  return {
    host,
    sessions,
    capabilities: new Map(
      sessions.flatMap((session) =>
        session.playerId ? [[session.playerId, session.capability] as const] : [],
      ),
    ),
  };
}

async function loadCurrentState(backend: Backend, gameId: Id<"games">) {
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
    const [players, prompts, assignments, responses, votes] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(16),
      ctx.db
        .query("prompts")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(32),
      ctx.db
        .query("promptAssignments")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(64),
      ctx.db
        .query("responses")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(64),
      ctx.db
        .query("votes")
        .withIndex("by_gameId_and_roundId", (index) =>
          index.eq("gameId", gameId).eq("roundId", round._id),
        )
        .take(256),
    ]);
    return { assignments, game, players, prompts, responses, round, votes };
  });
}

async function getPhaseGeneration(backend: Backend, gameId: Id<"games">): Promise<number> {
  const game = await backend.run(async (ctx) => ctx.db.get("games", gameId));
  if (!game) throw new Error("Expected game");
  return game.phaseGeneration;
}

async function submitRemainingHumanResponses(
  backend: Backend,
  gameId: Id<"games">,
  capabilities: Map<string, string>,
): Promise<void> {
  const state = await loadCurrentState(backend, gameId);
  const existing = new Set(
    state.responses.map((response) => `${response.promptId}:${response.playerId}`),
  );
  for (const [index, assignment] of state.assignments.entries()) {
    const capability = capabilities.get(assignment.playerId);
    const key = `${assignment.promptId}:${assignment.playerId}`;
    if (!capability || existing.has(key)) continue;
    await backend.mutation(submitResponseRef, {
      capability,
      promptId: assignment.promptId,
      text: `answer-${index}`,
    });
    existing.add(key);
  }
}

function votablePrompts(state: Awaited<ReturnType<typeof loadCurrentState>>) {
  return state.prompts
    .filter((prompt) => {
      const responses = state.responses.filter((response) => response.promptId === prompt._id);
      return (
        responses.length >= 2 && !responses.some((response) => response.text === FORFEIT_MARKER)
      );
    })
    .toSorted((left, right) => left._id.localeCompare(right._id));
}

describe("Convex Slop-Lash state machine", () => {
  test("guards manual advance retries by phase generation and makes early end idempotent", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const { host } = await createHumanGame(backend, {
      timersDisabled: true,
      totalRounds: 3,
    });
    const before = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    if (!before) throw new Error("Missing game");

    await expect(
      backend.mutation(api.sloplash.advance, {
        capability: host.capability,
        expectedPhaseGeneration: before.phaseGeneration,
      }),
    ).resolves.toEqual({ phase: "VOTING" });
    await expect(
      backend.mutation(api.sloplash.advance, {
        capability: host.capability,
        expectedPhaseGeneration: before.phaseGeneration,
      }),
    ).rejects.toThrow("Game phase already advanced");

    const voting = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(voting).toMatchObject({
      phaseGeneration: before.phaseGeneration + 1,
      status: "VOTING",
      votingRevealing: false,
    });

    await expect(backend.mutation(endRef, { capability: host.capability })).resolves.toEqual({
      success: true,
    });
    const ended = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    await expect(backend.mutation(endRef, { capability: host.capability })).resolves.toEqual({
      success: true,
    });
    const retried = await backend.run(async (ctx) => ctx.db.get("games", host.gameId));
    expect(retried?.phaseGeneration).toBe(ended?.phaseGeneration);
    expect(retried?.status).toBe("FINAL_RESULTS");
  });

  test("authenticates human responses, settles writing quorum, and queues per-prompt AI votes", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      aiModelIds: ["google/gemini-3.1-flash-lite"],
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
      timersDisabled: true,
      totalRounds: 1,
    });
    const guestA = await backend.action(api.rooms.join, {
      name: "Guest A",
      roomCode: host.roomCode,
    });
    const guestB = await backend.action(api.rooms.join, {
      name: "Guest B",
      roomCode: host.roomCode,
    });
    await backend.mutation(api.lobby.start, { capability: host.capability });
    const capabilities = new Map([
      [host.playerId!, host.capability],
      [guestA.playerId!, guestA.capability],
      [guestB.playerId!, guestB.capability],
    ]);
    const initial = await loadCurrentState(backend, host.gameId);
    const firstHumanAssignment = initial.assignments.find((assignment) =>
      capabilities.has(assignment.playerId),
    );
    if (!firstHumanAssignment) throw new Error("Missing human assignment");

    const submitted = await backend.mutation(submitResponseRef, {
      capability: capabilities.get(firstHumanAssignment.playerId)!,
      promptId: firstHumanAssignment.promptId,
      text: "  <b>clean joke</b>  ",
    });
    expect(submitted.phase).toBeNull();
    await expect(
      backend.mutation(submitResponseRef, {
        capability: capabilities.get(firstHumanAssignment.playerId)!,
        promptId: firstHumanAssignment.promptId,
        text: "duplicate",
      }),
    ).rejects.toThrow("Already responded");

    const unassigned = initial.assignments.find(
      (assignment) =>
        assignment.promptId === firstHumanAssignment.promptId &&
        assignment.playerId !== firstHumanAssignment.playerId,
    );
    const outsider = initial.players.find(
      (player) =>
        player.type === "HUMAN" &&
        player._id !== firstHumanAssignment.playerId &&
        player._id !== unassigned?.playerId,
    );
    if (!outsider) throw new Error("Missing unassigned player");
    await expect(
      backend.mutation(submitResponseRef, {
        capability: capabilities.get(outsider._id)!,
        promptId: firstHumanAssignment.promptId,
        text: "not mine",
      }),
    ).rejects.toThrow("not assigned");

    await submitRemainingHumanResponses(backend, host.gameId, capabilities);
    const beforeAi = await loadCurrentState(backend, host.gameId);
    expect(beforeAi.game.status).toBe("WRITING");
    expect(beforeAi.responses.find((response) => response._id === submitted.responseId)?.text).toBe(
      "clean joke",
    );
    const ai = beforeAi.players.find((player) => player.type === "AI");
    if (!ai) throw new Error("Missing AI player");
    await backend.run(async (ctx) => {
      for (const assignment of beforeAi.assignments.filter(
        (candidate) => candidate.playerId === ai._id,
      )) {
        await ctx.db.insert("responses", {
          gameId: host.gameId,
          roundId: beforeAi.round._id,
          promptId: assignment.promptId,
          playerId: ai._id,
          text: `AI ${assignment.promptId}`,
          pointsEarned: 0,
          submittedAt: Date.now(),
        });
      }
    });
    await expect(backend.mutation(settleQuorumRef, { gameId: host.gameId })).resolves.toEqual({
      phase: "VOTING",
    });

    const persisted = await backend.run(async (ctx) => {
      const game = await ctx.db.get("games", host.gameId);
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("status", "QUEUED"),
        )
        .take(32);
      return { game, jobs: jobs.filter((job) => job.kind === "VOTE") };
    });
    expect(persisted.game).toMatchObject({ status: "VOTING", votingRevealing: false });
    expect(persisted.jobs).toHaveLength(2);
    expect(
      persisted.jobs.every(
        (job) =>
          job.targetId === ai._id &&
          job.generationKey.startsWith(`vote:1:`) &&
          job.generationKey.endsWith(`:${ai._id}`),
      ),
    ).toBe(true);
  });

  test("limits writing responses and unrevealed authors to the capability owner", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const displayHost = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostParticipation: "DISPLAY_ONLY",
      hostSecret: "host-secret",
      timersDisabled: true,
      totalRounds: 1,
    });
    const players: Session[] = [];
    for (const name of ["Player A", "Player B", "Player C"]) {
      players.push(
        await backend.action(api.rooms.join, {
          name,
          roomCode: displayHost.roomCode,
        }),
      );
    }
    await backend.mutation(api.lobby.start, { capability: displayHost.capability });
    const capabilities = new Map(
      players.map((session) => [session.playerId!, session.capability] as const),
    );
    const writing = await loadCurrentState(backend, displayHost.gameId);
    const assignment = writing.assignments[0];
    if (!assignment) throw new Error("Missing assignment");
    await backend.mutation(submitResponseRef, {
      capability: capabilities.get(assignment.playerId)!,
      promptId: assignment.promptId,
      text: "private draft",
    });

    const displayWriting = await backend.query(stageRef, {
      capability: displayHost.capability,
    });
    expect(displayWriting.rounds[0]?.prompts.every((prompt) => prompt.responses.length === 0)).toBe(
      true,
    );
    expect(
      displayWriting.rounds[0]?.prompts.every(
        (prompt) => prompt.text === "" && prompt.assignments.length === 0,
      ),
    ).toBe(true);
    const playerWriting = await backend.query(stageRef, {
      capability: capabilities.get(assignment.playerId)!,
    });
    expect(playerWriting.rounds[0]?.prompts.flatMap((prompt) => prompt.responses)).toEqual([
      expect.objectContaining({
        playerId: assignment.playerId,
        text: "private draft",
      }),
    ]);
    const assignedPromptIds = new Set<string>(
      writing.assignments
        .filter((candidate) => candidate.playerId === assignment.playerId)
        .map((candidate) => candidate.promptId),
    );
    expect(
      playerWriting.rounds[0]?.prompts.every((prompt) =>
        assignedPromptIds.has(prompt.id)
          ? prompt.text.length > 0 &&
            prompt.assignments.every((candidate) => candidate.playerId === assignment.playerId)
          : prompt.text === "" && prompt.assignments.length === 0 && prompt.responses.length === 0,
      ),
    ).toBe(true);

    await submitRemainingHumanResponses(backend, displayHost.gameId, capabilities);
    const voting = await loadCurrentState(backend, displayHost.gameId);
    const currentPrompt = votablePrompts(voting)[0];
    if (!currentPrompt) throw new Error("Missing current prompt");
    const promptResponses = voting.responses.filter(
      (response) => response.promptId === currentPrompt._id,
    );
    const respondent = promptResponses[0];
    if (!respondent) throw new Error("Missing respondent");

    const displayVoting = await backend.query(stageRef, {
      capability: displayHost.capability,
    });
    const displayPrompt = displayVoting.rounds[0]?.prompts.find(
      (prompt) => prompt.id === currentPrompt._id,
    );
    expect(displayPrompt?.responses.every((response) => response.playerId === "")).toBe(true);
    const respondentVoting = await backend.query(stageRef, {
      capability: capabilities.get(respondent.playerId)!,
    });
    const respondentPrompt = respondentVoting.rounds[0]?.prompts.find(
      (prompt) => prompt.id === currentPrompt._id,
    );
    expect(
      respondentPrompt?.responses.find((response) => response.id === respondent._id)?.playerId,
    ).toBe(respondent.playerId);
    expect(
      respondentPrompt?.responses
        .filter((response) => response.id !== respondent._id)
        .every((response) => response.playerId === ""),
    ).toBe(true);
    const futurePrompt = votablePrompts(voting)[1];
    if (!futurePrompt) throw new Error("Missing future prompt");
    const hiddenFuturePrompt = respondentVoting.rounds[0]?.prompts.find(
      (prompt) => prompt.id === futurePrompt._id,
    );
    expect(hiddenFuturePrompt).toMatchObject({ assignments: [], text: "", votes: [] });
    expect(hiddenFuturePrompt?.responses).toHaveLength(2);
    expect(
      hiddenFuturePrompt?.responses.every(
        (response) =>
          response.text === "" && response.playerId === "" && response.reactions.length === 0,
      ),
    ).toBe(true);
  });

  test("shares the engine's forfeiture filter and prompt ordering with controller views", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const fixture = await createHumanGame(backend, {
      timersDisabled: true,
      totalRounds: 1,
    });
    await submitRemainingHumanResponses(backend, fixture.host.gameId, fixture.capabilities);
    const voting = await loadCurrentState(backend, fixture.host.gameId);
    expect(voting.game.status).toBe("VOTING");
    const forfeitedPrompt = voting.prompts[0];
    const forfeitedResponse = voting.responses.find(
      (response) => response.promptId === forfeitedPrompt?._id,
    );
    if (!forfeitedPrompt || !forfeitedResponse) throw new Error("Missing forfeiture fixture");
    await backend.run(async (ctx) => {
      await ctx.db.patch("responses", forfeitedResponse._id, { text: FORFEIT_MARKER });
      for (const [index, prompt] of voting.prompts.entries()) {
        await ctx.db.patch("prompts", prompt._id, { ordinal: voting.prompts.length - index });
      }
    });

    const reordered = await loadCurrentState(backend, fixture.host.gameId);
    const expectedPrompts = votablePrompts(reordered);
    const expectedCurrentPrompt = expectedPrompts[reordered.game.votingPromptIndex];
    if (!expectedCurrentPrompt) throw new Error("Missing expected current prompt");
    const controller = await backend.query(api.gameViews.controller, {
      capability: fixture.host.capability,
    });
    expect(controller.voting?.totalPrompts).toBe(expectedPrompts.length);
    expect(controller.voting?.currentPrompt?.id).toBe(expectedCurrentPrompt._id);
  });

  test("guards votes, redacts authors and choices, reveals at quorum, scores, advances, and ends", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const fixture = await createHumanGame(backend, {
      timersDisabled: true,
      totalRounds: 2,
    });

    const writingStage = await backend.query(stageRef, {
      capability: fixture.sessions[1]!.capability,
    });
    expect(writingStage.rounds[0]?.prompts.every((prompt) => prompt.responses.length === 0)).toBe(
      true,
    );
    await submitRemainingHumanResponses(backend, fixture.host.gameId, fixture.capabilities);
    let state = await loadCurrentState(backend, fixture.host.gameId);
    expect(state.game.status).toBe("VOTING");

    const firstPrompt = votablePrompts(state)[0];
    if (!firstPrompt) throw new Error("Missing votable prompt");
    const firstResponses = state.responses
      .filter((response) => response.promptId === firstPrompt._id)
      .toSorted((left, right) => left._id.localeCompare(right._id));
    const ownResponse = firstResponses[0];
    const otherResponse = firstResponses[1];
    if (!ownResponse || !otherResponse) throw new Error("Missing prompt responses");
    const respondentCapability = fixture.capabilities.get(ownResponse.playerId)!;
    await expect(
      backend.mutation(castVoteRef, {
        capability: respondentCapability,
        promptId: firstPrompt._id,
        responseId: ownResponse._id,
      }),
    ).rejects.toThrow("own response");
    await expect(
      backend.mutation(castVoteRef, {
        capability: respondentCapability,
        promptId: firstPrompt._id,
        responseId: otherResponse._id,
      }),
    ).rejects.toThrow("prompt you responded to");

    const respondentIds = new Set(firstResponses.map((response) => response.playerId));
    const eligible = state.players.filter(
      (player) => player.type === "HUMAN" && !respondentIds.has(player._id),
    );
    expect(eligible).toHaveLength(2);
    const firstVoterCapability = fixture.capabilities.get(eligible[0]!._id)!;
    await backend.mutation(castVoteRef, {
      capability: firstVoterCapability,
      promptId: firstPrompt._id,
      responseId: ownResponse._id,
    });
    await expect(
      backend.mutation(castVoteRef, {
        capability: firstVoterCapability,
        promptId: firstPrompt._id,
        responseId: ownResponse._id,
      }),
    ).rejects.toThrow("Already voted");
    await expect(
      backend.mutation(toggleReactionRef, {
        capability: firstVoterCapability,
        emoji: "fire",
        responseId: ownResponse._id,
      }),
    ).resolves.toEqual({ added: true });

    const unrevealedForVoter = await backend.query(stageRef, {
      capability: firstVoterCapability,
    });
    const voterPrompt = unrevealedForVoter.rounds[0]?.prompts.find(
      (prompt) => prompt.id === firstPrompt._id,
    );
    expect(voterPrompt?.votes).toEqual([
      expect.objectContaining({ id: "", responseId: null, voterId: eligible[0]!._id }),
    ]);
    expect(voterPrompt?.responses.every((response) => response.reactions.length === 0)).toBe(true);
    expect(voterPrompt?.assignments).toEqual([]);
    expect(
      voterPrompt?.responses.find((response) => response.id === ownResponse._id)?.playerId,
    ).toBe("");
    expect(
      voterPrompt?.responses.find((response) => response.id === otherResponse._id)?.playerId,
    ).toBe("");
    const unrevealedForRespondent = await backend.query(stageRef, {
      capability: respondentCapability,
    });
    const respondentPrompt = unrevealedForRespondent.rounds[0]?.prompts.find(
      (prompt) => prompt.id === firstPrompt._id,
    );
    expect(
      respondentPrompt?.responses.find((response) => response.id === ownResponse._id)?.playerId,
    ).toBe(ownResponse.playerId);
    const displayStage = await backend.query(stageRef, {
      capability: fixture.host.capability,
    });
    expect(displayStage.me.isHost).toBe(true);

    const reveal = await backend.mutation(castVoteRef, {
      capability: fixture.capabilities.get(eligible[1]!._id)!,
      promptId: firstPrompt._id,
      responseId: ownResponse._id,
    });
    expect(reveal.phase).toBe("VOTING_SUBPHASE");
    const revealed = await backend.query(stageRef, { capability: firstVoterCapability });
    const revealedPrompt = revealed.rounds[0]?.prompts.find(
      (prompt) => prompt.id === firstPrompt._id,
    );
    expect(revealedPrompt?.votes.every((vote) => vote.responseId === ownResponse._id)).toBe(true);
    expect(revealedPrompt?.responses[0]?.player.name).not.toBe("");
    expect(
      revealedPrompt?.responses.find((response) => response.id === ownResponse._id)?.reactions,
    ).toEqual([expect.objectContaining({ emoji: "fire", playerId: eligible[0]!._id })]);

    await expect(
      backend.mutation(advanceRef, {
        capability: fixture.host.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, fixture.host.gameId),
      }),
    ).resolves.toEqual({ phase: "VOTING_SUBPHASE" });
    state = await loadCurrentState(backend, fixture.host.gameId);
    const secondPrompt = votablePrompts(state)[state.game.votingPromptIndex];
    if (!secondPrompt) throw new Error("Missing second prompt");
    const secondResponses = state.responses.filter(
      (response) => response.promptId === secondPrompt._id,
    );
    const secondTarget = secondResponses[0];
    if (!secondTarget) throw new Error("Missing second target");
    const secondAuthors = new Set(secondResponses.map((response) => response.playerId));
    const secondEligible = state.players.filter(
      (player) => player.type === "HUMAN" && !secondAuthors.has(player._id),
    );
    await backend.mutation(castVoteRef, {
      capability: fixture.capabilities.get(secondEligible[0]!._id)!,
      promptId: secondPrompt._id,
      responseId: secondTarget._id,
    });
    await expect(
      backend.mutation(advanceRef, {
        capability: fixture.host.capability,
        expectedPhaseGeneration: await getPhaseGeneration(backend, fixture.host.gameId),
      }),
    ).resolves.toEqual({ phase: "VOTING_SUBPHASE" });
    state = await loadCurrentState(backend, fixture.host.gameId);
    const secondVotes = state.votes.filter((vote) => vote.promptId === secondPrompt._id);
    expect(secondVotes).toHaveLength(2);
    expect(secondVotes.filter((vote) => vote.responseId === undefined)).toHaveLength(1);

    while (true) {
      state = await loadCurrentState(backend, fixture.host.gameId);
      if (state.game.status === "ROUND_RESULTS") break;
      if (state.game.votingRevealing) {
        await backend.mutation(advanceRef, {
          capability: fixture.host.capability,
          expectedPhaseGeneration: state.game.phaseGeneration,
        });
        continue;
      }
      const prompt = votablePrompts(state)[state.game.votingPromptIndex];
      if (!prompt) throw new Error("Missing current prompt");
      const promptResponses = state.responses
        .filter((response) => response.promptId === prompt._id)
        .toSorted((left, right) => left._id.localeCompare(right._id));
      const target = promptResponses[0];
      if (!target) throw new Error("Missing target response");
      const authors = new Set(promptResponses.map((response) => response.playerId));
      const existingVoters = new Set(
        state.votes.filter((vote) => vote.promptId === prompt._id).map((vote) => vote.voterId),
      );
      for (const voter of state.players.filter(
        (player) =>
          player.type === "HUMAN" && !authors.has(player._id) && !existingVoters.has(player._id),
      )) {
        await backend.mutation(castVoteRef, {
          capability: fixture.capabilities.get(voter._id)!,
          promptId: prompt._id,
          responseId: target._id,
        });
      }
    }

    state = await loadCurrentState(backend, fixture.host.gameId);
    expect(state.round.completedAt).toBeTypeOf("number");
    expect(state.responses.some((response) => response.pointsEarned > 0)).toBe(true);
    expect(state.players.reduce((sum, player) => sum + player.score, 0)).toBe(
      state.responses.reduce((sum, response) => sum + response.pointsEarned, 0),
    );
    await expect(
      backend.mutation(advanceRef, {
        capability: fixture.sessions[1]!.capability,
        expectedPhaseGeneration: state.game.phaseGeneration,
      }),
    ).rejects.toThrow("Host capability required");
    await expect(
      backend.mutation(advanceRef, {
        capability: fixture.host.capability,
        expectedPhaseGeneration: state.game.phaseGeneration,
      }),
    ).resolves.toEqual({ phase: "WRITING" });
    const roundTwoStage = await backend.query(stageRef, {
      capability: fixture.sessions[1]!.capability,
    });
    expect(roundTwoStage.rounds.map((round) => round.roundNumber)).toEqual([2]);

    await expect(
      backend.mutation(endRef, { capability: fixture.host.capability }),
    ).resolves.toEqual({ success: true });
    const earlyFinal = await backend.run((ctx) => ctx.db.get("games", fixture.host.gameId));
    expect(earlyFinal?.finalizedAt).toBeTypeOf("number");
    const finalStage = await backend.query(stageRef, {
      capability: fixture.sessions[1]!.capability,
    });
    expect(finalStage.status).toBe("FINAL_RESULTS");
    expect(finalStage.rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
    expect(
      finalStage.rounds
        .flatMap((round) => round.prompts)
        .flatMap((prompt) => prompt.responses)
        .flatMap((response) => response.reactions),
    ).toContainEqual(expect.objectContaining({ emoji: "fire", playerId: eligible[0]!._id }));
    await expect(
      backend.mutation(endRef, { capability: fixture.host.capability }),
    ).resolves.toEqual({ success: true });
  });

  test("guards stale schedules and runs writing, vote, reveal, and display-host result deadlines", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    vi.stubEnv("HOST_SECRET", "host-secret");

    const staleBackend = createTestBackend();
    const stale = await createHumanGame(staleBackend, {
      timersDisabled: false,
      totalRounds: 1,
    });
    const started = await loadCurrentState(staleBackend, stale.host.gameId);
    const oldDeadline = started.game.phaseDeadline;
    if (oldDeadline === undefined) throw new Error("Missing writing deadline");
    await staleBackend.mutation(advanceRef, {
      capability: stale.host.capability,
      expectedPhaseGeneration: started.game.phaseGeneration,
    });
    vi.setSystemTime(oldDeadline + 1);
    await expect(
      staleBackend.mutation(enforceDeadlineRef, {
        deadline: oldDeadline,
        gameId: stale.host.gameId,
        phaseGeneration: started.game.phaseGeneration,
      }),
    ).resolves.toEqual({ advanced: false, phase: null });
    const afterStale = await loadCurrentState(staleBackend, stale.host.gameId);
    expect(afterStale.game).toMatchObject({
      phaseGeneration: started.game.phaseGeneration + 1,
      status: "VOTING",
      votingRevealing: false,
    });

    vi.setSystemTime(new Date("2026-07-15T13:00:00.000Z"));
    const deadlineBackend = createTestBackend();
    const displayHost = await deadlineBackend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostParticipation: "DISPLAY_ONLY",
      hostSecret: "host-secret",
      timersDisabled: false,
      totalRounds: 1,
    });
    for (const name of ["Player A", "Player B", "Player C"]) {
      await deadlineBackend.action(api.rooms.join, {
        name,
        roomCode: displayHost.roomCode,
      });
    }
    await deadlineBackend.mutation(api.lobby.start, {
      capability: displayHost.capability,
    });
    await deadlineBackend.finishAllScheduledFunctions(() => vi.runAllTimers());

    const final = await loadCurrentState(deadlineBackend, displayHost.gameId);
    expect(final.game.phaseDeadline).toBeUndefined();
    expect(final.game).toMatchObject({
      finalizedAt: expect.any(Number),
      phaseGeneration: 5,
      status: "FINAL_RESULTS",
    });
    expect(final.responses).toHaveLength(6);
    expect(final.responses.every((response) => response.text === FORFEIT_MARKER)).toBe(true);
    expect(final.round.completedAt).toBeTypeOf("number");
  });
});
