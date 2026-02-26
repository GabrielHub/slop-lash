import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { startRound, generateAiResponses, MIN_PLAYERS } from "@/lib/game-logic";
import { parseJsonBody } from "@/lib/http";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerId } = body;
  if (!playerId || typeof playerId !== "string") {
    return NextResponse.json(
      { error: "playerId is required" },
      { status: 400 }
    );
  }

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

  if (playerId !== game.hostPlayerId) {
    return NextResponse.json(
      { error: "Only the host can start the game" },
      { status: 403 }
    );
  }

  const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
  if (activePlayers.length < MIN_PLAYERS) {
    return NextResponse.json(
      { error: `Need at least ${MIN_PLAYERS} players` },
      { status: 400 }
    );
  }

  // Create round and set WRITING (fast DB work)
  let startedRound = false;
  try {
    await startRound(game.id, 1);
    startedRound = true;
  } catch (e) {
    // Duplicate start clicks can race and lose on unique(roundNumber) creation.
    // Treat the loser as success; pollers will observe the state change.
    if (!hasPrismaErrorCode(e, "P2002")) throw e;
  }

  // Generate AI responses in background (slow AI work)
  if (startedRound) {
    after(() => generateAiResponses(game.id));
  }

  return NextResponse.json({ success: true });
}
