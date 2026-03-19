import { prisma } from "@/lib/db";
import { isPrismaMissingColumnError } from "@/lib/prisma-errors";
import { publishGameStateEvent } from "@/lib/realtime-events";

export async function bumpReactionsVersion(gameId: string): Promise<void> {
  try {
    await prisma.game.update({
      where: { id: gameId },
      data: { reactionsVersion: { increment: 1 } },
    });
    await publishGameStateEvent(gameId);
  } catch (error) {
    if (isPrismaMissingColumnError(error, "reactionsVersion")) {
      return;
    }
    throw error;
  }
}
