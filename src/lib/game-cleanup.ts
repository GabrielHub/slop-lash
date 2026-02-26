import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FINAL_GAME_RETENTION_MS = 7 * DAY_MS;
export const INCOMPLETE_GAME_RETENTION_MS = 24 * 60 * 60 * 1000;

export type GameCleanupSummary = {
  deletedFinalOrOld: number;
  deletedIncomplete: number;
  totalDeleted: number;
};

export async function cleanupOldGames(now = new Date()): Promise<GameCleanupSummary> {
  const finalOrAnyOlderThanWeekCutoff = new Date(now.getTime() - FINAL_GAME_RETENTION_MS);
  const incompleteCutoff = new Date(now.getTime() - INCOMPLETE_GAME_RETENTION_MS);

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
    deletedFinalOrOld: deleteOldAll.count,
    deletedIncomplete: deleteIncomplete.count,
    totalDeleted: deleteOldAll.count + deleteIncomplete.count,
  };
}

