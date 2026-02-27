import { prisma } from "@/lib/db";
import { getRandomPrompts } from "@/games/core/prompts";

/** Return IDs of all active (non-spectator, non-disconnected) players — the quorum. */
export async function getActivePlayerIds(gameId: string): Promise<string[]> {
  const players = await prisma.player.findMany({
    where: { gameId, type: { not: "SPECTATOR" }, participationStatus: "ACTIVE" },
    select: { id: true },
  });
  return players.map((p) => p.id);
}

/** Pick a single random prompt for the round. All active players are assigned to it. */
export async function assignAllPlayerPrompt(
  gameId: string,
  activePlayerIds: string[],
): Promise<{ promptText: string; playerIds: string[] }> {
  const usedPrompts = await prisma.prompt.findMany({
    where: { round: { gameId } },
    select: { text: true },
  });
  const exclude = new Set(usedPrompts.map((p) => p.text));

  const [promptText] = getRandomPrompts(1, exclude);

  return {
    promptText: promptText ?? "Make us laugh!",
    playerIds: activePlayerIds,
  };
}
