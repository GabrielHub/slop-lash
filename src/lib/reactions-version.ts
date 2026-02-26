import { prisma } from "@/lib/db";
import { isPrismaMissingColumnError } from "@/lib/prisma-errors";

export async function bumpReactionsVersion(gameId: string): Promise<void> {
  try {
    await prisma.game.update({
      where: { id: gameId },
      data: { reactionsVersion: { increment: 1 } },
    });
  } catch (error) {
    if (isPrismaMissingColumnError(error, "reactionsVersion")) {
      return;
    }
    throw error;
  }
}

