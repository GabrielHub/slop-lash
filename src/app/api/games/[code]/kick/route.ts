import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";
import { disconnectPlayer } from "@/games/core/disconnect";
import { logGameEvent } from "@/games/core/observability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
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
    where: { roomCode },
    select: { id: true, gameType: true, status: true, hostPlayerId: true, hostControlTokenHash: true },
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

  if (auth.playerId && auth.playerId === targetPlayerId) {
    return NextResponse.json(
      { error: "Cannot kick yourself" },
      { status: 400 }
    );
  }

  if (game.status === "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Cannot kick after game has ended" },
      { status: 400 }
    );
  }

  const target = await prisma.player.findFirst({
    where: { id: targetPlayerId, gameId: game.id },
    select: { id: true, type: true, participationStatus: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 404 }
    );
  }

  if (target.type === "AI") {
    return NextResponse.json(
      { error: "Cannot kick AI players" },
      { status: 400 }
    );
  }

  const def = getGameDefinition(game.gameType);

  // During lobby: delete the player entirely (any game mode)
  // During active phases for chat-feed games: disconnect instead of deleting
  // SLOPLASH: only allow kick during lobby or between rounds
  if (game.status === "LOBBY" || game.status === "ROUND_RESULTS") {
    await prisma.player.delete({ where: { id: targetPlayerId } });
    await prisma.game.update({
      where: { id: game.id },
      data: {
        ...(targetPlayerId === game.hostPlayerId && { hostPlayerId: null }),
        version: { increment: 1 },
      },
    });
    logGameEvent("kicked", { gameType: game.gameType, gameId: game.id, roomCode }, {
      targetPlayerId,
      action: "deleted",
    });
    return NextResponse.json({ success: true });
  }

  if (def.capabilities.supportsChatFeed) {
    const kicked = await disconnectPlayer(game.id, game.gameType, roomCode, targetPlayerId);
    if (!kicked) {
      return NextResponse.json(
        { error: "Player is already disconnected" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Can only kick during lobby or between rounds" },
    { status: 400 }
  );
}
