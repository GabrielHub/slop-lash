import { prisma } from "@/lib/db";

export async function getActivePlayerIds(gameId: string): Promise<string[]> {
  const players = await prisma.player.findMany({
    where: {
      gameId,
      type: { not: "SPECTATOR" },
      participationStatus: "ACTIVE",
    },
    select: { id: true },
  });

  return players.map((player) => player.id);
}
