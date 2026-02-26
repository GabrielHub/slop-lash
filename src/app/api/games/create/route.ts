import { NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { generateUniqueRoomCode, MAX_PLAYERS } from "@/lib/game-logic";
import { selectUniqueModelsByProvider } from "@/lib/models";
import { sanitize } from "@/lib/sanitize";
import { parseJsonBody } from "@/lib/http";
import { cleanupOldGames } from "@/lib/game-cleanup";
import { isPrismaDataTransferQuotaError } from "@/lib/prisma-errors";
import type { TtsMode } from "@/lib/types";
import { VOICE_NAMES } from "@/lib/voices";
import { createHostControlToken, hashHostControlToken } from "@/lib/host-control";

type HostParticipation = "PLAYER" | "DISPLAY_ONLY";

function parseTtsMode(value: unknown): TtsMode {
  if (value === "OFF" || value === "ON") {
    return value;
  }
  return "OFF";
}

function parseTtsVoice(value: unknown): string {
  if (typeof value === "string" && (value === "RANDOM" || VOICE_NAMES.includes(value))) {
    return value;
  }
  return "RANDOM";
}

function parseHostParticipation(value: unknown): HostParticipation {
  if (value === "DISPLAY_ONLY") return "DISPLAY_ONLY";
  return "PLAYER";
}

export async function POST(request: Request) {
  const body = await parseJsonBody<{
    hostName?: unknown;
    aiModelIds?: unknown;
    hostSecret?: unknown;
    hostParticipation?: unknown;
    timersDisabled?: unknown;
    ttsMode?: unknown;
    ttsVoice?: unknown;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    hostName,
    aiModelIds,
    hostSecret,
    hostParticipation,
    timersDisabled,
    ttsMode,
    ttsVoice,
  } = body;

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

  after(async () => {
    try {
      await cleanupOldGames();
    } catch (error) {
      if (!isPrismaDataTransferQuotaError(error)) {
        throw error;
      }
    }
  });

  try {
    const roomCode = await generateUniqueRoomCode();
    if (!roomCode) {
      return NextResponse.json(
        { error: "Failed to generate a unique room code, please try again" },
        { status: 500 }
      );
    }

    const hostControlToken = createHostControlToken();
    const hostMode = parseHostParticipation(hostParticipation);
    const isHostPlayer = hostMode === "PLAYER";
    const hostRejoinToken = isHostPlayer
      ? randomBytes(12).toString("base64url")
      : null;
    const game = await prisma.game.create({
      data: {
        roomCode,
        timersDisabled: timersDisabled === true,
        ttsMode: parseTtsMode(ttsMode),
        ttsVoice: parseTtsVoice(ttsVoice),
        hostControlTokenHash: hashHostControlToken(hostControlToken),
        hostControlLastSeen: new Date(),
        ...(isHostPlayer
          ? {
              players: {
                create: [{ name: cleanName, type: "HUMAN" as const, rejoinToken: hostRejoinToken }],
              },
            }
          : {}),
      },
      select: {
        id: true,
        players: { select: { id: true } },
      },
    });

    const createdHostPlayerId = game.players[0]?.id ?? null;
    if (createdHostPlayerId) {
      await prisma.game.update({
        where: { id: game.id },
        data: { hostPlayerId: createdHostPlayerId },
      });
    }

    if (Array.isArray(aiModelIds)) {
      const validIds = aiModelIds.filter((id): id is string => typeof id === "string");
      const maxAiPlayers = MAX_PLAYERS - (isHostPlayer ? 1 : 0);
      const aiPlayers = selectUniqueModelsByProvider(validIds)
        .slice(0, maxAiPlayers)
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
      hostPlayerId: createdHostPlayerId,
      hostPlayerType: isHostPlayer ? "HUMAN" : null,
      hostControlToken,
      rejoinToken: hostRejoinToken,
    });
  } catch (error) {
    if (isPrismaDataTransferQuotaError(error)) {
      return NextResponse.json(
        {
          error:
            "Database is temporarily unavailable (Neon data transfer quota exceeded). Try again later or use /dev/ui for local UI iteration.",
        },
        { status: 503 }
      );
    }
    throw error;
  }
}
