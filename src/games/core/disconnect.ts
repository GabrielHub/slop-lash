import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { logGameEvent } from "./observability";
import { runGameStateMaintenance } from "./runtime";
import type { GameType } from "./types";

/** Players are auto-disconnected after 120 seconds of inactivity. */
const INACTIVITY_THRESHOLD_MS = 120_000;

/**
 * Check for inactive players and mark them as DISCONNECTED.
 *
 * Applies to all game modes so stale players can reclaim their seat by name
 * or auto-heal with their rejoin token when they return.
 *
 * AI_CHAT_SHOWDOWN also triggers quorum re-checks because phase progression is
 * action-gated; Slop-Lash remains deadline-based.
 *
 * Returns the IDs of newly disconnected players (empty if none).
 */
export async function checkAndDisconnectInactivePlayers(
  gameId: string,
  gameType: GameType,
  roomCode: string,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS);

  const stalePlayers = await prisma.player.findMany({
    where: {
      gameId,
      participationStatus: "ACTIVE",
      type: "HUMAN",
      lastSeen: { lt: cutoff },
    },
    select: { id: true, name: true },
  });

  if (stalePlayers.length === 0) return [];

  const staleIds = stalePlayers.map((p) => p.id);

  await prisma.player.updateMany({
    where: { id: { in: staleIds } },
    data: { participationStatus: "DISCONNECTED" },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: { version: { increment: 1 } },
  });

  for (const p of stalePlayers) {
    logGameEvent("player-disconnected", { gameType, gameId, roomCode }, {
      playerId: p.id,
      playerName: p.name,
      reason: "inactivity",
    });
  }

  await recheckQuorumAfterDisconnect(gameId, gameType);

  return staleIds;
}

/**
 * Disconnect a specific player (host kick).
 *
 * Sets participationStatus to DISCONNECTED, bumps game version,
 * and triggers quorum re-check.
 */
export async function disconnectPlayer(
  gameId: string,
  gameType: GameType,
  roomCode: string,
  targetPlayerId: string,
): Promise<boolean> {
  const result = await prisma.player.updateMany({
    where: {
      id: targetPlayerId,
      gameId,
      participationStatus: "ACTIVE",
      type: { not: "AI" }, // AI players cannot be kicked
    },
    data: { participationStatus: "DISCONNECTED" },
  });

  if (result.count === 0) return false;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { hostPlayerId: true },
  });

  const updates: Record<string, unknown> = { version: { increment: 1 } };
  if (game?.hostPlayerId === targetPlayerId) {
    updates.hostPlayerId = null;
    updates.hostControlTokenHash = null;
    updates.hostControlLastSeen = null;
  }

  await prisma.game.update({
    where: { id: gameId },
    data: updates,
  });

  logGameEvent("player-disconnected", { gameType, gameId, roomCode }, {
    playerId: targetPlayerId,
    reason: "kicked",
  });

  if (game?.hostPlayerId === targetPlayerId) {
    const def = getGameDefinition(gameType);
    await def.handlers.promoteHost(gameId);
  }

  await recheckQuorumAfterDisconnect(gameId, gameType);

  return true;
}

/** Re-check quorum after disconnect — auto-advance if remaining players have all acted. */
async function recheckQuorumAfterDisconnect(
  gameId: string,
  gameType: GameType,
): Promise<void> {
  await runGameStateMaintenance(gameId, gameType);
}

/**
 * Restore a player to ACTIVE status on rejoin.
 * Bumps game version so pollers see the roster change.
 */
export async function restorePlayer(
  gameId: string,
  gameType: GameType,
  roomCode: string,
  playerId: string,
): Promise<boolean> {
  const result = await prisma.player.updateMany({
    where: {
      id: playerId,
      gameId,
      participationStatus: "DISCONNECTED",
    },
    data: {
      participationStatus: "ACTIVE",
      lastSeen: new Date(),
    },
  });

  if (result.count === 0) return false;

  await prisma.game.update({
    where: { id: gameId },
    data: { version: { increment: 1 } },
  });

  logGameEvent("player-reconnected", { gameType, gameId, roomCode }, {
    playerId,
  });

  return true;
}
