import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { roundsInclude, modelUsagesInclude } from "@/lib/game-queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();

  const game = await prisma.game.findUnique({
    where: { roomCode },
    include: {
      players: {
        orderBy: { score: "desc" as const },
      },
      rounds: {
        orderBy: { roundNumber: "asc" as const },
        include: roundsInclude,
      },
      modelUsages: modelUsagesInclude,
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Game is still in progress", status: game.status },
      { status: 400 }
    );
  }

  // Final results are immutable — cache aggressively
  return NextResponse.json(game, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
