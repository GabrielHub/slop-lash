import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { advanceGame } from "@/lib/game-logic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "ROUND_RESULTS") {
    return NextResponse.json(
      { error: "Can only advance from round results" },
      { status: 400 }
    );
  }

  await advanceGame(game.id);

  return NextResponse.json({ success: true });
}
