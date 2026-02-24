import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { generateUniqueRoomCode, MAX_PLAYERS } from "@/lib/game-logic";
import { AI_MODELS } from "@/lib/models";
import { sanitize } from "@/lib/sanitize";
import type { TtsMode, TtsVoice } from "@/lib/types";

const VALID_TTS_MODES: TtsMode[] = ["OFF", "AI_VOICE", "BROWSER_VOICE"];
const VALID_TTS_VOICES: TtsVoice[] = ["MALE", "FEMALE"];

export async function POST(request: Request) {
  const { hostName, aiModelIds, hostSecret, timersDisabled, ttsMode, ttsVoice } = await request.json();

  const secret = process.env.HOST_SECRET;
  if (!secret || hostSecret !== secret) {
    return NextResponse.json(
      { error: "Invalid host password" },
      { status: 403 }
    );
  }

  if (!hostName || typeof hostName !== "string") {
    return NextResponse.json(
      { error: "Host name is required" },
      { status: 400 }
    );
  }

  const cleanName = sanitize(hostName, 20);
  if (cleanName.length === 0) {
    return NextResponse.json(
      { error: "Host name is required" },
      { status: 400 }
    );
  }

  // Clean up stale games older than 24 hours (non-blocking)
  after(async () => {
    await prisma.game.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  });

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
      timersDisabled: timersDisabled === true,
      ttsMode: VALID_TTS_MODES.includes(ttsMode) ? ttsMode : "OFF",
      ttsVoice: VALID_TTS_VOICES.includes(ttsVoice) ? ttsVoice : "MALE",
      players: {
        create: [{ name: cleanName, type: "HUMAN" }],
      },
    },
    include: { players: true },
  });

  await prisma.game.update({
    where: { id: game.id },
    data: { hostPlayerId: game.players[0].id },
  });

  if (Array.isArray(aiModelIds)) {
    const aiPlayers = aiModelIds
      .map((id: string) => AI_MODELS.find((m) => m.id === id))
      .filter((m) => m !== undefined)
      .slice(0, MAX_PLAYERS - 1)
      .map((model) => ({
        gameId: game.id,
        name: model.shortName,
        type: "AI" as const,
        modelId: model.id,
      }));

    if (aiPlayers.length > 0) {
      await prisma.player.createMany({ data: aiPlayers });
    }
  }

  return NextResponse.json({
    roomCode,
    gameId: game.id,
    hostPlayerId: game.players[0].id,
  });
}
