import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown; hostToken?: unknown; targetPlayerId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const auth = readHostAuth(body);
  const targetPlayerId = typeof body.targetPlayerId === "string" ? body.targetPlayerId : null;
  if ((!auth.playerId && !auth.hostToken) || !targetPlayerId) {
    return NextResponse.json(
      { error: "targetPlayerId and (playerId or hostToken) are required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, status: true, hostPlayerId: true, hostControlTokenHash: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (!(await isAuthorizedHostControl(game, auth))) {
    return NextResponse.json(
      { error: "Only the host can kick players" },
      { status: 403 }
    );
  }

  if (game.status !== "LOBBY" && game.status !== "ROUND_RESULTS") {
    return NextResponse.json(
      { error: "Can only kick during lobby or between rounds" },
      { status: 400 }
    );
  }

  if (auth.playerId && auth.playerId === targetPlayerId) {
    return NextResponse.json(
      { error: "Cannot kick yourself" },
      { status: 400 }
    );
  }

  const target = await prisma.player.findFirst({
    where: { id: targetPlayerId, gameId: game.id },
    select: { id: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 404 }
    );
  }

  await prisma.player.delete({ where: { id: targetPlayerId } });

  await prisma.game.update({
    where: { id: game.id },
    data: {
      ...(targetPlayerId === game.hostPlayerId && { hostPlayerId: null }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json({ success: true });
}
