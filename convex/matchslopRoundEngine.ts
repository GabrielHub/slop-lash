import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { postMortemPipelineRef, replyPipelineRef } from "./matchslopContracts";
import {
  getMatchSlopState,
  isActiveMatchSlopCompetitor,
  isMatchSlopGame,
  listMatchSlopPlayers,
  loadMatchSlopRound,
  loadMatchSlopState,
  loadMatchSlopTranscript,
  requireCurrentMatchSlopRound,
  type MatchSlopRoundBundle,
} from "./matchslopData";
import {
  cancelMatchSlopJob,
  getMatchSlopDeadline,
  queueAiResponseWorkflows,
  queueAiVoteWorkflows,
  queueMatchSlopWorkflow,
  scheduleMatchSlopDeadline,
} from "./matchslopJobs";
import {
  applyPersonaMood,
  deriveFallbackSignal,
  emptyPendingPersonaReply,
  fallbackPersonaReply,
  readMatchSlopRuntimeState,
  resolveAdvancePlan,
  type MatchSlopPhase,
} from "./matchslopState";
import {
  MATCHSLOP_PHOTO_PROMPT_ID,
  MATCHSLOP_PHOTO_PROMPT_TEXT,
  MATCHSLOP_POINTS_PER_WEIGHTED_VOTE,
  MATCHSLOP_RESULTS_SECONDS,
  MATCHSLOP_VOTING_SECONDS,
  MATCHSLOP_WINNER_BONUS,
  MATCHSLOP_WRITING_SECONDS,
} from "../src/games/matchslop/config/game-config";
import { FORFEIT_MARKER, isForfeitMarker } from "../src/games/core/constants";
import { sanitize } from "../src/lib/sanitize";

const MAX_RESPONSE_LENGTH = 200;

type MatchSlopStatePatch = Partial<Omit<Doc<"matchSlopState">, "_creationTime" | "_id" | "gameId">>;

function responseQuorum(bundle: MatchSlopRoundBundle, players: Doc<"players">[]): boolean {
  const active = players.filter(isActiveMatchSlopCompetitor);
  if (active.length === 0) return false;
  const assigned = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  const responded = new Set(bundle.responses.map((response) => response.playerId));
  return active.every((player) => assigned.has(player._id) && responded.has(player._id));
}

function voteQuorum(bundle: MatchSlopRoundBundle, players: Doc<"players">[]): boolean {
  const active = players.filter(isActiveMatchSlopCompetitor);
  if (active.length === 0) return false;
  const assigned = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  const voted = new Set(bundle.votes.map((vote) => vote.voterId));
  return active.every((player) => assigned.has(player._id) && voted.has(player._id));
}

function validateRoundReferences(
  game: Doc<"games">,
  bundle: MatchSlopRoundBundle,
  players: Doc<"players">[],
): void {
  const playersById = new Map(players.map((player) => [player._id, player]));
  const responsesById = new Map(bundle.responses.map((response) => [response._id, response]));
  for (const assignment of bundle.assignments) {
    if (
      assignment.gameId !== game._id ||
      assignment.roundId !== bundle.round._id ||
      assignment.promptId !== bundle.prompt._id ||
      playersById.get(assignment.playerId)?.gameId !== game._id
    ) {
      throw new ConvexError("Current MatchSlop round has an invalid assignment");
    }
  }
  for (const response of bundle.responses) {
    if (
      response.gameId !== game._id ||
      response.roundId !== bundle.round._id ||
      response.promptId !== bundle.prompt._id ||
      playersById.get(response.playerId)?.gameId !== game._id
    ) {
      throw new ConvexError("Current MatchSlop round has an invalid response");
    }
  }
  for (const vote of bundle.votes) {
    const response = vote.responseId ? responsesById.get(vote.responseId) : null;
    if (
      vote.gameId !== game._id ||
      vote.roundId !== bundle.round._id ||
      vote.promptId !== bundle.prompt._id ||
      playersById.get(vote.voterId)?.gameId !== game._id ||
      (vote.responseId !== undefined &&
        (!response ||
          response.gameId !== game._id ||
          response.roundId !== bundle.round._id ||
          response.promptId !== bundle.prompt._id))
    ) {
      throw new ConvexError("Current MatchSlop round has an invalid vote");
    }
  }
}

async function transitionToVoting(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: MatchSlopRoundBundle,
  players: Doc<"players">[],
  now: number,
): Promise<boolean> {
  if (!isMatchSlopGame(game) || game.status !== "WRITING") return false;
  const phaseGeneration = game.phaseGeneration + 1;
  const phaseDeadline = getMatchSlopDeadline(game, now, MATCHSLOP_VOTING_SECONDS);
  await ctx.db.patch("games", game._id, {
    status: "VOTING",
    phaseGeneration,
    phaseDeadline,
    votingPromptIndex: 0,
    votingRevealing: false,
    updatedAt: now,
  });
  if (phaseDeadline !== undefined) {
    await scheduleMatchSlopDeadline(ctx, {
      gameId: game._id,
      deadline: phaseDeadline,
      phaseGeneration,
    });
  }
  const votingGame = await ctx.db.get("games", game._id);
  if (votingGame) await queueAiVoteWorkflows(ctx, votingGame, players, bundle);
  return true;
}

type ScoredWinner = {
  response: Doc<"responses">;
  weightedVotes: number;
  rawVotes: number;
};

async function scoreRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: MatchSlopRoundBundle,
  players: Doc<"players">[],
  state: Doc<"matchSlopState">,
  now: number,
): Promise<ScoredWinner | null> {
  if (bundle.round.completedAt !== undefined) {
    const runtime = readMatchSlopRuntimeState(state);
    const winnerId = runtime.lastRoundResult?.winnerResponseId;
    const responseId = winnerId ? ctx.db.normalizeId("responses", winnerId) : null;
    const response = responseId
      ? bundle.responses.find((candidate) => candidate._id === responseId)
      : null;
    return response && runtime.lastRoundResult
      ? {
          response,
          weightedVotes: runtime.lastRoundResult.weightedVotes,
          rawVotes: runtime.lastRoundResult.rawVotes,
        }
      : null;
  }
  validateRoundReferences(game, bundle, players);
  const playersById = new Map(players.map((player) => [player._id, player]));
  const weighted = new Map<Id<"responses">, number>();
  const raw = new Map<Id<"responses">, number>();
  for (const vote of bundle.votes) {
    if (!vote.responseId) continue;
    const voter = playersById.get(vote.voterId);
    const weight = voter?.type === "AI" ? state.aiVoteWeight : state.humanVoteWeight;
    weighted.set(vote.responseId, (weighted.get(vote.responseId) ?? 0) + weight);
    raw.set(vote.responseId, (raw.get(vote.responseId) ?? 0) + 1);
  }
  const candidates = bundle.responses
    .filter((response) => response.text !== FORFEIT_MARKER)
    .map((response) => ({
      response,
      weightedVotes: weighted.get(response._id) ?? 0,
      rawVotes: raw.get(response._id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.weightedVotes - left.weightedVotes ||
        right.rawVotes - left.rawVotes ||
        left.response._id.localeCompare(right.response._id),
    );
  const first = candidates[0];
  const winner = first && (first.weightedVotes > 0 || first.rawVotes > 0) ? first : null;
  for (const response of bundle.responses) {
    const responseWeight = weighted.get(response._id) ?? 0;
    const points =
      responseWeight === 0
        ? 0
        : responseWeight * MATCHSLOP_POINTS_PER_WEIGHTED_VOTE +
          (winner?.response._id === response._id ? MATCHSLOP_WINNER_BONUS : 0);
    await ctx.db.patch("responses", response._id, { pointsEarned: points });
    if (points > 0) {
      const player = playersById.get(response.playerId);
      if (player) await ctx.db.patch("players", player._id, { score: player.score + points });
    }
  }
  await ctx.db.patch("rounds", bundle.round._id, { completedAt: now });
  return winner;
}

async function queueReplyWorkflow(ctx: MutationCtx, game: Doc<"games">): Promise<void> {
  await queueMatchSlopWorkflow(ctx, {
    gameId: game._id,
    generationKey: `matchslop:reply:${game.currentRound}:${game.phaseGeneration}`,
    kind: "MATCHSLOP_PERSONA_REPLY",
    stage: "REPLY",
    targetId: String(game.currentRound),
    workflow: replyPipelineRef,
  });
}

async function queuePostMortemWorkflow(ctx: MutationCtx, game: Doc<"games">): Promise<void> {
  await queueMatchSlopWorkflow(ctx, {
    gameId: game._id,
    generationKey: `matchslop:postmortem:${game.phaseGeneration}`,
    kind: "MATCHSLOP_POST_MORTEM",
    stage: "POST_MORTEM",
    workflow: postMortemPipelineRef,
  });
}

async function finishWithoutWinner(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: Doc<"matchSlopState">,
  now: number,
): Promise<void> {
  const outcome = state.comebackRound === game.currentRound ? "UNMATCHED" : "TURN_LIMIT";
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("matchSlopState", state._id, {
    outcome,
    lastRoundResult: undefined,
    pendingPersonaReply: emptyPendingPersonaReply(),
    updatedAt: now,
  });
  await ctx.db.patch("games", game._id, {
    finalizedAt: now,
    status: "FINAL_RESULTS",
    phaseDeadline: undefined,
    phaseGeneration,
    votingRevealing: false,
    updatedAt: now,
  });
  const finalGame = await ctx.db.get("games", game._id);
  if (finalGame) await queuePostMortemWorkflow(ctx, finalGame);
}

async function transitionToRoundResults(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<boolean> {
  if (!isMatchSlopGame(game) || game.status !== "VOTING") return false;
  const [bundle, players, state] = await Promise.all([
    loadMatchSlopRound(ctx, game._id, game.currentRound),
    listMatchSlopPlayers(ctx, game._id),
    loadMatchSlopState(ctx, game._id),
  ]);
  if (!bundle || !state) return false;
  const winner = await scoreRound(ctx, game, bundle, players, state, now);
  if (!winner) {
    await finishWithoutWinner(ctx, game, state, now);
    return true;
  }
  const author = players.find((player) => player._id === winner.response.playerId);
  const selectedPromptId =
    typeof winner.response.metadata?.selectedPromptId === "string"
      ? winner.response.metadata.selectedPromptId
      : null;
  const selectedPromptText =
    typeof winner.response.metadata?.selectedPromptText === "string"
      ? winner.response.metadata.selectedPromptText
      : null;
  const phaseGeneration = game.phaseGeneration + 1;
  const phaseDeadline = getMatchSlopDeadline(game, now, MATCHSLOP_RESULTS_SECONDS);
  await ctx.db.patch("matchSlopState", state._id, {
    lastRoundResult: {
      promptId: bundle.prompt._id,
      winnerResponseId: winner.response._id,
      winnerPlayerId: winner.response.playerId,
      winnerText: winner.response.text,
      authorName: author?.name ?? null,
      weightedVotes: winner.weightedVotes,
      rawVotes: winner.rawVotes,
      selectedPromptId,
      selectedPromptText,
    },
    pendingPersonaReply: emptyPendingPersonaReply(),
    updatedAt: now,
  });
  await ctx.db.patch("games", game._id, {
    status: "ROUND_RESULTS",
    phaseDeadline,
    phaseGeneration,
    votingRevealing: false,
    updatedAt: now,
  });
  if (phaseDeadline !== undefined) {
    await scheduleMatchSlopDeadline(ctx, {
      gameId: game._id,
      deadline: phaseDeadline,
      phaseGeneration,
    });
  }
  const resultsGame = await ctx.db.get("games", game._id);
  if (resultsGame) await queueReplyWorkflow(ctx, resultsGame);
  return true;
}

export async function settleMatchSlopQuorum(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<MatchSlopPhase | null> {
  if (!isMatchSlopGame(game)) return null;
  const [bundle, players] = await Promise.all([
    loadMatchSlopRound(ctx, game._id, game.currentRound),
    listMatchSlopPlayers(ctx, game._id),
  ]);
  if (!bundle) return null;
  if (game.status === "WRITING" && responseQuorum(bundle, players)) {
    return (await transitionToVoting(ctx, game, bundle, players, now)) ? "VOTING" : null;
  }
  if (game.status === "VOTING" && !game.votingRevealing && voteQuorum(bundle, players)) {
    await transitionToRoundResults(ctx, game, now);
    const current = await ctx.db.get("games", game._id);
    return current?.status === "FINAL_RESULTS" ? "FINAL_RESULTS" : "ROUND_RESULTS";
  }
  return null;
}

async function fillForfeitResponses(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: MatchSlopRoundBundle,
  players: Doc<"players">[],
  now: number,
): Promise<void> {
  const active = new Set(players.filter(isActiveMatchSlopCompetitor).map((player) => player._id));
  const responded = new Set(bundle.responses.map((response) => response.playerId));
  for (const assignment of bundle.assignments) {
    if (!active.has(assignment.playerId) || responded.has(assignment.playerId)) continue;
    responded.add(assignment.playerId);
    await ctx.db.insert("responses", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      playerId: assignment.playerId,
      text: FORFEIT_MARKER,
      pointsEarned: 0,
      failReason: "deadline",
      submittedAt: now,
    });
  }
}

async function fillAbstainVotes(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: MatchSlopRoundBundle,
  players: Doc<"players">[],
  now: number,
): Promise<void> {
  const active = new Set(players.filter(isActiveMatchSlopCompetitor).map((player) => player._id));
  const voted = new Set(bundle.votes.map((vote) => vote.voterId));
  for (const assignment of bundle.assignments) {
    if (!active.has(assignment.playerId) || voted.has(assignment.playerId)) continue;
    voted.add(assignment.playerId);
    await ctx.db.insert("votes", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: bundle.prompt._id,
      voterId: assignment.playerId,
      failReason: "deadline",
      castAt: now,
    });
  }
}

async function cancelCurrentReplyJob(
  ctx: MutationCtx,
  game: Doc<"games">,
  reason: string,
): Promise<void> {
  const job = await ctx.db
    .query("generationJobs")
    .withIndex("by_gameId_and_generationKey", (index) =>
      index
        .eq("gameId", game._id)
        .eq("generationKey", `matchslop:reply:${game.currentRound}:${game.phaseGeneration}`),
    )
    .unique();
  if (job) await cancelMatchSlopJob(ctx, job, reason);
}

async function createNextRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: Doc<"matchSlopState">,
  nextRound: number,
  promptText: string,
  statePatch: MatchSlopStatePatch,
  now: number,
): Promise<void> {
  const players = (await listMatchSlopPlayers(ctx, game._id)).filter(isActiveMatchSlopCompetitor);
  const roundId = await ctx.db.insert("rounds", {
    gameId: game._id,
    roundNumber: nextRound,
    openedAt: now,
  });
  const promptId = await ctx.db.insert("prompts", {
    gameId: game._id,
    roundId,
    ordinal: 0,
    text: promptText,
  });
  for (const player of players) {
    await ctx.db.insert("promptAssignments", {
      gameId: game._id,
      roundId,
      promptId,
      playerId: player._id,
    });
  }
  const phaseGeneration = game.phaseGeneration + 1;
  const phaseDeadline = getMatchSlopDeadline(game, now, MATCHSLOP_WRITING_SECONDS);
  await ctx.db.patch("matchSlopState", state._id, { ...statePatch, updatedAt: now });
  await ctx.db.patch("games", game._id, {
    currentRound: nextRound,
    status: "WRITING",
    phaseDeadline,
    phaseGeneration,
    votingPromptIndex: 0,
    votingRevealing: false,
    updatedAt: now,
  });
  if (phaseDeadline !== undefined) {
    await scheduleMatchSlopDeadline(ctx, {
      gameId: game._id,
      deadline: phaseDeadline,
      phaseGeneration,
    });
  }
  const writingGame = await ctx.db.get("games", game._id);
  if (writingGame) await queueAiResponseWorkflows(ctx, writingGame);
}

async function finishFromPersonaReply(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: Doc<"matchSlopState">,
  statePatch: MatchSlopStatePatch,
  outcome: "COMEBACK" | "DATE_SEALED" | "TURN_LIMIT" | "UNMATCHED",
  now: number,
): Promise<void> {
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("matchSlopState", state._id, {
    ...statePatch,
    outcome,
    updatedAt: now,
  });
  await ctx.db.patch("games", game._id, {
    finalizedAt: now,
    status: "FINAL_RESULTS",
    phaseDeadline: undefined,
    phaseGeneration,
    votingRevealing: false,
    updatedAt: now,
  });
  const finalGame = await ctx.db.get("games", game._id);
  if (finalGame) await queuePostMortemWorkflow(ctx, finalGame);
}

async function advanceRoundResults(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
  allowFallback: boolean,
): Promise<MatchSlopPhase> {
  const [state, transcript] = await Promise.all([
    loadMatchSlopState(ctx, game._id),
    loadMatchSlopTranscript(ctx, game._id),
  ]);
  if (!state) throw new ConvexError("MatchSlop state is missing");
  const runtime = readMatchSlopRuntimeState(state);
  if (!runtime.profile || !runtime.lastRoundResult) {
    await finishFromPersonaReply(
      ctx,
      game,
      state,
      { lastRoundResult: undefined, pendingPersonaReply: emptyPendingPersonaReply() },
      state.comebackRound === game.currentRound ? "UNMATCHED" : "TURN_LIMIT",
      now,
    );
    return "FINAL_RESULTS";
  }

  const pending = runtime.pendingPersonaReply;
  if (pending.status === "GENERATING" && !allowFallback) return "ROUND_RESULTS";
  const generatedReply =
    pending.status === "READY" &&
    pending.reply !== null &&
    pending.outcome !== null &&
    pending.moodDelta !== null
      ? { reply: pending.reply, outcome: pending.outcome, moodDelta: pending.moodDelta }
      : null;
  if (!generatedReply && !allowFallback && pending.status !== "FAILED") {
    return "ROUND_RESULTS";
  }
  const resolvedReply = generatedReply ?? fallbackPersonaReply(game.currentRound === 1);
  if (!generatedReply) await cancelCurrentReplyJob(ctx, game, "Phase advanced with fallback reply");

  const moodResult = applyPersonaMood(
    state.mood,
    resolvedReply.moodDelta,
    resolvedReply.outcome,
    game.currentRound === 1,
  );
  const plan = resolveAdvancePlan({
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    comebackRound: state.comebackRound ?? null,
    personaOutcome: moodResult.outcome,
  });
  const signal = deriveFallbackSignal(resolvedReply.moodDelta, moodResult.mood, moodResult.outcome);
  const existingTurnEntries = transcript.filter((entry) => entry.turn === game.currentRound);
  if (existingTurnEntries.length === 0) {
    await ctx.db.insert("matchSlopTranscriptEntries", {
      gameId: game._id,
      turn: game.currentRound,
      ordinal: 0,
      speaker: "PLAYERS",
      text: runtime.lastRoundResult.winnerText,
      ...(runtime.lastRoundResult.authorName
        ? { authorName: runtime.lastRoundResult.authorName }
        : {}),
      ...(game.currentRound === 1 && runtime.lastRoundResult.selectedPromptText
        ? { selectedPromptText: runtime.lastRoundResult.selectedPromptText }
        : {}),
      ...(game.currentRound === 1 && runtime.lastRoundResult.selectedPromptId
        ? { selectedPromptId: runtime.lastRoundResult.selectedPromptId }
        : {}),
      createdAt: now,
    });
    await ctx.db.insert("matchSlopTranscriptEntries", {
      gameId: game._id,
      turn: game.currentRound,
      ordinal: 1,
      speaker: "PERSONA",
      text: resolvedReply.reply,
      outcome: plan.transcriptOutcome,
      authorName: runtime.profile.displayName,
      mood: moodResult.mood,
      createdAt: now,
    });
  }
  const commonPatch: MatchSlopStatePatch = {
    lastRoundResult: undefined,
    pendingPersonaReply: emptyPendingPersonaReply(),
    comebackRound: plan.comebackRound ?? undefined,
    mood: moodResult.mood,
    latestMoodDelta: resolvedReply.moodDelta,
    latestSignalCategory: pending.signalCategory ?? signal.signalCategory,
    latestSideComment: pending.sideComment ?? undefined,
    latestNextSignal: pending.nextSignal ?? signal.nextSignal,
  };
  if (plan.kind === "FINAL_RESULTS") {
    await finishFromPersonaReply(ctx, game, state, commonPatch, plan.nextOutcome, now);
    return "FINAL_RESULTS";
  }
  await createNextRound(
    ctx,
    game,
    state,
    plan.nextRound,
    resolvedReply.reply,
    { ...commonPatch, outcome: "IN_PROGRESS" },
    now,
  );
  return "WRITING";
}

export async function forceAdvanceMatchSlop(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
  options?: { allowReplyFallback?: boolean },
): Promise<MatchSlopPhase | null> {
  if (!isMatchSlopGame(game)) return null;
  if (game.status === "ROUND_RESULTS") {
    return advanceRoundResults(ctx, game, now, options?.allowReplyFallback === true);
  }
  if (game.status !== "WRITING" && game.status !== "VOTING") return null;
  const [bundle, players] = await Promise.all([
    loadMatchSlopRound(ctx, game._id, game.currentRound),
    listMatchSlopPlayers(ctx, game._id),
  ]);
  if (!bundle) return null;
  if (game.status === "WRITING") {
    const state = await loadMatchSlopState(ctx, game._id);
    if (!state || !readMatchSlopRuntimeState(state).profile) {
      throw new ConvexError("The MatchSlop profile is still generating");
    }
    await fillForfeitResponses(ctx, game, bundle, players, now);
    const refreshedBundle = await loadMatchSlopRound(ctx, game._id, game.currentRound);
    if (!refreshedBundle) return null;
    await transitionToVoting(ctx, game, refreshedBundle, players, now);
    return "VOTING";
  }
  await fillAbstainVotes(ctx, game, bundle, players, now);
  await transitionToRoundResults(ctx, game, now);
  const current = await ctx.db.get("games", game._id);
  return current?.status === "FINAL_RESULTS" ? "FINAL_RESULTS" : "ROUND_RESULTS";
}

export async function endMatchSlop(
  ctx: MutationCtx,
  initialGame: Doc<"games">,
  now: number,
): Promise<void> {
  if (!isMatchSlopGame(initialGame)) {
    throw new ConvexError("This action is only available for MatchSlop");
  }
  if (initialGame.status === "FINAL_RESULTS") return;
  if (initialGame.status === "LOBBY") throw new ConvexError("Cannot end game in current state");
  let game = initialGame;
  if (game.status === "WRITING") {
    const [bundle, players] = await Promise.all([
      loadMatchSlopRound(ctx, game._id, game.currentRound),
      listMatchSlopPlayers(ctx, game._id),
    ]);
    if (bundle) {
      await fillForfeitResponses(ctx, game, bundle, players, now);
      const refreshed = await loadMatchSlopRound(ctx, game._id, game.currentRound);
      if (refreshed) await transitionToVoting(ctx, game, refreshed, players, now);
      const next = await ctx.db.get("games", game._id);
      if (next) game = next;
    }
  }
  if (game.status === "VOTING") {
    const [bundle, players] = await Promise.all([
      loadMatchSlopRound(ctx, game._id, game.currentRound),
      listMatchSlopPlayers(ctx, game._id),
    ]);
    if (bundle) {
      await fillAbstainVotes(ctx, game, bundle, players, now);
      await transitionToRoundResults(ctx, game, now);
      const next = await ctx.db.get("games", game._id);
      if (next) game = next;
    }
  }
  if (game.status === "FINAL_RESULTS") return;
  if (game.status === "ROUND_RESULTS") {
    await cancelCurrentReplyJob(ctx, game, "Game ended by host");
  }
  const state = await getMatchSlopState(ctx, game._id);
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("matchSlopState", state._id, {
    outcome: state.outcome === "IN_PROGRESS" ? "TURN_LIMIT" : state.outcome,
    updatedAt: now,
  });
  await ctx.db.patch("games", game._id, {
    finalizedAt: now,
    status: "FINAL_RESULTS",
    phaseDeadline: undefined,
    phaseGeneration,
    votingRevealing: false,
    updatedAt: now,
  });
  const finalGame = await ctx.db.get("games", game._id);
  if (finalGame) await queuePostMortemWorkflow(ctx, finalGame);
}

function requireActiveHuman(player: Doc<"players">): void {
  if (player.type !== "HUMAN") throw new ConvexError("Only human players can perform this action");
  if (player.participationStatus !== "ACTIVE") {
    throw new ConvexError("Disconnected players cannot perform this action");
  }
}

export async function submitHumanResponse(
  ctx: MutationCtx,
  args: {
    game: Doc<"games">;
    player: Doc<"players">;
    promptId: Id<"prompts">;
    text: string;
    selectedPromptId: string | null;
  },
): Promise<{ phase: MatchSlopPhase | null; responseId: Id<"responses"> }> {
  requireActiveHuman(args.player);
  const bundle = await loadMatchSlopRound(ctx, args.game._id, args.game.currentRound);
  requireCurrentMatchSlopRound(bundle, args.promptId);
  if (!bundle.assignments.some((assignment) => assignment.playerId === args.player._id)) {
    throw new ConvexError("You are not assigned to this prompt");
  }
  const existing = await ctx.db
    .query("responses")
    .withIndex("by_promptId_and_playerId", (index) =>
      index.eq("promptId", bundle.prompt._id).eq("playerId", args.player._id),
    )
    .unique();
  if (existing) {
    if (
      existing.gameId !== args.game._id ||
      existing.roundId !== bundle.round._id ||
      existing.promptId !== bundle.prompt._id
    ) {
      throw new ConvexError("Existing response does not belong to the current round");
    }
    const phase =
      args.game.status === "VOTING" ||
      args.game.status === "ROUND_RESULTS" ||
      args.game.status === "FINAL_RESULTS"
        ? args.game.status
        : null;
    return { phase, responseId: existing._id };
  }
  if (args.game.status !== "WRITING") throw new ConvexError("Game not in writing phase");
  const text = sanitize(args.text, MAX_RESPONSE_LENGTH);
  if (!text) throw new ConvexError("Response text cannot be empty");
  if (isForfeitMarker(text)) throw new ConvexError("Response text is not allowed");
  let metadata: Record<string, unknown> | undefined;
  if (args.game.currentRound === 1) {
    if (!args.selectedPromptId) {
      throw new ConvexError("MatchSlop openers must pick a profile prompt");
    }
    if (args.selectedPromptId === MATCHSLOP_PHOTO_PROMPT_ID) {
      metadata = {
        selectedPromptId: MATCHSLOP_PHOTO_PROMPT_ID,
        selectedPromptText: MATCHSLOP_PHOTO_PROMPT_TEXT,
      };
    } else {
      const state = await getMatchSlopState(ctx, args.game._id);
      const profile = readMatchSlopRuntimeState(state).profile;
      if (!profile) throw new ConvexError("The MatchSlop profile is still generating");
      const selected = profile.prompts.find((prompt) => prompt.id === args.selectedPromptId);
      if (!selected) throw new ConvexError("Selected MatchSlop prompt is invalid");
      metadata = { selectedPromptId: selected.id, selectedPromptText: selected.prompt };
    }
  }
  const now = Date.now();
  const responseId = await ctx.db.insert("responses", {
    gameId: args.game._id,
    roundId: bundle.round._id,
    promptId: bundle.prompt._id,
    playerId: args.player._id,
    text,
    ...(metadata ? { metadata } : {}),
    pointsEarned: 0,
    submittedAt: now,
  });
  const phase = await settleMatchSlopQuorum(ctx, args.game, now);
  return { phase, responseId };
}

export async function castHumanVote(
  ctx: MutationCtx,
  args: {
    game: Doc<"games">;
    player: Doc<"players">;
    promptId: Id<"prompts">;
    responseId: Id<"responses"> | null;
  },
): Promise<{ phase: MatchSlopPhase | null; voteId: Id<"votes"> }> {
  requireActiveHuman(args.player);
  const bundle = await loadMatchSlopRound(ctx, args.game._id, args.game.currentRound);
  requireCurrentMatchSlopRound(bundle, args.promptId);
  if (!bundle.assignments.some((assignment) => assignment.playerId === args.player._id)) {
    throw new ConvexError("You are not assigned to this prompt");
  }
  const existing = await ctx.db
    .query("votes")
    .withIndex("by_promptId_and_voterId", (index) =>
      index.eq("promptId", bundle.prompt._id).eq("voterId", args.player._id),
    )
    .unique();
  if (existing) {
    if (
      existing.gameId !== args.game._id ||
      existing.roundId !== bundle.round._id ||
      existing.promptId !== bundle.prompt._id
    ) {
      throw new ConvexError("Existing vote does not belong to the current round");
    }
    const phase =
      args.game.status === "ROUND_RESULTS" || args.game.status === "FINAL_RESULTS"
        ? args.game.status
        : null;
    return { phase, voteId: existing._id };
  }
  if (args.game.status !== "VOTING" || args.game.votingRevealing) {
    throw new ConvexError("Game not in voting phase");
  }
  let selected: Doc<"responses"> | null = null;
  if (args.responseId) {
    selected = bundle.responses.find((response) => response._id === args.responseId) ?? null;
    if (
      !selected ||
      selected.gameId !== args.game._id ||
      selected.roundId !== bundle.round._id ||
      selected.promptId !== bundle.prompt._id
    ) {
      throw new ConvexError("Response does not belong to this prompt");
    }
    if (selected.text === FORFEIT_MARKER)
      throw new ConvexError("Cannot vote for a forfeited response");
    if (selected.playerId === args.player._id)
      throw new ConvexError("Cannot vote for your own response");
  }
  const now = Date.now();
  const voteId = await ctx.db.insert("votes", {
    gameId: args.game._id,
    roundId: bundle.round._id,
    promptId: bundle.prompt._id,
    voterId: args.player._id,
    ...(selected ? { responseId: selected._id } : {}),
    castAt: now,
  });
  const phase = await settleMatchSlopQuorum(ctx, args.game, now);
  return { phase, voteId };
}
