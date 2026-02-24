import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateRoomCode } from "@/lib/game-logic";
import { AI_MODELS } from "@/lib/models";

export async function POST(request: Request) {
  const { hostName, aiModelIds, hostSecret } = await request.json();

  if (hostSecret !== process.env.HOST_SECRET) {
    return NextResponse.json(
      { error: "Invalid host password" },
      { status: 403 }
    );
  }

  if (!hostName || typeof hostName !== "string" || hostName.trim().length === 0) {
    return NextResponse.json(
      { error: "Host name is required" },
      { status: 400 }
    );
  }

  const roomCode = await generateUniqueRoomCode();
  if (!roomCode) {
    return NextResponse.json(
      { error: "Failed to generate a unique room code, please try again" },
      { status: 500 }
    );
  }

  const game = await prisma.game.create({
    data: {
      roomCode,
      players: {
        create: [{ name: hostName.trim(), type: "HUMAN" }],
      },
    },
    include: { players: true },
  });

  await prisma.game.update({
    where: { id: game.id },
    data: { hostPlayerId: game.players[0].id },
  });

  if (aiModelIds && Array.isArray(aiModelIds)) {
    const validModels = aiModelIds.filter((id: string) =>
      AI_MODELS.some((m) => m.id === id)
    );

    await prisma.player.createMany({
      data: validModels.map((modelId: string) => {
        const model = AI_MODELS.find((m) => m.id === modelId)!;
        return {
          gameId: game.id,
          name: model.shortName,
          type: "AI" as const,
          modelId,
        };
      }),
    });
  }

  return NextResponse.json({
    roomCode,
    gameId: game.id,
    hostPlayerId: game.players[0].id,
  });
}

async function generateUniqueRoomCode(): Promise<string | null> {
  for (let i = 0; i < 10; i++) {
    const roomCode = generateRoomCode();
    const existing = await prisma.game.findUnique({ where: { roomCode } });
    if (!existing) return roomCode;
  }
  return null;
}
