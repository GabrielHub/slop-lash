import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ token?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { token } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const player = await prisma.player.findFirst({
    where: { gameId: game.id, rejoinToken: token },
    select: { id: true, name: true, type: true },
  });

  if (!player) {
    return NextResponse.json({ error: "Invalid rejoin token" }, { status: 404 });
  }

  // Update lastSeen on successful rejoin
  await prisma.player.update({
    where: { id: player.id },
    data: { lastSeen: new Date() },
  });

  return NextResponse.json({
    playerId: player.id,
    playerName: player.name,
    playerType: player.type,
  });
}
