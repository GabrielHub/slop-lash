import { prisma } from "@/lib/db";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { getActivePlayerIds, assignAllPlayerPrompt } from "./game-logic-core";

/** Create a round with a single prompt assigned to all active players. */
export async function startRound(gameId: string, roundNumber: number): Promise<void> {
  const activePlayerIds = await getActivePlayerIds(gameId);
  const assignment = await assignAllPlayerPrompt(gameId, activePlayerIds);

  await prisma.round.create({
    data: {
      gameId,
      roundNumber,
      prompts: {
        create: [
          {
            text: assignment.promptText,
            assignments: {
              create: assignment.playerIds.map((pid) => ({ playerId: pid })),
            },
          },
        ],
      },
    },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: "WRITING",
      currentRound: roundNumber,
      phaseDeadline: null,
      version: { increment: 1 },
    },
  });
}

/** Advance from ROUND_RESULTS to next round or FINAL_RESULTS. */
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
    if (!hasPrismaErrorCode(error, "P2002")) throw error;

    // Race loser: the round was already created by another caller.
    // Return false so the loser does NOT re-trigger AI generation
    // (the winner already kicked it off).
    return false;
  }
}
