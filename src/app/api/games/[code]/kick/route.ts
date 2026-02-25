import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown; targetPlayerId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerId, targetPlayerId } = body;

  if (!playerId || typeof playerId !== "string" || !targetPlayerId || typeof targetPlayerId !== "string") {
    return NextResponse.json(
      { error: "playerId and targetPlayerId are required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Host-only action
  if (playerId !== game.hostPlayerId) {
    return NextResponse.json(
      { error: "Only the host can kick players" },
      { status: 403 }
    );
  }

  // Only during LOBBY or ROUND_RESULTS
  if (game.status !== "LOBBY" && game.status !== "ROUND_RESULTS") {
    return NextResponse.json(
      { error: "Can only kick during lobby or between rounds" },
      { status: 400 }
    );
  }

  // Cannot kick yourself
  if (playerId === targetPlayerId) {
    return NextResponse.json(
      { error: "Cannot kick yourself" },
      { status: 400 }
    );
  }

  // Verify target exists in this game
  const target = await prisma.player.findFirst({
    where: { id: targetPlayerId, gameId: game.id },
  });

  if (!target) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 404 }
    );
  }

  // Delete the player (cascade removes responses/votes)
  await prisma.player.delete({ where: { id: targetPlayerId } });

  // Bump version so pollers pick up the change
  await prisma.game.update({
    where: { id: game.id },
    data: { version: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}
