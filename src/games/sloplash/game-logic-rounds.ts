import { prisma } from "@/lib/db";
import { WRITING_DURATION_SECONDS } from "./game-constants";
import { assignPrompts } from "./game-logic-core";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { resolveWinnerTaglinePlaceholder } from "./winner-tagline";
import { resolveRaceLostAdvanceResult, type RoundAdvanceResult } from "@/games/core";

/**
 * Create the round and set the game to WRITING. Fast DB-only operation.
 * AI response generation is handled separately by generateAiResponses().
 */
export async function startRound(gameId: string, roundNumber: number): Promise<void> {
  const [game, players, usedPrompts] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId }, select: { timersDisabled: true } }),
    prisma.player.findMany({ where: { gameId, type: { not: "SPECTATOR" } }, select: { id: true } }),
    prisma.prompt.findMany({
      where: { round: { gameId } },
      select: { text: true },
    }),
  ]);
  const playerIds = players.map((p) => p.id);
  const promptCount = playerIds.length;
  const exclude = new Set(usedPrompts.map((p) => p.text));

  const assignments = assignPrompts(playerIds, promptCount, exclude);

  const deadline = game?.timersDisabled
    ? null
    : new Date(Date.now() + WRITING_DURATION_SECONDS * 1000);

  await prisma.round.create({
    data: {
      gameId,
      roundNumber,
      prompts: {
        create: assignments.map((a) => ({
          text: a.promptText,
          assignments: {
            create: a.playerIds.map((pid) => ({ playerId: pid })),
          },
        })),
      },
    },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: { status: "WRITING", currentRound: roundNumber, phaseDeadline: deadline, version: { increment: 1 } },
  });
}

/**
 * Advance from ROUND_RESULTS to next round or FINAL_RESULTS.
 * Returns the stable phase reached after attempting the round-results advance.
 */
export async function advanceGame(gameId: string): Promise<RoundAdvanceResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      status: true,
      currentRound: true,
      totalRounds: true,
      players: {
        take: 1,
        orderBy: [{ score: "desc" }, { id: "asc" }],
        select: { id: true, score: true, type: true, modelId: true },
      },
    },
  });

  if (!game || game.status !== "ROUND_RESULTS") return null;

  if (game.currentRound >= game.totalRounds) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: "FINAL_RESULTS",
        winnerTagline: resolveWinnerTaglinePlaceholder(game.players),
        version: { increment: 1 },
      },
    });
    return "FINAL_RESULTS";
  }

  try {
    await startRound(gameId, game.currentRound + 1);
    return "WRITING";
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) {
      throw error;
    }

    return resolveRaceLostAdvanceResult(gameId, game.currentRound);
  }
}
