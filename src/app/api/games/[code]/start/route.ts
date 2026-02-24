import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { startRound, generateAiResponses, MIN_PLAYERS } from "@/lib/game-logic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { playerId } = await request.json();

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

  if (!playerId || playerId !== game.hostPlayerId) {
    return NextResponse.json(
      { error: "Only the host can start the game" },
      { status: 403 }
    );
  }

  if (game.players.length < MIN_PLAYERS) {
    return NextResponse.json(
      { error: `Need at least ${MIN_PLAYERS} players` },
      { status: 400 }
    );
  }

  // Create round and set WRITING (fast DB work)
  await startRound(game.id, 1);

  // Generate AI responses in background (slow AI work)
  after(() => generateAiResponses(game.id));

  return NextResponse.json({ success: true });
}
