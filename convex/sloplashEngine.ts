import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getRandomPrompts } from "../src/games/core/prompts";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { requireContinuingPlayers } from "./gamePhase";
import {
  REVEAL_SECONDS,
  ROUND_RESULTS_SECONDS,
  VOTE_PER_PROMPT_SECONDS,
  WRITING_DURATION_SECONDS,
} from "../src/games/sloplash/game-constants";
import {
  applyScoreResult,
  FORFEIT_MARKER,
  scorePrompt,
  type PlayerState,
} from "../src/games/sloplash/scoring";
import { cancelPendingWinnerTaglineJobs, queueWinnerTaglineForResults } from "./winnerTaglineData";

const MAX_PLAYERS = 16;
const MAX_ROUNDS = 10;
const MAX_PROMPTS = 128;
const MAX_ASSIGNMENTS = 256;
const MAX_RESPONSES = 256;
const MAX_VOTES = 1_024;

export type SloplashAdvanceResult =
  | "FINAL_RESULTS"
  | "ROUND_RESULTS"
  | "VOTING"
  | "VOTING_SUBPHASE"
  | "WRITING";

type DatabaseCtx = MutationCtx | QueryCtx;

export type RoundBundle = {
  assignments: Doc<"promptAssignments">[];
  prompts: Doc<"prompts">[];
  responses: Doc<"responses">[];
  round: Doc<"rounds">;
  votes: Doc<"votes">[];
};

type ScheduledDeadlineArgs = {
  deadline: number;
  gameId: Id<"games">;
  phaseGeneration: number;
};

const enforceDeadlineReference = makeFunctionReference<
  "mutation",
  ScheduledDeadlineArgs,
  { advanced: boolean; phase: SloplashAdvanceResult | null }
>("sloplash:enforceDeadline");

const enqueueQueuedResponseJobsReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("aiGenerationData:enqueueQueuedResponseJobs");

const enqueueQueuedVoteJobsReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("aiVotingData:enqueueQueuedVoteJobs");

const projectFinalGameReference = makeFunctionReference<
  "mutation",
  { gameId: Id<"games"> },
  unknown
>("leaderboards:projectFinalGame");

async function queueSloplashGenerationJob(
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

export async function listSloplashPlayers(
  ctx: DatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"players">[]> {
  return ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS);
}

export async function loadSloplashRound(
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

  const [prompts, assignments, responses, votes] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_PROMPTS),
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

  return {
    assignments,
    prompts: prompts.toSorted((left, right) => left.ordinal - right.ordinal),
    responses,
    round,
    votes,
  };
}

function responsesForPrompt(bundle: Pick<RoundBundle, "responses">, promptId: Id<"prompts">) {
  return bundle.responses.filter((response) => response.promptId === promptId);
}

function votesForPrompt(bundle: RoundBundle, promptId: Id<"prompts">) {
  return bundle.votes.filter((vote) => vote.promptId === promptId);
}

export function getVotableSloplashPrompts(
  bundle: Pick<RoundBundle, "prompts" | "responses">,
): Doc<"prompts">[] {
  return bundle.prompts
    .filter((prompt) => {
      const responses = responsesForPrompt(bundle, prompt._id);
      return (
        responses.length >= 2 && !responses.some((response) => response.text === FORFEIT_MARKER)
      );
    })
    .toSorted((left, right) => left._id.localeCompare(right._id));
}

export async function scheduleSloplashDeadline(
  ctx: MutationCtx,
  args: ScheduledDeadlineArgs,
): Promise<void> {
  await ctx.scheduler.runAt(args.deadline, enforceDeadlineReference, args);
}

async function queueAiResponseJobs(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
  players: Doc<"players">[],
): Promise<void> {
  for (const player of players) {
    if (player.type !== "AI") continue;
    await queueSloplashGenerationJob(ctx, {
      gameId,
      generationKey: `response:${roundNumber}:${player._id}`,
      kind: "RESPONSE",
      targetId: player._id,
    });
  }
}

async function queueAiVoteJobs(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  players: Doc<"players">[],
): Promise<void> {
  for (const prompt of getVotableSloplashPrompts(bundle)) {
    const respondentIds = new Set(
      responsesForPrompt(bundle, prompt._id).map((response) => response.playerId),
    );
    for (const player of players) {
      if (player.type !== "AI" || !isActiveCompetitor(player) || respondentIds.has(player._id)) {
        continue;
      }
      await queueSloplashGenerationJob(ctx, {
        gameId: game._id,
        generationKey: `vote:${game.currentRound}:${prompt._id}:${player._id}`,
        kind: "VOTE",
        targetId: player._id,
      });
    }
  }
}

export async function createNextSloplashRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<Id<"rounds">> {
  const roundNumber = game.currentRound + 1;
  const [players, usedPrompts] = await Promise.all([
    listSloplashPlayers(ctx, game._id),
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) => index.eq("gameId", game._id))
      .take(MAX_ROUNDS * MAX_PLAYERS),
  ]);
  const participants = players.filter(isActiveCompetitor);
  requireContinuingPlayers(participants.length);
  const promptTexts = getRandomPrompts(
    participants.length,
    new Set(usedPrompts.map((prompt) => prompt.text)),
  );
  const roundId = await ctx.db.insert("rounds", {
    gameId: game._id,
    roundNumber,
    openedAt: now,
  });

  for (let index = 0; index < participants.length; index += 1) {
    const first = participants[index];
    const second = participants[(index + 1) % participants.length];
    if (!first || !second) continue;
    const promptId = await ctx.db.insert("prompts", {
      gameId: game._id,
      roundId,
      ordinal: index,
      text: promptTexts[index] ?? `Prompt #${index + 1}: Make us laugh!`,
    });
    for (const player of [first, second]) {
      await ctx.db.insert("promptAssignments", {
        gameId: game._id,
        roundId,
        promptId,
        playerId: player._id,
      });
    }
  }

  const phaseDeadline = game.timersDisabled ? undefined : now + WRITING_DURATION_SECONDS * 1_000;
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("games", game._id, {
    currentRound: roundNumber,
    phaseDeadline,
    phaseGeneration,
    status: "WRITING",
    updatedAt: now,
    votingPromptIndex: 0,
    votingRevealing: false,
    winnerTagline: undefined,
  });
  await cancelPendingWinnerTaglineJobs(ctx, {
    gameId: game._id,
    reason: "Winner tagline phase is no longer current",
  });
  await queueAiResponseJobs(ctx, game._id, roundNumber, participants);
  if (participants.some((player) => player.type === "AI")) {
    await ctx.scheduler.runAfter(0, enqueueQueuedResponseJobsReference, { gameId: game._id });
  }
  if (phaseDeadline !== undefined) {
    await scheduleSloplashDeadline(ctx, {
      deadline: phaseDeadline,
      gameId: game._id,
      phaseGeneration,
    });
  }
  return roundId;
}

function hasAllResponses(bundle: RoundBundle): boolean {
  return (
    bundle.prompts.length > 0 &&
    bundle.prompts.every((prompt) => responsesForPrompt(bundle, prompt._id).length >= 2)
  );
}

export async function fillPlaceholderResponses(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<void> {
  const [bundle, players] = await Promise.all([
    loadSloplashRound(ctx, game._id, game.currentRound),
    listSloplashPlayers(ctx, game._id),
  ]);
  if (!bundle) return;

  const idlePlayerIds = new Set<Id<"players">>();
  const submittedPlayerIds = new Set(bundle.responses.map((response) => response.playerId));
  const responseKeys = new Set(
    bundle.responses.map((response) => `${response.promptId}:${response.playerId}`),
  );

  for (const assignment of bundle.assignments) {
    const key = `${assignment.promptId}:${assignment.playerId}`;
    if (responseKeys.has(key)) continue;
    idlePlayerIds.add(assignment.playerId);
    responseKeys.add(key);
    await ctx.db.insert("responses", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: assignment.promptId,
      playerId: assignment.playerId,
      text: FORFEIT_MARKER,
      pointsEarned: 0,
      submittedAt: now,
    });
  }

  const assignedPlayerIds = new Set(bundle.assignments.map((assignment) => assignment.playerId));
  for (const player of players) {
    if (player.type !== "HUMAN" || !assignedPlayerIds.has(player._id)) continue;
    if (idlePlayerIds.has(player._id)) {
      await ctx.db.patch("players", player._id, { idleRounds: player.idleRounds + 1 });
    } else if (submittedPlayerIds.has(player._id) && player.idleRounds !== 0) {
      await ctx.db.patch("players", player._id, { idleRounds: 0 });
    }
  }
}

export async function transitionWritingToVoting(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
  force: boolean,
): Promise<boolean> {
  if (game.gameType !== "SLOPLASH" || game.status !== "WRITING") return false;
  const [bundle, players] = await Promise.all([
    loadSloplashRound(ctx, game._id, game.currentRound),
    listSloplashPlayers(ctx, game._id),
  ]);
  if (!bundle || (!force && !hasAllResponses(bundle))) return false;

  const phaseDeadline = game.timersDisabled ? undefined : now + VOTE_PER_PROMPT_SECONDS * 1_000;
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("games", game._id, {
    phaseDeadline,
    phaseGeneration,
    status: "VOTING",
    updatedAt: now,
    votingPromptIndex: 0,
    votingRevealing: false,
  });
  await queueAiVoteJobs(ctx, game, bundle, players);
  await ctx.scheduler.runAfter(0, enqueueQueuedVoteJobsReference, { gameId: game._id });
  if (phaseDeadline !== undefined) {
    await scheduleSloplashDeadline(ctx, {
      deadline: phaseDeadline,
      gameId: game._id,
      phaseGeneration,
    });
  }
  return true;
}

async function fillAbstainVotesForPrompt(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  prompt: Doc<"prompts">,
  players: Doc<"players">[],
  now: number,
): Promise<void> {
  const respondentIds = new Set(
    responsesForPrompt(bundle, prompt._id).map((response) => response.playerId),
  );
  const existingVoterIds = new Set(votesForPrompt(bundle, prompt._id).map((vote) => vote.voterId));
  for (const player of players) {
    if (respondentIds.has(player._id) || existingVoterIds.has(player._id)) continue;
    await ctx.db.insert("votes", {
      gameId: game._id,
      roundId: bundle.round._id,
      promptId: prompt._id,
      voterId: player._id,
      castAt: now,
    });
  }
}

export async function fillAllAbstainVotes(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<void> {
  const bundle = await loadSloplashRound(ctx, game._id, game.currentRound);
  if (!bundle) return;
  // The roster cannot change while this mutation runs, so load it once rather
  // than re-querying it for every prompt.
  const players = (await listSloplashPlayers(ctx, game._id)).filter(isActiveCompetitor);
  for (const prompt of getVotableSloplashPrompts(bundle)) {
    await fillAbstainVotesForPrompt(ctx, game, bundle, prompt, players, now);
  }
}

async function currentVotablePrompt(
  ctx: DatabaseCtx,
  game: Doc<"games">,
): Promise<{ bundle: RoundBundle; prompt: Doc<"prompts"> } | null> {
  const bundle = await loadSloplashRound(ctx, game._id, game.currentRound);
  if (!bundle) return null;
  const prompt = getVotableSloplashPrompts(bundle)[game.votingPromptIndex];
  return prompt ? { bundle, prompt } : null;
}

export async function hasCurrentVoteQuorum(ctx: DatabaseCtx, game: Doc<"games">): Promise<boolean> {
  const current = await currentVotablePrompt(ctx, game);
  if (!current) return false;
  const players = (await listSloplashPlayers(ctx, game._id)).filter(isActiveCompetitor);
  const respondentIds = new Set(
    responsesForPrompt(current.bundle, current.prompt._id).map((response) => response.playerId),
  );
  const voterIds = new Set(
    votesForPrompt(current.bundle, current.prompt._id).map((vote) => vote.voterId),
  );
  return players
    .filter((player) => !respondentIds.has(player._id))
    .every((player) => voterIds.has(player._id));
}

export async function revealCurrentSloplashPrompt(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
  fillAbstains: boolean,
): Promise<boolean> {
  if (game.status !== "VOTING" || game.votingRevealing) return false;
  const current = await currentVotablePrompt(ctx, game);
  if (!current) {
    // Legacy Slop-Lash still steps through a reveal subphase when every
    // matchup forfeits, which keeps host and deadline behavior predictable.
  } else if (fillAbstains) {
    const players = (await listSloplashPlayers(ctx, game._id)).filter(isActiveCompetitor);
    await fillAbstainVotesForPrompt(ctx, game, current.bundle, current.prompt, players, now);
  }

  const phaseDeadline = game.timersDisabled ? undefined : now + REVEAL_SECONDS * 1_000;
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("games", game._id, {
    phaseDeadline,
    phaseGeneration,
    updatedAt: now,
    votingRevealing: true,
  });
  if (phaseDeadline !== undefined) {
    await scheduleSloplashDeadline(ctx, {
      deadline: phaseDeadline,
      gameId: game._id,
      phaseGeneration,
    });
  }
  return true;
}

async function applyRoundScores(ctx: MutationCtx, game: Doc<"games">, now: number): Promise<void> {
  const [bundle, players] = await Promise.all([
    loadSloplashRound(ctx, game._id, game.currentRound),
    listSloplashPlayers(ctx, game._id),
  ]);
  if (!bundle || bundle.round.completedAt !== undefined) return;
  const competitors = players.filter((player) => player.type !== "SPECTATOR");
  const playerStates = new Map<Id<"players">, PlayerState>(
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

  for (const prompt of bundle.prompts) {
    const responses = responsesForPrompt(bundle, prompt._id);
    const respondentIds = new Set(responses.map((response) => response.playerId));
    const result = scorePrompt(
      responses.map((response) => ({
        id: response._id,
        playerId: response.playerId,
        playerType: playerTypes.get(response.playerId) ?? "HUMAN",
        text: response.text,
      })),
      votesForPrompt(bundle, prompt._id).map((vote) => ({
        id: vote.voterId,
        responseId: vote.responseId ?? null,
        type: playerTypes.get(vote.voterId) ?? "HUMAN",
      })),
      playerStates,
      bundle.round.roundNumber,
      competitors.filter((player) => !respondentIds.has(player._id)).length,
    );
    applyScoreResult(
      result,
      responses.map((response) => ({ id: response._id, playerId: response.playerId })),
      playerStates,
    );
    for (const response of responses) {
      await ctx.db.patch("responses", response._id, {
        pointsEarned: result.points[response._id] ?? 0,
      });
    }
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
): Promise<void> {
  await applyRoundScores(ctx, game, now);
  const phaseDeadline =
    game.hostPlayerId === undefined && !game.timersDisabled
      ? now + ROUND_RESULTS_SECONDS * 1_000
      : undefined;
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("games", game._id, {
    phaseDeadline,
    phaseGeneration,
    status: "ROUND_RESULTS",
    updatedAt: now,
    winnerTagline: undefined,
  });
  await queueWinnerTaglineForResults(ctx, {
    gameId: game._id,
    gameStatus: "ROUND_RESULTS",
    phaseGeneration,
  });
  if (phaseDeadline !== undefined) {
    await scheduleSloplashDeadline(ctx, {
      deadline: phaseDeadline,
      gameId: game._id,
      phaseGeneration,
    });
  }
}

async function advanceRevealedPrompt(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<SloplashAdvanceResult> {
  const bundle = await loadSloplashRound(ctx, game._id, game.currentRound);
  const votablePrompts = bundle ? getVotableSloplashPrompts(bundle) : [];
  const nextIndex = game.votingPromptIndex + 1;
  if (nextIndex >= votablePrompts.length) {
    await transitionToRoundResults(ctx, game, now);
    return "ROUND_RESULTS";
  }

  const phaseDeadline = game.timersDisabled ? undefined : now + VOTE_PER_PROMPT_SECONDS * 1_000;
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("games", game._id, {
    phaseDeadline,
    phaseGeneration,
    updatedAt: now,
    votingPromptIndex: nextIndex,
    votingRevealing: false,
  });
  await ctx.scheduler.runAfter(0, enqueueQueuedVoteJobsReference, { gameId: game._id });
  if (phaseDeadline !== undefined) {
    await scheduleSloplashDeadline(ctx, {
      deadline: phaseDeadline,
      gameId: game._id,
      phaseGeneration,
    });
  }
  return "VOTING_SUBPHASE";
}

async function advanceRoundResults(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<SloplashAdvanceResult> {
  if (game.currentRound >= game.totalRounds) {
    const phaseGeneration = game.phaseGeneration + 1;
    await ctx.db.patch("games", game._id, {
      finalizedAt: now,
      leaderboardProjectionStatus: "PENDING",
      leaderboardProjectionScheduledAt: undefined,
      phaseDeadline: undefined,
      phaseGeneration,
      status: "FINAL_RESULTS",
      updatedAt: now,
      votingRevealing: false,
      winnerTagline: undefined,
    });
    await queueWinnerTaglineForResults(ctx, {
      gameId: game._id,
      gameStatus: "FINAL_RESULTS",
      phaseGeneration,
    });
    await ctx.scheduler.runAfter(0, projectFinalGameReference, { gameId: game._id });
    return "FINAL_RESULTS";
  }
  await createNextSloplashRound(ctx, game, now);
  return "WRITING";
}

export async function forceAdvanceSloplash(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<SloplashAdvanceResult | null> {
  if (game.gameType !== "SLOPLASH") return null;
  switch (game.status) {
    case "WRITING":
      await fillPlaceholderResponses(ctx, game, now);
      return (await transitionWritingToVoting(ctx, game, now, true)) ? "VOTING" : null;
    case "VOTING":
      if (!game.votingRevealing) {
        return (await revealCurrentSloplashPrompt(ctx, game, now, true)) ? "VOTING_SUBPHASE" : null;
      }
      return advanceRevealedPrompt(ctx, game, now);
    case "ROUND_RESULTS":
      return advanceRoundResults(ctx, game, now);
    default:
      return null;
  }
}

export async function settleSloplashQuorum(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<SloplashAdvanceResult | null> {
  if (game.gameType !== "SLOPLASH") return null;
  if (game.status === "WRITING") {
    return (await transitionWritingToVoting(ctx, game, now, false)) ? "VOTING" : null;
  }
  if (
    game.status === "VOTING" &&
    !game.votingRevealing &&
    (await hasCurrentVoteQuorum(ctx, game))
  ) {
    return (await revealCurrentSloplashPrompt(ctx, game, now, false)) ? "VOTING_SUBPHASE" : null;
  }
  return null;
}

/**
 * "ALREADY_FINAL" is a successful no-op, "INVALID" a genuine error. Callers
 * cannot tell the two apart from a boolean, so the engine names them itself.
 */
export type EndSloplashResult = "ENDED" | "ALREADY_FINAL" | "INVALID";

export async function endSloplashEarly(
  ctx: MutationCtx,
  game: Doc<"games">,
  now: number,
): Promise<EndSloplashResult> {
  if (game.gameType !== "SLOPLASH" || game.status === "LOBBY") return "INVALID";
  if (game.status === "FINAL_RESULTS") return "ALREADY_FINAL";
  if (game.status === "WRITING" || game.status === "VOTING") {
    await fillPlaceholderResponses(ctx, game, now);
    if (game.status === "VOTING") await fillAllAbstainVotes(ctx, game, now);
    await applyRoundScores(ctx, game, now);
  }
  const phaseGeneration = game.phaseGeneration + 1;
  await ctx.db.patch("games", game._id, {
    finalizedAt: now,
    leaderboardProjectionStatus: "PENDING",
    leaderboardProjectionScheduledAt: undefined,
    phaseDeadline: undefined,
    phaseGeneration,
    status: "FINAL_RESULTS",
    updatedAt: now,
    votingRevealing: false,
    winnerTagline: undefined,
  });
  await queueWinnerTaglineForResults(ctx, {
    gameId: game._id,
    gameStatus: "FINAL_RESULTS",
    phaseGeneration,
  });
  await ctx.scheduler.runAfter(0, projectFinalGameReference, { gameId: game._id });
  return "ENDED";
}
