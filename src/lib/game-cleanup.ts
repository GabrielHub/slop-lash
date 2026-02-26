import { prisma } from "@/lib/db";
import { endGameEarly } from "@/lib/game-logic";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FINAL_GAME_RETENTION_MS = 7 * DAY_MS;
export const INCOMPLETE_GAME_RETENTION_MS = 24 * 60 * 60 * 1000;
export const ABANDONED_ACTIVE_GAME_IDLE_MS = 5 * 60 * 1000;

export type GameCleanupSummary = {
  autoFinalizedAbandonedActive: number;
  deletedFinalOrOld: number;
  deletedIncomplete: number;
  totalDeleted: number;
};

export async function cleanupOldGames(now = new Date()): Promise<GameCleanupSummary> {
  const abandonedActiveCutoff = new Date(now.getTime() - ABANDONED_ACTIVE_GAME_IDLE_MS);
  const finalOrAnyOlderThanWeekCutoff = new Date(now.getTime() - FINAL_GAME_RETENTION_MS);
  const incompleteCutoff = new Date(now.getTime() - INCOMPLETE_GAME_RETENTION_MS);

  const abandonedActiveGames = await prisma.game.findMany({
    where: {
      status: { in: ["WRITING", "VOTING", "ROUND_RESULTS"] },
      players: {
        none: {
          type: "HUMAN",
          lastSeen: { gte: abandonedActiveCutoff },
        },
      },
    },
    select: { id: true },
  });

  let autoFinalizedAbandonedActive = 0;
  for (const game of abandonedActiveGames) {
    await endGameEarly(game.id);
    await applyCompletedGameToLeaderboardAggregate(game.id);
    autoFinalizedAbandonedActive += 1;
  }

  const [deleteOldAll, deleteIncomplete] = await prisma.$transaction([
    prisma.game.deleteMany({
      where: {
        createdAt: { lt: finalOrAnyOlderThanWeekCutoff },
      },
    }),
    prisma.game.deleteMany({
      where: {
        status: { not: "FINAL_RESULTS" },
        createdAt: { lt: incompleteCutoff, gte: finalOrAnyOlderThanWeekCutoff },
      },
    }),
  ]);

  return {
    autoFinalizedAbandonedActive,
    deletedFinalOrOld: deleteOldAll.count,
    deletedIncomplete: deleteIncomplete.count,
    totalDeleted: deleteOldAll.count + deleteIncomplete.count,
  };
}
