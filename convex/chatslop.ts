import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireHostCapability, requirePlayerCapability } from "./capabilities";
import { getRandomPrompts } from "../src/games/core/prompts";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { requireContinuingPlayers, requireExpectedPhaseGeneration } from "./gamePhase";
import { sanitize } from "../src/lib/sanitize";
import { isForfeitMarker } from "../src/games/core/constants";
import {
  applyScoreResult,
  FORFEIT_MARKER,
  scorePrompt,
  type PlayerState,
} from "../src/games/sloplash/scoring";

const MAX_PLAYERS = 16;
const MAX_ROUNDS = 10;
const MAX_ASSIGNMENTS = 16;
const MAX_RESPONSES = 16;
const MAX_VOTES = 16;
const MAX_RESPONSE_LENGTH = 200;

const enqueueQueuedResponseJobsReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { canceled: number; enqueued: number; failed: number; skipped: number }
>("aiGenerationData:enqueueQueuedResponseJobs");

const enqueueQueuedVoteJobsReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  { canceled: number; enqueued: number; failed: number; skipped: number }
>("aiVotingData:enqueueQueuedVoteJobs");

type DatabaseCtx = MutationCtx | QueryCtx;

type ChatSlopPhase = "FINAL_RESULTS" | "ROUND_RESULTS" | "VOTING" | "WRITING";

type RoundBundle = {
  assignments: Doc<"promptAssignments">[];
  prompt: Doc<"prompts">;
  responses: Doc<"responses">[];
  round: Doc<"rounds">;
  votes: Doc<"votes">[];
};

const phaseValidator = v.union(
  v.literal("FINAL_RESULTS"),
  v.literal("ROUND_RESULTS"),
  v.literal("VOTING"),
  v.literal("WRITING"),
  v.null(),
);

function requireChatSlopGame(game: Doc<"games">): void {
  if (game.gameType !== "AI_CHAT_SHOWDOWN") {
    throw new ConvexError("This action is only available for ChatSlop");
  }
}

function requireActiveHuman(player: Doc<"players">): void {
  if (player.type !== "HUMAN") {
    throw new ConvexError("Only human players can perform this action");
  }
  if (player.participationStatus !== "ACTIVE") {
    throw new ConvexError("Disconnected players cannot perform this action");
  }
}

async function queueGenerationJob(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    generationKey: string;
    kind: "RESPONSE" | "VOTE";
    targetId: Id<"players">;
  },
): Promise<boolean> {
  const existing = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index.eq("gameId", args.gameId).eq("generationKey", args.generationKey),
    )
    .unique();
  if (existing) return false;

  const now = Date.now();
  await ctx.db.insert("generationJobs", {
    gameId: args.gameId,
    generationKey: args.generationKey,
    kind: args.kind,
    targetId: args.targetId,
    status: "QUEUED",
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

async function listPlayers(ctx: DatabaseCtx, gameId: Id<"games">): Promise<Doc<"players">[]> {
  return ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS);
}

async function loadRound(
  ctx: DatabaseCtx,
  gameId: Id<"games">,
  roundNumber: number,
): Promise<RoundBundle | null> {
  const round = await ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) =>
      index.eq("gameId", gameId).eq("roundNumber", roundNumber),
    )
    .unique();
  if (!round) return null;

  const [prompt, assignments, responses, votes] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_roundId_and_ordinal", (index) =>
        index.eq("roundId", round._id).eq("ordinal", 0),
      )
      .unique(),
    ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_ASSIGNMENTS),
    ctx.db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_RESPONSES),
    ctx.db
      .query("votes")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_VOTES),
  ]);
  if (!prompt || prompt.gameId !== gameId || prompt.roundId !== round._id) return null;

  return {
    assignments: assignments.filter((assignment) => assignment.promptId === prompt._id),
    prompt,
    responses: responses.filter((response) => response.promptId === prompt._id),
    round,
    votes: votes.filter((vote) => vote.promptId === prompt._id),
  };
}

function requireCurrentBundle(
  bundle: RoundBundle | null,
  promptId?: Id<"prompts">,
): asserts bundle is RoundBundle {
  if (!bundle || (promptId !== undefined && bundle.prompt._id !== promptId)) {
    throw new ConvexError("Prompt is not from the current round");
  }
}

function requireAssignment(bundle: RoundBundle, playerId: Id<"players">): Doc<"promptAssignments"> {
  const assignment = bundle.assignments.find(
    (candidate) =>
      candidate.gameId === bundle.round.gameId &&
      candidate.roundId === bundle.round._id &&
      candidate.promptId === bundle.prompt._id &&
      candidate.playerId === playerId,
  );
  if (!assignment) throw new ConvexError("You are not assigned to this prompt");
  return assignment;
}

function hasResponseQuorum(bundle: RoundBundle, activePlayers: Doc<"players">[]): boolean {
  if (activePlayers.length === 0) return false;
  const assignedIds = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  const respondentIds = new Set(bundle.responses.map((response) => response.playerId));
  return activePlayers.every(
    (player) => assignedIds.has(player._id) && respondentIds.has(player._id),
  );
}

function hasVoteQuorum(bundle: RoundBundle, activePlayers: Doc<"players">[]): boolean {
  if (activePlayers.length === 0) return false;
  const assignedIds = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  const voterIds = new Set(bundle.votes.map((vote) => vote.voterId));
  return activePlayers.every((player) => assignedIds.has(player._id) && voterIds.has(player._id));
}

function isVotable(bundle: RoundBundle): boolean {
  return (
    bundle.responses.length >= 2 &&
    bundle.responses.some((response) => response.text !== FORFEIT_MARKER)
  );
}

async function queueAiVoteJobs(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  players: Doc<"players">[],
): Promise<void> {
  if (!isVotable(bundle)) return;
  const assignedIds = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  for (const player of players) {
    if (
      player.type !== "AI" ||
      player.participationStatus !== "ACTIVE" ||
      !assignedIds.has(player._id)
    ) {
      continue;
    }
    await queueGenerationJob(ctx, {
      gameId: game._id,
      generationKey: `vote:${game.currentRound}:${bundle.prompt._id}:${player._id}`,
      kind: "VOTE",
      targetId: player._id,
    });
  }
}

async function transitionToVoting(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  players: Doc<"players">[],
  now: number,
): Promise<boolean> {
  if (game.gameType !== "AI_CHAT_SHOWDOWN" || game.status !== "WRITING") {
    return false;
  }
  await ctx.db.patch("games", game._id, {
    phaseDeadline: undefined,
    phaseGeneration: game.phaseGeneration + 1,
    status: "VOTING",
    updatedAt: now,
    votingPromptIndex: 0,
    votingRevealing: false,
  });
  await queueAiVoteJobs(ctx, game, bundle, players);
  await ctx.scheduler.runAfter(0, enqueueQueuedVoteJobsReference, { gameId: game._id });
  return true;
}

function assertRoundReferences(
  game: Doc<"games">,
  bundle: RoundBundle,
  players: Doc<"players">[],
): void {
  const playersById = new Map(players.map((player) => [player._id, player]));
  const responsesById = new Map(bundle.responses.map((response) => [response._id, response]));

  for (const assignment of bundle.assignments) {
    const player = playersById.get(assignment.playerId);
    if (
      assignment.gameId !== game._id ||
      assignment.roundId !== bundle.round._id ||
      assignment.promptId !== bundle.prompt._id ||
      !player ||
      player.gameId !== game._id
    ) {
      throw new ConvexError("Current round contains an invalid prompt assignment");
    }
  }
  for (const response of bundle.responses) {
    const player = playersById.get(response.playerId);
    if (
      response.gameId !== game._id ||
      response.roundId !== bundle.round._id ||
      response.promptId !== bundle.prompt._id ||
      !player ||
      player.gameId !== game._id
    ) {
      throw new ConvexError("Current round contains an invalid response");
    }
  }
  for (const vote of bundle.votes) {
    const voter = playersById.get(vote.voterId);
    const response = vote.responseId ? responsesById.get(vote.responseId) : null;
    if (
      vote.gameId !== game._id ||
      vote.roundId !== bundle.round._id ||
      vote.promptId !== bundle.prompt._id ||
      !voter ||
      voter.gameId !== game._id ||
      (vote.responseId !== undefined &&
        (!response ||
          response.gameId !== game._id ||
          response.roundId !== bundle.round._id ||
          response.promptId !== bundle.prompt._id))
    ) {
      throw new ConvexError("Current round contains an invalid vote");
    }
  }
}

async function scoreCurrentRound(ctx: MutationCtx, game: Doc<"games">, now: number): Promise<void> {
  const [bundle, players] = await Promise.all([
    loadRound(ctx, game._id, game.currentRound),
    listPlayers(ctx, game._id),
  ]);
  if (!bundle || bundle.round.completedAt !== undefined) return;
  assertRoundReferences(game, bundle, players);

  const competitors = players.filter((player) => player.type !== "SPECTATOR");
  const playerStates = new Map<string, PlayerState>(
    competitors.map((player) => [
      player._id,
      {
        humorRating: player.humorRating,
        score: player.score,
        winStreak: player.winStreak,
      },
    ]),
  );
  const playerTypes = new Map(competitors.map((player) => [player._id, player.type]));
  const result = scorePrompt(
    bundle.responses.map((response) => ({
      id: response._id,
      playerId: response.playerId,
      playerType: playerTypes.get(response.playerId) ?? "HUMAN",
      text: response.text,
    })),
    bundle.votes.map((vote) => ({
      id: vote.voterId,
      responseId: vote.responseId ?? null,
      type: playerTypes.get(vote.voterId) ?? "HUMAN",
    })),
    playerStates,
    bundle.round.roundNumber,
    bundle.responses.length,
  );
  applyScoreResult(
    result,
    bundle.responses.map((response) => ({
      id: response._id,
      playerId: response.playerId,
    })),
    playerStates,
  );

  for (const response of bundle.responses) {
    await ctx.db.patch("responses", response._id, {
      pointsEarned: result.points[response._id] ?? 0,
    });
  }
  for (const player of competitors) {
    const state = playerStates.get(player._id);
    if (!state) continue;
    await ctx.db.patch("players", player._id, {
      humorRating: state.humorRating,
      score: state.score,
      winStreak: state.winStreak,
    });
  }
  await ctx.db.patch("rounds", bundle.round._id, { completedAt: now });
}

async function transitionToRoundResults(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<boolean> {
  if (game.gameType !== "AI_CHAT_SHOWDOWN" || game.status !== "VOTING") {
    return false;
  }
  await scoreCurrentRound(ctx, game, now);
  await ctx.db.patch("games", game._id, {
    phaseDeadline: undefined,
    phaseGeneration: game.phaseGeneration + 1,
    status: "ROUND_RESULTS",
    updatedAt: now,
    votingRevealing: true,
    winnerTagline: undefined,
  });
  return true;
}

async function settleCurrentQuorum(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<ChatSlopPhase | null> {
  if (game.gameType !== "AI_CHAT_SHOWDOWN") return null;
  const [bundle, players] = await Promise.all([
    loadRound(ctx, game._id, game.currentRound),
    listPlayers(ctx, game._id),
  ]);
  if (!bundle) return null;
  const activePlayers = players.filter(isActiveCompetitor);

  if (game.status === "WRITING" && hasResponseQuorum(bundle, activePlayers)) {
    return (await transitionToVoting(ctx, game, bundle, players, now)) ? "VOTING" : null;
  }
  if (game.status === "VOTING" && !game.votingRevealing && hasVoteQuorum(bundle, activePlayers)) {
    return (await transitionToRoundResults(ctx, game, now)) ? "ROUND_RESULTS" : null;
  }
  return null;
}

async function fillForfeitResponses(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  players: Doc<"players">[],
  now: number,
): Promise<void> {
  const activeIds = new Set(players.filter(isActiveCompetitor).map((player) => player._id));
  const responseKeys = new Set(
    bundle.responses.map((response) => `${response.promptId}:${response.playerId}`),
  );
  for (const assignment of bundle.assignments) {
    const key = `${assignment.promptId}:${assignment.playerId}`;
    if (!activeIds.has(assignment.playerId) || responseKeys.has(key)) continue;
    responseKeys.add(key);
    await ctx.db.insert("responses", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      playerId: assignment.playerId,
      text: FORFEIT_MARKER,
      pointsEarned: 0,
      submittedAt: now,
    });
  }
}

async function fillAbstainVotes(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  players: Doc<"players">[],
  now: number,
): Promise<void> {
  const activeIds = new Set(players.filter(isActiveCompetitor).map((player) => player._id));
  const voterIds = new Set(bundle.votes.map((vote) => vote.voterId));
  for (const assignment of bundle.assignments) {
    if (!activeIds.has(assignment.playerId) || voterIds.has(assignment.playerId)) continue;
    voterIds.add(assignment.playerId);
    await ctx.db.insert("votes", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      voterId: assignment.playerId,
      castAt: now,
    });
  }
}

async function createNextRound(ctx: MutationCtx, game: Doc<"games">, now: number): Promise<void> {
  const roundNumber = game.currentRound + 1;
  const [players, usedPrompts] = await Promise.all([
    listPlayers(ctx, game._id),
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", game._id))
      .take(MAX_ROUNDS),
  ]);
  const participants = players.filter(isActiveCompetitor);
  requireContinuingPlayers(participants.length);
  const [promptText] = getRandomPrompts(1, new Set(usedPrompts.map((prompt) => prompt.text)));
  const roundId = await ctx.db.insert("rounds", {
    gameId: game._id,
    roundNumber,
    openedAt: now,
  });
  const promptId = await ctx.db.insert("prompts", {
    gameId: game._id,
    roundId,
    ordinal: 0,
    text: promptText ?? `Prompt #${roundNumber}: Make us laugh!`,
  });
  for (const player of participants) {
    await ctx.db.insert("promptAssignments", {
      gameId: game._id,
      roundId,
      promptId,
      playerId: player._id,
    });
  }
  for (const player of participants) {
    if (player.type !== "AI") continue;
    await queueGenerationJob(ctx, {
      gameId: game._id,
      generationKey: `response:${roundNumber}:${player._id}`,
      kind: "RESPONSE",
      targetId: player._id,
    });
  }
  await ctx.db.patch("games", game._id, {
    currentRound: roundNumber,
    phaseDeadline: undefined,
    phaseGeneration: game.phaseGeneration + 1,
    status: "WRITING",
    updatedAt: now,
    votingPromptIndex: 0,
    votingRevealing: false,
    winnerTagline: undefined,
  });
  await ctx.scheduler.runAfter(0, enqueueQueuedResponseJobsReference, {
    gameId: game._id,
  });
}

async function advanceRoundResults(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<ChatSlopPhase> {
  if (game.currentRound >= game.totalRounds) {
    await ctx.db.patch("games", game._id, {
      finalizedAt: now,
      phaseDeadline: undefined,
      phaseGeneration: game.phaseGeneration + 1,
      status: "FINAL_RESULTS",
      updatedAt: now,
      votingRevealing: false,
      winnerTagline: undefined,
    });
    return "FINAL_RESULTS";
  }
  await createNextRound(ctx, game, now);
  return "WRITING";
}

export const respond = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    text: v.string(),
  },
  returns: v.object({
    phase: phaseValidator,
    responseId: v.id("responses"),
  }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    requireChatSlopGame(authorized.game);
    requireActiveHuman(authorized.player);

    const bundle = await loadRound(ctx, authorized.game._id, authorized.game.currentRound);
    requireCurrentBundle(bundle, args.promptId);
    requireAssignment(bundle, authorized.player._id);
    const existing = await ctx.db
      .query("responses")
      .withIndex("by_promptId_and_playerId", (index) =>
        index.eq("promptId", bundle.prompt._id).eq("playerId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (
        existing.gameId !== authorized.game._id ||
        existing.roundId !== bundle.round._id ||
        existing.promptId !== bundle.prompt._id
      ) {
        throw new ConvexError("Existing response does not belong to the current round");
      }
      const phase =
        authorized.game.status === "VOTING" ||
        authorized.game.status === "ROUND_RESULTS" ||
        authorized.game.status === "FINAL_RESULTS"
          ? authorized.game.status
          : null;
      return { phase, responseId: existing._id };
    }
    if (authorized.game.status !== "WRITING") {
      throw new ConvexError("Game not in writing phase");
    }

    const text = sanitize(args.text, MAX_RESPONSE_LENGTH);
    if (!text) throw new ConvexError("Response text cannot be empty");
    if (isForfeitMarker(text)) throw new ConvexError("Response text is not allowed");
    const now = Date.now();
    const responseId = await ctx.db.insert("responses", {
      gameId: authorized.game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      playerId: authorized.player._id,
      text,
      pointsEarned: 0,
      submittedAt: now,
    });
    const phase = await settleCurrentQuorum(ctx, authorized.game, now);
    return { phase, responseId };
  },
});

export const vote = mutation({
  args: {
    capability: v.string(),
    promptId: v.id("prompts"),
    responseId: v.id("responses"),
  },
  returns: v.object({
    phase: phaseValidator,
    voteId: v.id("votes"),
  }),
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    requireChatSlopGame(authorized.game);
    requireActiveHuman(authorized.player);

    const bundle = await loadRound(ctx, authorized.game._id, authorized.game.currentRound);
    requireCurrentBundle(bundle, args.promptId);
    requireAssignment(bundle, authorized.player._id);
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_promptId_and_voterId", (index) =>
        index.eq("promptId", bundle.prompt._id).eq("voterId", authorized.player._id),
      )
      .unique();
    if (existing) {
      if (
        existing.gameId !== authorized.game._id ||
        existing.roundId !== bundle.round._id ||
        existing.promptId !== bundle.prompt._id
      ) {
        throw new ConvexError("Existing vote does not belong to the current round");
      }
      const phase =
        authorized.game.status === "ROUND_RESULTS" || authorized.game.status === "FINAL_RESULTS"
          ? authorized.game.status
          : null;
      return { phase, voteId: existing._id };
    }
    if (authorized.game.status !== "VOTING" || authorized.game.votingRevealing) {
      throw new ConvexError("Game not in voting phase");
    }
    if (!isVotable(bundle)) throw new ConvexError("Prompt is not open for voting");

    const selectedResponse = bundle.responses.find((response) => response._id === args.responseId);
    if (
      !selectedResponse ||
      selectedResponse.gameId !== authorized.game._id ||
      selectedResponse.roundId !== bundle.round._id ||
      selectedResponse.promptId !== bundle.prompt._id
    ) {
      throw new ConvexError("Response does not belong to this prompt");
    }
    if (selectedResponse.text === FORFEIT_MARKER) {
      throw new ConvexError("Cannot vote for a forfeited response");
    }
    if (selectedResponse.playerId === authorized.player._id) {
      throw new ConvexError("Cannot vote for your own response");
    }

    const now = Date.now();
    const voteId = await ctx.db.insert("votes", {
      gameId: authorized.game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      voterId: authorized.player._id,
      responseId: selectedResponse._id,
      castAt: now,
    });
    const phase = await settleCurrentQuorum(ctx, authorized.game, now);
    return { phase, voteId };
  },
});

export const advance = mutation({
  args: { capability: v.string(), expectedPhaseGeneration: v.number() },
  returns: v.object({ phase: phaseValidator }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    requireChatSlopGame(authorized.game);
    requireExpectedPhaseGeneration(
      authorized.game.phaseGeneration,
      args.expectedPhaseGeneration,
    );
    const now = Date.now();

    if (authorized.game.status === "ROUND_RESULTS") {
      return { phase: await advanceRoundResults(ctx, authorized.game, now) };
    }
    if (authorized.game.status !== "WRITING" && authorized.game.status !== "VOTING") {
      throw new ConvexError("Cannot advance from current phase");
    }

    const [bundle, players] = await Promise.all([
      loadRound(ctx, authorized.game._id, authorized.game.currentRound),
      listPlayers(ctx, authorized.game._id),
    ]);
    requireCurrentBundle(bundle);

    if (authorized.game.status === "WRITING") {
      await fillForfeitResponses(ctx, authorized.game, bundle, players, now);
      const refreshed = await loadRound(ctx, authorized.game._id, authorized.game.currentRound);
      requireCurrentBundle(refreshed);
      await transitionToVoting(ctx, authorized.game, refreshed, players, now);
      return { phase: "VOTING" as const };
    }

    await fillAbstainVotes(ctx, authorized.game, bundle, players, now);
    await transitionToRoundResults(ctx, authorized.game, now);
    return { phase: "ROUND_RESULTS" as const };
  },
});

export const end = mutation({
  args: { capability: v.string() },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args) => {
    const authorized = await requireHostCapability(ctx, args.capability);
    requireChatSlopGame(authorized.game);
    if (authorized.game.status === "FINAL_RESULTS") {
      return { success: true as const };
    }
    if (authorized.game.status === "LOBBY") {
      throw new ConvexError("Cannot end game in current state");
    }

    const now = Date.now();
    if (authorized.game.status === "WRITING" || authorized.game.status === "VOTING") {
      const [bundle, players] = await Promise.all([
        loadRound(ctx, authorized.game._id, authorized.game.currentRound),
        listPlayers(ctx, authorized.game._id),
      ]);
      requireCurrentBundle(bundle);
      await fillForfeitResponses(ctx, authorized.game, bundle, players, now);
      if (authorized.game.status === "VOTING") {
        const refreshed = await loadRound(ctx, authorized.game._id, authorized.game.currentRound);
        requireCurrentBundle(refreshed);
        await fillAbstainVotes(ctx, authorized.game, refreshed, players, now);
      }
      await scoreCurrentRound(ctx, authorized.game, now);
    }
    await ctx.db.patch("games", authorized.game._id, {
      finalizedAt: now,
      phaseDeadline: undefined,
      phaseGeneration: authorized.game.phaseGeneration + 1,
      status: "FINAL_RESULTS",
      updatedAt: now,
      votingRevealing: false,
      winnerTagline: undefined,
    });
    return { success: true as const };
  },
});

/** Called after a durable AI response or vote job is atomically completed. */
export const settleQuorum = internalMutation({
  args: { gameId: v.id("games") },
  returns: v.object({ phase: phaseValidator }),
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.gameType !== "AI_CHAT_SHOWDOWN") return { phase: null };
    return { phase: await settleCurrentQuorum(ctx, game, Date.now()) };
  },
});
