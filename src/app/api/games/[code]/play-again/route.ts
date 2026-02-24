import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateUniqueRoomCode } from "@/lib/game-logic";

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

  if (game.status !== "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Can only play again from final results" },
      { status: 400 }
    );
  }

  if (playerId !== game.hostPlayerId) {
    return NextResponse.json(
      { error: "Only the host can start a new game" },
      { status: 403 }
    );
  }

  // Idempotent: if already created, return the existing new game code
  if (game.nextGameCode) {
    const nextGame = await prisma.game.findUnique({
      where: { roomCode: game.nextGameCode },
    });
    if (nextGame) {
      return NextResponse.json({
        roomCode: game.nextGameCode,
        hostPlayerId: nextGame.hostPlayerId,
      });
    }
  }

  const newRoomCode = await generateUniqueRoomCode();
  if (!newRoomCode) {
    return NextResponse.json(
      { error: "Failed to generate room code" },
      { status: 500 }
    );
  }

  // Find host player to carry over name
  const hostPlayer = game.players.find((p) => p.id === game.hostPlayerId);
  if (!hostPlayer) {
    return NextResponse.json(
      { error: "Host player not found" },
      { status: 500 }
    );
  }

  // Create new game with same AI players + host
  const aiPlayers = game.players.filter((p) => p.type === "AI");

  const newGame = await prisma.game.create({
    data: {
      roomCode: newRoomCode,
      timersDisabled: game.timersDisabled,
      ttsMode: game.ttsMode,
      ttsVoice: game.ttsVoice,
      players: {
        create: [
          { name: hostPlayer.name, type: "HUMAN" },
          ...aiPlayers.map((ai) => ({
            name: ai.name,
            type: "AI" as const,
            modelId: ai.modelId,
          })),
        ],
      },
    },
    include: { players: true },
  });

  const newHost = newGame.players.find((p) => p.type === "HUMAN");
  if (!newHost) {
    return NextResponse.json(
      { error: "Failed to set up new game" },
      { status: 500 }
    );
  }

  // Set host on new game and link old game to new game in parallel
  await Promise.all([
    prisma.game.update({
      where: { id: newGame.id },
      data: { hostPlayerId: newHost.id },
    }),
    prisma.game.update({
      where: { id: game.id },
      data: { nextGameCode: newRoomCode },
    }),
  ]);

  return NextResponse.json({
    roomCode: newRoomCode,
    hostPlayerId: newHost.id,
  });
}
