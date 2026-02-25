import { NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { generateUniqueRoomCode, MAX_PLAYERS } from "@/lib/game-logic";
import { selectUniqueModelsByProvider } from "@/lib/models";
import { sanitize } from "@/lib/sanitize";
import { parseJsonBody } from "@/lib/http";
import type { TtsMode } from "@/lib/types";
import { VOICE_NAMES } from "@/lib/voices";

const VALID_TTS_MODES: TtsMode[] = ["OFF", "AI_VOICE", "BROWSER_VOICE"];

export async function POST(request: Request) {
  const body = await parseJsonBody<{
    hostName?: unknown;
    aiModelIds?: unknown;
    hostSecret?: unknown;
    timersDisabled?: unknown;
    ttsMode?: unknown;
    ttsVoice?: unknown;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { hostName, aiModelIds, hostSecret, timersDisabled, ttsMode, ttsVoice } = body;

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

  const hostRejoinToken = randomBytes(12).toString("base64url");
  const game = await prisma.game.create({
    data: {
      roomCode,
      timersDisabled: timersDisabled === true,
      ttsMode:
        typeof ttsMode === "string" && VALID_TTS_MODES.includes(ttsMode as TtsMode)
          ? (ttsMode as TtsMode)
          : "OFF",
      ttsVoice:
        typeof ttsVoice === "string" && (ttsVoice === "RANDOM" || VOICE_NAMES.includes(ttsVoice))
          ? ttsVoice
          : "RANDOM",
      players: {
        create: [{ name: cleanName, type: "HUMAN", rejoinToken: hostRejoinToken }],
      },
    },
    include: { players: true },
  });

  await prisma.game.update({
    where: { id: game.id },
    data: { hostPlayerId: game.players[0].id },
  });

  if (Array.isArray(aiModelIds)) {
    const aiPlayers = selectUniqueModelsByProvider(
      aiModelIds
      .filter((id): id is string => typeof id === "string")
    )
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
    rejoinToken: hostRejoinToken,
  });
}
