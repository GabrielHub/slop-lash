import type { GameStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { checkAndDisconnectInactivePlayers } from "@/games/core/disconnect";
import { matchesHostControlToken } from "@/lib/host-control";
import type { GameType } from "@/games/core/types";

const EXPENSIVE_STREAM_MAINTENANCE_INTERVAL_MS = 30_000;
const lastExpensiveMaintenanceAt = new Map<string, number>();

type StreamMaintenanceMeta = {
  id: string;
  gameType: GameType;
  status: GameStatus;
  hostPlayerId: string | null;
  hostControlTokenHash?: string | null;
  hostControlLastSeen: Date | null;
};

function shouldRunExpensiveMaintenance(gameId: string, now: number): boolean {
  const lastRun = lastExpensiveMaintenanceAt.get(gameId) ?? 0;
  if (now - lastRun < EXPENSIVE_STREAM_MAINTENANCE_INTERVAL_MS) {
    return false;
  }

  lastExpensiveMaintenanceAt.set(gameId, now);
  return true;
}

export async function touchStreamHeartbeat(params: {
  meta: StreamMaintenanceMeta;
  currentPlayerId: string | null;
  roomCode: string;
  minTouchIntervalMs: number;
  hostToken?: string | null;
}): Promise<boolean> {
  const { meta, currentPlayerId, roomCode, minTouchIntervalMs, hostToken } = params;
  if (meta.status === "FINAL_RESULTS") {
    lastExpensiveMaintenanceAt.delete(meta.id);
    return false;
  }

  const now = Date.now();
  const cutoff = new Date(now - minTouchIntervalMs);

  const isHostTouch =
    !!hostToken &&
    !!meta.hostControlTokenHash &&
    matchesHostControlToken(meta.hostControlTokenHash, hostToken);

  const touches: Promise<unknown>[] = [];
  if (currentPlayerId) {
    touches.push(
      prisma.player.updateMany({
        where: { id: currentPlayerId, gameId: meta.id, lastSeen: { lt: cutoff } },
        data: { lastSeen: new Date() },
      }),
    );
  }
  if (isHostTouch) {
    touches.push(
      prisma.game.updateMany({
        where: { id: meta.id, hostControlLastSeen: { lt: cutoff } },
        data: { hostControlLastSeen: new Date() },
      }),
    );
  }
  if (touches.length > 0) {
    await Promise.all(touches);
  }

  if (!currentPlayerId || !shouldRunExpensiveMaintenance(meta.id, now)) {
    return false;
  }

  const freshGame = await prisma.game.findUnique({
    where: { id: meta.id },
    select: { hostPlayerId: true, hostControlLastSeen: true },
  });

  let stateChanged = false;
  const def = getGameDefinition(meta.gameType);
  const hostControlStale =
    !!freshGame?.hostControlLastSeen &&
    now - freshGame.hostControlLastSeen.getTime() > def.constants.hostStaleMs;
  const currentHostPlayerId = freshGame?.hostPlayerId ?? meta.hostPlayerId;

  if (!currentHostPlayerId && hostControlStale) {
    await def.handlers.promoteHost(meta.id);
    stateChanged = true;
  } else if (currentHostPlayerId && currentPlayerId !== currentHostPlayerId) {
    const host = await prisma.player.findUnique({
      where: { id: currentHostPlayerId },
      select: { gameId: true, lastSeen: true },
    });
    if (host?.gameId === meta.id && now - host.lastSeen.getTime() > def.constants.hostStaleMs) {
      await def.handlers.promoteHost(meta.id);
      stateChanged = true;
    }
  }

  if (meta.status === "WRITING" || meta.status === "VOTING") {
    const disconnectedIds = await checkAndDisconnectInactivePlayers(meta.id, meta.gameType, roomCode);
    if (disconnectedIds.length > 0) {
      stateChanged = true;
    }
  }

  return stateChanged;
}
