import { prisma } from "@/lib/db";

export function readPlayerToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function findAuthenticatedPlayer(gameId: string, playerToken: string | null) {
  if (!playerToken) return null;

  return prisma.player.findFirst({
    where: {
      gameId,
      rejoinToken: playerToken,
    },
    select: {
      id: true,
      type: true,
      participationStatus: true,
    },
  });
}
