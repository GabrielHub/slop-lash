import { prisma } from "@/lib/db";
import { WRITING_DURATION_SECONDS } from "./game-constants";
import { assignPrompts } from "./game-logic-core";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";

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
 * Returns true if a new round was started (caller should trigger AI generation).
 */
export async function advanceGame(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { currentRound: true, totalRounds: true },
  });

  if (!game) return false;

  if (game.currentRound >= game.totalRounds) {
    await prisma.game.update({
      where: { id: gameId },
      data: { status: "FINAL_RESULTS", winnerTagline: null, version: { increment: 1 } },
    });
    return false;
  }

  try {
    await startRound(gameId, game.currentRound + 1);
    return true;
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) {
      throw error;
    }

    // Race loser: the round was already created by another caller.
    // Return false so the loser does NOT re-trigger AI generation
    // (the winner already kicked it off).
    return false;
  }
}
