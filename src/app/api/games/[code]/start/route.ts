import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startRound } from "@/lib/game-logic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    include: { players: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Game already started" },
      { status: 400 }
    );
  }

  if (game.players.length < 3) {
    return NextResponse.json(
      { error: "Need at least 3 players" },
      { status: 400 }
    );
  }

  await startRound(game.id, 1);

  return NextResponse.json({ success: true });
}
