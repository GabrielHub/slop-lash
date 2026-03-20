import { prisma } from "@/lib/db";
import { getAllGameTypes, getGameDefinition } from "@/games/registry";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import type { GameType } from "./types";
import type { CleanupBreakdown } from "./observability";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const FINAL_GAME_RETENTION_MS = 7 * DAY_MS;
export const INCOMPLETE_GAME_RETENTION_MS = DAY_MS;
export const ABANDONED_ACTIVE_GAME_IDLE_MS = 5 * 60 * 1000;
export const ABANDONED_LOBBY_IDLE_MS = 2 * HOUR_MS;
/** Grace period before cron deletes completed transient (non-retained) games. */
export const TRANSIENT_COMPLETED_GAME_RETENTION_MS = HOUR_MS;

const TRANSIENT_GAME_TYPES = getAllGameTypes().filter(
  (gameType) => !getGameDefinition(gameType).capabilities.retainsCompletedData,
);

export type GameCleanupSummary = {
  autoFinalizedAbandonedActive: number;
  deletedAbandonedLobby: number;
  deletedTransientCompleted: number;
  deletedFinalOrOld: number;
  deletedIncomplete: number;
  totalDeleted: number;
  /** Per-gameType count of abandoned active games that were auto-finalized. */
  abandonedByGameType: CleanupBreakdown;
};

/**
 * Delete a completed transient (non-retained) game and all cascaded data.
 * Safe to call for any game — returns false if the game retains data or isn't in FINAL_RESULTS.
 */
export async function deleteTransientGameData(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { gameType: true, status: true },
  });
  if (!game || game.status !== "FINAL_RESULTS") return false;

  const def = getGameDefinition(game.gameType as GameType);
  if (def.capabilities.retainsCompletedData) return false;

  await prisma.game.delete({ where: { id: gameId } });
  return true;
}

export async function cleanupOldGames(now = new Date()): Promise<GameCleanupSummary> {
  const abandonedActiveCutoff = new Date(now.getTime() - ABANDONED_ACTIVE_GAME_IDLE_MS);
  const abandonedLobbyCutoff = new Date(now.getTime() - ABANDONED_LOBBY_IDLE_MS);
  const finalOrAnyOlderThanWeekCutoff = new Date(now.getTime() - FINAL_GAME_RETENTION_MS);
  const incompleteCutoff = new Date(now.getTime() - INCOMPLETE_GAME_RETENTION_MS);
  const transientCompletedCutoff = new Date(now.getTime() - TRANSIENT_COMPLETED_GAME_RETENTION_MS);
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
    select: { id: true, gameType: true },
  });

  let autoFinalizedAbandonedActive = 0;
  const abandonedByGameType: CleanupBreakdown = {};
  for (const game of abandonedActiveGames) {
    const def = getGameDefinition(game.gameType as GameType);
    await def.handlers.endGameEarly(game.id);
    if (game.gameType === "SLOPLASH") {
      await applyCompletedGameToLeaderboardAggregate(game.id);
    }
    autoFinalizedAbandonedActive += 1;
    abandonedByGameType[game.gameType] = (abandonedByGameType[game.gameType] ?? 0) + 1;
  }

  // Delete completed transient games past grace period (no leaderboard data to clean up).
  const transientCompletedWhere = {
    gameType: { in: TRANSIENT_GAME_TYPES },
    status: "FINAL_RESULTS" as const,
    createdAt: { lt: transientCompletedCutoff },
  };
  const deleteTransientCompleted = await prisma.game.deleteMany({
    where: transientCompletedWhere,
  });

  const deleteAbandonedLobby = await prisma.game.deleteMany({
    where: {
      status: "LOBBY",
      createdAt: { lt: abandonedLobbyCutoff },
      OR: [
        { hostControlLastSeen: null },
        { hostControlLastSeen: { lt: abandonedLobbyCutoff } },
      ],
      players: {
        none: {
          type: "HUMAN",
          participationStatus: "ACTIVE",
          lastSeen: { gte: abandonedLobbyCutoff },
        },
      },
    },
  });

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
    deletedAbandonedLobby: deleteAbandonedLobby.count,
    deletedTransientCompleted: deleteTransientCompleted.count,
    deletedFinalOrOld: deleteOldAll.count,
    deletedIncomplete: deleteIncomplete.count,
    totalDeleted:
      deleteAbandonedLobby.count +
      deleteTransientCompleted.count +
      deleteOldAll.count +
      deleteIncomplete.count,
    abandonedByGameType,
  };
}
