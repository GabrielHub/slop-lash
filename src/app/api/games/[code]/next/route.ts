import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { advanceGame, forceAdvancePhase, HOST_STALE_MS } from "@/lib/game-logic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { playerId } = await request.json();

  if (!playerId) {
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

  const isHost = playerId === game.hostPlayerId;

  if (game.status === "ROUND_RESULTS") {
    // Host can always advance; non-host can advance if host is stale
    if (!isHost) {
      const host = game.players.find((p) => p.id === game.hostPlayerId);
      if (host && Date.now() - new Date(host.lastSeen).getTime() <= HOST_STALE_MS) {
        return NextResponse.json(
          { error: "Only the host can advance" },
          { status: 403 }
        );
      }
    }
    await advanceGame(game.id);
    return NextResponse.json({ success: true });
  }

  if (game.status === "WRITING" || game.status === "VOTING") {
    if (!isHost) {
      return NextResponse.json(
        { error: "Only the host can skip the timer" },
        { status: 403 }
      );
    }
    await prisma.game.update({
      where: { id: game.id },
      data: { phaseDeadline: null },
    });
    await forceAdvancePhase(game.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Cannot advance from current phase" },
    { status: 400 }
  );
}
