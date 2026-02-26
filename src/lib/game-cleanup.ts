import { prisma } from "@/lib/db";
import { endGameEarly } from "@/lib/game-logic";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FINAL_GAME_RETENTION_MS = 7 * DAY_MS;
export const INCOMPLETE_GAME_RETENTION_MS = DAY_MS;
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
  const deleteOldAllWhere = {
    createdAt: { lt: finalOrAnyOlderThanWeekCutoff },
  };
  const deleteIncompleteWhere = {
    status: { not: "FINAL_RESULTS" as const },
    createdAt: { lt: incompleteCutoff, gte: finalOrAnyOlderThanWeekCutoff },
  };

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

  const [oldGameIds, incompleteGameIds] = await Promise.all([
    prisma.game.findMany({
      where: deleteOldAllWhere,
      select: { id: true },
    }),
    prisma.game.findMany({
      where: deleteIncompleteWhere,
      select: { id: true },
    }),
  ]);
  const processedGameIds = [...oldGameIds, ...incompleteGameIds].map((g) => g.id);

  const [, deleteOldAll, deleteIncomplete] = await prisma.$transaction([
    prisma.leaderboardProcessedGame.deleteMany({
      where: processedGameIds.length > 0
        ? { gameId: { in: processedGameIds } }
        : { gameId: "__none__" },
    }),
    prisma.game.deleteMany({
      where: deleteOldAllWhere,
    }),
    prisma.game.deleteMany({
      where: deleteIncompleteWhere,
    }),
  ]);

  return {
    autoFinalizedAbandonedActive,
    deletedFinalOrOld: deleteOldAll.count,
    deletedIncomplete: deleteIncomplete.count,
    totalDeleted: deleteOldAll.count + deleteIncomplete.count,
  };
}
