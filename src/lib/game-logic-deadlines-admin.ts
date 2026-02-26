import { prisma } from "./db";
import { HOST_STALE_MS, VOTE_PER_PROMPT_SECONDS } from "./game-constants";
import { applyScoreResult, scorePrompt, type PlayerState } from "./scoring";
import type { PlayerType } from "./types";
import type { PhaseAdvanceResult } from "./game-logic-core";
import {
  fillAbstainVotes,
  getVotablePrompts,
  revealCurrentPrompt,
  startVoting,
} from "./game-logic-voting";

function toPlayerType(value: string): PlayerType {
  if (value === "AI" || value === "SPECTATOR") return value;
  return "HUMAN";
}

/** Advance to the next prompt, or transition to ROUND_RESULTS if last prompt. */
export async function advanceToNextPrompt(gameId: string): Promise<"VOTING_SUBPHASE" | "ROUND_RESULTS" | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingPromptIndex: true, votingRevealing: true, timersDisabled: true },
  });
  if (!game || game.status !== "VOTING" || !game.votingRevealing) return null;

  const votablePrompts = await getVotablePrompts(gameId);
  const nextIndex = game.votingPromptIndex + 1;

  if (nextIndex >= votablePrompts.length) {
    // Last prompt done — transition to ROUND_RESULTS
    await calculateRoundScores(gameId);
    return "ROUND_RESULTS";
  }

  const deadline = game.timersDisabled
    ? null
    : new Date(Date.now() + VOTE_PER_PROMPT_SECONDS * 1000);

  const claim = await prisma.game.updateMany({
    where: {
      id: gameId,
      status: "VOTING",
      votingRevealing: true,
      votingPromptIndex: game.votingPromptIndex,
    },
    data: {
      votingPromptIndex: nextIndex,
      votingRevealing: false,
      phaseDeadline: deadline,
      version: { increment: 1 },
    },
  });

  return claim.count > 0 ? "VOTING_SUBPHASE" : null;
}

async function applyRoundScores(gameId: string): Promise<void> {
  const [round, players] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        roundNumber: true,
        prompts: {
          select: {
            responses: {
              select: { id: true, playerId: true, text: true },
            },
            votes: {
              select: {
                responseId: true,
                voter: { select: { id: true, type: true } },
              },
            },
          },
        },
      },
    }),
    prisma.player.findMany({
      where: { gameId, type: { not: "SPECTATOR" } },
      select: { id: true, type: true, score: true, humorRating: true, winStreak: true },
    }),
  ]);

  if (!round) return;

  // Build mutable player states — updated after each prompt
  const playerStates = new Map<string, PlayerState>(
    players.map((p) => [p.id, { score: p.score, humorRating: p.humorRating, winStreak: p.winStreak }]),
  );

  const scoreIncrements: Record<string, number> = {};
  const responsePoints: { id: string; points: number }[] = [];

  // Build a player type lookup once (stable across prompts)
  const playerTypeMap = new Map(players.map((p) => [p.id, toPlayerType(p.type)]));

  for (const prompt of round.prompts) {
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
    const eligibleVoterCount = players.filter((p) => !respondentIds.has(p.id)).length;

    const result = scorePrompt(
      prompt.responses.map((r) => ({
        id: r.id,
        playerId: r.playerId,
        playerType: playerTypeMap.get(r.playerId) ?? "HUMAN",
        text: r.text,
      })),
      prompt.votes.map((v) => ({ id: v.voter.id, type: v.voter.type, responseId: v.responseId })),
      playerStates,
      round.roundNumber,
      eligibleVoterCount,
    );

    // Accumulate score increments for DB writes
    for (const resp of prompt.responses) {
      const pts = result.points[resp.id] ?? 0;
      scoreIncrements[resp.playerId] = (scoreIncrements[resp.playerId] ?? 0) + pts;
      responsePoints.push({ id: resp.id, points: pts });
    }
    for (const [playerId, penalty] of Object.entries(result.penalties)) {
      scoreIncrements[playerId] = (scoreIncrements[playerId] ?? 0) + penalty;
    }

    // Update running player states for subsequent prompts
    applyScoreResult(result, prompt.responses, playerStates);
  }

  // Batch DB updates
  await Promise.all([
    // Player score, HR, streak
    ...Object.entries(scoreIncrements).map(([playerId, points]) => {
      const state = playerStates.get(playerId)!;
      return prisma.player.update({
        where: { id: playerId },
        data: {
          score: { increment: points },
          humorRating: state.humorRating,
          winStreak: state.winStreak,
        },
      });
    }),
    // Response pointsEarned
    ...responsePoints.map(({ id, points }) =>
      prisma.response.update({
        where: { id },
        data: { pointsEarned: points },
      }),
    ),
  ]);
}

/** Atomically transition VOTING to ROUND_RESULTS and apply scores. */
export async function calculateRoundScores(gameId: string): Promise<void> {
  // Atomic guard: only one caller can claim VOTING→ROUND_RESULTS
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "VOTING" },
    data: { status: "ROUND_RESULTS", phaseDeadline: null, winnerTagline: null, version: { increment: 1 } },
  });
  if (claim.count === 0) return;

  await applyRoundScores(gameId);

  // Bump version again so pollers see the updated scores
  // (a poller arriving between the status change and score application would see 0s)
  await prisma.game.update({
    where: { id: gameId },
    data: { version: { increment: 1 } },
  });
}

/**
 * Fill "..." placeholder responses for any assigned players who haven't submitted.
 * Also tracks idle rounds: increment for HUMAN players who didn't submit, reset for those who did.
 */
async function fillPlaceholderResponses(gameId: string): Promise<void> {
  const [round, humanPlayers] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          select: {
            id: true,
            text: true,
            assignments: { select: { playerId: true } },
            responses: { select: { playerId: true } },
          },
        },
      },
    }),
    prisma.player.findMany({
      where: { gameId, type: "HUMAN" },
      select: { id: true },
    }),
  ]);

  if (!round) return;

  // Collect player IDs who were assigned but didn't submit (idle)
  const idlePlayerIds = new Set<string>();
  const activePlayerIds = new Set<string>();

  const creates = round.prompts.flatMap((prompt) => {
    const submittedPlayerIds = new Set(prompt.responses.map((r) => r.playerId));
    // Track active submitters
    for (const pid of submittedPlayerIds) activePlayerIds.add(pid);

    return prompt.assignments
      .filter((a) => !submittedPlayerIds.has(a.playerId))
      .map((a) => {
        idlePlayerIds.add(a.playerId);
        console.warn(`[fillPlaceholder] Player ${a.playerId} timed out on prompt "${prompt.text.slice(0, 50)}" in game ${gameId}`);
        return prisma.response.create({
          data: {
            promptId: prompt.id,
            playerId: a.playerId,
            text: "...",
          },
        });
      });
  });
  if (creates.length > 0) {
    console.warn(`[fillPlaceholder] Filling ${creates.length} placeholder responses for game ${gameId}`);
  }
  await Promise.all(creates);

  // Update idle tracking for HUMAN players
  await Promise.all(
    humanPlayers
      .filter((p) => idlePlayerIds.has(p.id) || activePlayerIds.has(p.id))
      .map((p) =>
        prisma.player.update({
          where: { id: p.id },
          data: { idleRounds: idlePlayerIds.has(p.id) ? { increment: 1 } : 0 },
        }),
      ),
  );
}

/** Advance through voting sub-phases: fill abstain votes → reveal, or advance to next prompt. */
async function advanceVotingSubPhase(gameId: string, votingRevealing: boolean): Promise<PhaseAdvanceResult> {
  if (!votingRevealing) {
    await fillAbstainVotes(gameId);
    const claimed = await revealCurrentPrompt(gameId);
    return claimed ? "VOTING_SUBPHASE" : null;
  }
  return advanceToNextPrompt(gameId);
}

/**
 * Fill placeholder responses for missing players and advance the phase.
 * During VOTING, steps through sub-phases (vote -> reveal -> next) instead of jumping to ROUND_RESULTS.
 * Returns the phase advanced to, so callers can trigger AI work in background.
 */
export async function forceAdvancePhase(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingRevealing: true },
  });
  if (!game) return null;

  if (game.status === "WRITING") {
    await fillPlaceholderResponses(gameId);
    const claimed = await startVoting(gameId);
    return claimed ? "VOTING" : null;
  }

  if (game.status === "VOTING") {
    return advanceVotingSubPhase(gameId, game.votingRevealing);
  }

  return null;
}

/**
 * Check if the phase deadline has passed and advance if so.
 * Uses optimistic locking to prevent duplicate transitions from concurrent pollers.
 * During VOTING, delegates to sub-phase functions which have their own atomic guards.
 * Returns the phase advanced to, so callers can trigger AI work in background.
 */
export async function checkAndEnforceDeadline(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, phaseDeadline: true, votingRevealing: true },
  });
  if (!game?.phaseDeadline) return null;

  if (new Date() < game.phaseDeadline) return null;

  if (game.status === "VOTING") {
    return advanceVotingSubPhase(gameId, game.votingRevealing);
  }

  // Non-VOTING phases: optimistic lock on phaseDeadline
  const result = await prisma.game.updateMany({
    where: { id: gameId, phaseDeadline: game.phaseDeadline },
    data: { phaseDeadline: null },
  });

  if (result.count === 0) return null;

  return forceAdvancePhase(gameId);
}

/**
 * End the game early, skipping to FINAL_RESULTS.
 * Fills placeholder responses and calculates scores for the current round if needed.
 */
export async function endGameEarly(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });
  if (!game || game.status === "LOBBY" || game.status === "FINAL_RESULTS") return;

  // Atomically claim the transition to FINAL_RESULTS
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: game.status },
    data: { status: "FINAL_RESULTS", phaseDeadline: null, winnerTagline: null, version: { increment: 1 } },
  });
  if (claim.count === 0) return;

  if (game.status === "WRITING") {
    await fillPlaceholderResponses(gameId);
  }

  if (game.status === "VOTING") {
    // Guard against in-flight AI responses that haven't finished yet
    await fillPlaceholderResponses(gameId);
    // Record non-voters as abstentions so penalty logic works correctly
    const votablePrompts = await getVotablePrompts(gameId);
    const allPlayers = await prisma.player.findMany({
      where: { gameId, type: { not: "SPECTATOR" } },
      select: { id: true },
    });
    for (const prompt of votablePrompts) {
      const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
      const existingVoterIds = new Set(prompt.votes.map((v) => v.voterId));
      const missing = allPlayers.filter(
        (p) => !respondentIds.has(p.id) && !existingVoterIds.has(p.id),
      );
      if (missing.length > 0) {
        await prisma.vote.createMany({
          data: missing.map((p) => ({ promptId: prompt.id, voterId: p.id })),
          skipDuplicates: true,
        });
      }
    }
  }

  if (game.status === "WRITING" || game.status === "VOTING") {
    await applyRoundScores(gameId);
  }
}

/**
 * Promote the most recently active human player to host.
 */
export async function promoteHost(gameId: string): Promise<void> {
  const nextHost = await prisma.player.findFirst({
    where: {
      gameId,
      type: "HUMAN",
      lastSeen: { gte: new Date(Date.now() - HOST_STALE_MS) },
    },
    orderBy: { lastSeen: "desc" },
    select: { id: true },
  });

  if (nextHost) {
    await prisma.game.update({
      where: { id: gameId },
      data: { hostPlayerId: nextHost.id, version: { increment: 1 } },
    });
  }
}
