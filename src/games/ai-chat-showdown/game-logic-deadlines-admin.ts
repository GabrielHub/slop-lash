import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
  applyScoreResult,
  scorePrompt,
  type PlayerState,
} from "@/games/sloplash/scoring";
import type { PlayerType } from "@/lib/types";
import type { PhaseAdvanceResult } from "@/games/core";
import { getActivePlayerIds } from "./game-logic-core";
import { advanceGame } from "./game-logic-rounds";
import {
  getVotablePrompts,
  revealCurrentPrompt,
  startVoting,
} from "./game-logic-voting";
import { HOST_STALE_MS } from "./game-constants";

function toPlayerType(value: string): PlayerType {
  if (value === "AI" || value === "SPECTATOR") return value;
  return "HUMAN";
}

/** Apply scores for the current round using the shared weighted scoring formula. */
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

  const playerStates = new Map<string, PlayerState>(
    players.map((p) => [p.id, { score: p.score, humorRating: p.humorRating, winStreak: p.winStreak }]),
  );
  const playerTypeMap = new Map(players.map((p) => [p.id, toPlayerType(p.type)]));
  const scoreIncrements: Record<string, number> = {};
  const responsePoints: { id: string; points: number }[] = [];

  for (const prompt of round.prompts) {
    const eligibleVoterCount = prompt.responses.length;

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

    for (const resp of prompt.responses) {
      const pts = result.points[resp.id] ?? 0;
      scoreIncrements[resp.playerId] = (scoreIncrements[resp.playerId] ?? 0) + pts;
      responsePoints.push({ id: resp.id, points: pts });
    }
    for (const [playerId, penalty] of Object.entries(result.penalties)) {
      scoreIncrements[playerId] = (scoreIncrements[playerId] ?? 0) + penalty;
    }

    applyScoreResult(result, prompt.responses, playerStates);
  }

  await Promise.all([
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
    ...responsePoints.map(({ id, points }) =>
      prisma.response.update({
        where: { id },
        data: { pointsEarned: points },
      }),
    ),
  ]);
}

/** Atomically transition VOTING -> ROUND_RESULTS and apply scores. */
export async function calculateRoundScores(gameId: string): Promise<void> {
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "VOTING" },
    data: {
      status: "ROUND_RESULTS",
      phaseDeadline: null,
      winnerTagline: null,
      version: { increment: 1 },
    },
  });
  if (claim.count === 0) return;

  await applyRoundScores(gameId);

  await prisma.game.update({
    where: { id: gameId },
    data: { version: { increment: 1 } },
  });
}

/** Fill forfeit-marker responses for active players who haven't submitted (host skip). */
async function fillPlaceholderResponses(gameId: string): Promise<void> {
  const [round, activePlayerIds] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          select: {
            id: true,
            assignments: { select: { playerId: true } },
            responses: { select: { playerId: true } },
          },
        },
      },
    }),
    getActivePlayerIds(gameId),
  ]);

  if (!round) return;

  const activeSet = new Set(activePlayerIds);
  const creates: ReturnType<typeof prisma.response.create>[] = [];

  for (const prompt of round.prompts) {
    const submittedPlayerIds = new Set(prompt.responses.map((r) => r.playerId));

    for (const a of prompt.assignments) {
      if (submittedPlayerIds.has(a.playerId)) continue;
      if (!activeSet.has(a.playerId)) continue;

      creates.push(
        prisma.response.create({
          data: { promptId: prompt.id, playerId: a.playerId, text: FORFEIT_MARKER },
        }),
      );
    }
  }

  if (creates.length > 0) {
    await Promise.all(creates);
  }
}

/** Fill null-response votes for active voters who haven't voted (host skip). */
async function fillMissingVotes(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { votingPromptIndex: true },
  });
  if (!game) return;

  const [votablePrompts, activePlayerIds] = await Promise.all([
    getVotablePrompts(gameId),
    getActivePlayerIds(gameId),
  ]);

  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return;

  const existingVoterIds = new Set(currentPrompt.votes.map((v) => v.voterId));
  const missing = activePlayerIds.filter((id) => !existingVoterIds.has(id));

  if (missing.length > 0) {
    await prisma.vote.createMany({
      data: missing.map((voterId) => ({
        promptId: currentPrompt.id,
        voterId,
      })),
      skipDuplicates: true,
    });
  }
}

/** Force advance the current phase (host skip). */
export async function forceAdvancePhase(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingRevealing: true },
  });
  if (!game) return null;

  switch (game.status) {
    case "WRITING": {
      await fillPlaceholderResponses(gameId);
      const claimed = await startVoting(gameId);
      if (claimed) {
        // Trigger AI votes so the game doesn't stall in VOTING
        const { generateAiVotes } = await import("./game-logic-ai");
        await generateAiVotes(gameId);
      }
      return claimed ? "VOTING" : null;
    }
    case "VOTING": {
      if (game.votingRevealing) return null;
      await fillMissingVotes(gameId);
      const claimed = await revealCurrentPrompt(gameId);
      return claimed ? "ROUND_RESULTS" : null;
    }
    case "ROUND_RESULTS": {
      const newRoundStarted = await advanceGame(gameId);
      return newRoundStarted ? "WRITING" : "FINAL_RESULTS";
    }
    default:
      return null;
  }
}

/** No-op — action-gated mode has no deadlines. */
export async function checkAndEnforceDeadline(gameId: string): Promise<PhaseAdvanceResult> {
  void gameId;
  return null;
}

/** End the game early, skipping to FINAL_RESULTS with scores for completed work. */
export async function endGameEarly(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });
  if (!game || game.status === "LOBBY" || game.status === "FINAL_RESULTS") return;

  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: game.status },
    data: { status: "FINAL_RESULTS", phaseDeadline: null, winnerTagline: null, version: { increment: 1 } },
  });
  if (claim.count === 0) return;

  if (game.status === "WRITING" || game.status === "VOTING") {
    await fillPlaceholderResponses(gameId);
    if (game.status === "VOTING") {
      await fillAllMissingVotes(gameId);
    }
    await applyRoundScores(gameId);
  }
}

/** Fill missing votes across all votable prompts (for endGameEarly). */
async function fillAllMissingVotes(gameId: string): Promise<void> {
  const [votablePrompts, activePlayerIds] = await Promise.all([
    getVotablePrompts(gameId),
    getActivePlayerIds(gameId),
  ]);

  for (const prompt of votablePrompts) {
    const existingVoterIds = new Set(prompt.votes.map((v) => v.voterId));
    const missing = activePlayerIds.filter((id) => !existingVoterIds.has(id));
    if (missing.length > 0) {
      await prisma.vote.createMany({
        data: missing.map((voterId) => ({ promptId: prompt.id, voterId })),
        skipDuplicates: true,
      });
    }
  }
}

/** Promote the most recently active human player to host. */
export async function promoteHost(gameId: string): Promise<void> {
  const nextHost = await prisma.player.findFirst({
    where: {
      gameId,
      type: "HUMAN",
      participationStatus: "ACTIVE",
      lastSeen: { gte: new Date(Date.now() - HOST_STALE_MS) },
    },
    orderBy: { lastSeen: "desc" },
    select: { id: true },
  });

  if (nextHost) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        hostPlayerId: nextHost.id,
        hostControlTokenHash: null,
        hostControlLastSeen: null,
        version: { increment: 1 },
      },
    });
  }
}
