import { prisma } from "@/lib/db";
import { generateWinnerTagline, FORFEIT_TEXT } from "@/lib/ai";
import { accumulateUsage } from "@/lib/game-logic";

/** Sentinel stored while the first caller is generating the tagline. */
const GENERATING = "__generating__";

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
    select: {
      id: true,
      status: true,
      winnerTagline: true,
      players: {
        orderBy: { score: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          modelId: true,
          score: true,
        },
      },
      rounds: {
        orderBy: { roundNumber: isFinal ? "asc" : "desc" },
        ...(!isFinal ? { take: 1 } : {}),
        select: {
          prompts: {
            select: {
              text: true,
              responses: {
                select: {
                  text: true,
                  player: { select: { id: true, name: true, type: true, modelId: true } },
                },
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

  // Return cached tagline if already generated
  if (game.winnerTagline && game.winnerTagline !== GENERATING) {
    return new Response(game.winnerTagline);
  }

  // Atomically claim generation so only one caller generates
  const claimed = await prisma.game.updateMany({
    where: { id: game.id, winnerTagline: null },
    data: { winnerTagline: GENERATING },
  });

  if (claimed.count === 0) {
    // Another caller is generating — let the client retry on its polling cycle
    return new Response(null, { status: 204 });
  }

  // We claimed it — generate the tagline
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

  try {
    const result = generateWinnerTagline(
      leader.modelId,
      leader.name,
      isFinal,
      context,
      async (usage) => {
        await accumulateUsage(game.id, [usage]);
      },
    );

    const text = await result.text;

    // Store the generated tagline for all other clients
    await prisma.game.update({
      where: { id: game.id },
      data: { winnerTagline: text },
    });

    return new Response(text);
  } catch {
    // Generation failed — reset so another caller can retry
    try {
      await prisma.game.update({
        where: { id: game.id },
        data: { winnerTagline: null },
      });
    } catch (resetErr) {
      console.error("[tagline] Failed to reset GENERATING sentinel:", resetErr);
    }
    return new Response(null, { status: 204 });
  }
}
