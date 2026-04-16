import { prisma } from "@/lib/db";
import type { RoundAdvanceResult } from "./types";

const ROUND_ADVANCE_RETRY_DELAY_MS = 25;
const ROUND_ADVANCE_RETRY_ATTEMPTS = 8;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After losing a P2002 race on round creation, re-read the game to
 * determine which phase the winner moved into.
 */
export async function resolveRaceLostAdvanceResult(
  gameId: string,
  priorRound: number,
  options?: {
    attempts?: number;
    retryDelayMs?: number;
  },
): Promise<RoundAdvanceResult> {
  const attempts = options?.attempts ?? ROUND_ADVANCE_RETRY_ATTEMPTS;
  const retryDelayMs = options?.retryDelayMs ?? ROUND_ADVANCE_RETRY_DELAY_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, currentRound: true },
    });
    if (!game) return null;
    if (game.status === "FINAL_RESULTS") return "FINAL_RESULTS";
    if (game.status === "WRITING" && game.currentRound > priorRound) return "WRITING";
    if (attempt < attempts - 1) {
      await delay(retryDelayMs);
    }
  }

  return null;
}
