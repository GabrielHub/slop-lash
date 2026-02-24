import { prisma } from "@/lib/db";
import { generateWinnerTagline, FORFEIT_TEXT } from "@/lib/ai";
import { accumulateUsage } from "@/lib/game-logic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const isFinal = url.searchParams.get("isFinal") === "true";

  const game = await prisma.game.findUnique({
    where: { roomCode },
    include: {
      players: { orderBy: { score: "desc" as const } },
      rounds: {
        orderBy: { roundNumber: isFinal ? "asc" as const : "desc" as const },
        ...(!isFinal ? { take: 1 } : {}),
        include: {
          prompts: {
            include: {
              responses: {
                include: { player: { select: { id: true, name: true, type: true, modelId: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!game) {
    return new Response(null, { status: 404 });
  }

  const expectedStatus = isFinal ? "FINAL_RESULTS" : "ROUND_RESULTS";
  if (game.status !== expectedStatus) {
    return new Response(null, { status: 204 });
  }

  // Overall leader must be AI (players already sorted by score desc)
  const leader = game.players[0];
  if (!leader || leader.type !== "AI" || !leader.modelId) {
    return new Response(null, { status: 204 });
  }

  const scoreBoard = game.players
    .map((p, i) => `${i + 1}. ${p.name} (${p.type}) — ${p.score} pts`)
    .join("\n");

  const aiJokes = game.rounds
    .flatMap((r) => r.prompts)
    .flatMap((p) =>
      p.responses
        .filter((r) => r.player.id === leader.id && r.text !== FORFEIT_TEXT)
        .map((r) => `Prompt: "${p.text}" → Your answer: "${r.text}"`)
    )
    .join("\n");

  const context = `Scores:\n${scoreBoard}\n\nYour jokes this ${isFinal ? "game" : "round"}:\n${aiJokes || "(none)"}`;

  const gameId = game.id;
  const result = generateWinnerTagline(
    leader.modelId,
    leader.name,
    isFinal,
    context,
    async (usage) => {
      await accumulateUsage(gameId, [usage]);
    },
  );

  return result.toTextStreamResponse();
}
