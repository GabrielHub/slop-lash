import { prisma } from "@/lib/db";
export { getActivePlayerIds } from "@/games/core/active-players";
import { getRandomPrompts } from "@/games/core/prompts";

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
