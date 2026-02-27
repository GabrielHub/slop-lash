import { prisma } from "@/lib/db";
import type { GameType } from "./types";

/** Look up the gameType for a room code. Returns null if the game is not found. */
export async function resolveGameType(
  roomCode: string,
): Promise<GameType | null> {
  const game = await prisma.game.findUnique({
    where: { roomCode: roomCode.toUpperCase() },
    select: { gameType: true },
  });
  return (game?.gameType as GameType) ?? null;
}
