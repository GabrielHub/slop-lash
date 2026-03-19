import { NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getGameDefinition, getAllGameTypes } from "@/games/registry";
import type { GameType } from "@/games/core";
import { generateUniqueRoomCode } from "@/games/core/room";
import { getModelByModelId, selectUniqueModelsByProvider } from "@/lib/models";
import { sanitize } from "@/lib/sanitize";
import { parseJsonBody } from "@/lib/http";
import { cleanupOldGames } from "@/games/core/cleanup";
import { isPrismaDataTransferQuotaError } from "@/lib/prisma-errors";
import type { TtsMode } from "@/lib/types";
import { VOICE_NAMES } from "@/games/sloplash/voices";
import { createHostControlToken, hashHostControlToken } from "@/lib/host-control";
import { logGameEvent } from "@/games/core/observability";
import { MATCHSLOP_TOTAL_TURNS } from "@/games/matchslop/config/game-config";
import { createInitialModeState } from "@/games/matchslop/game-logic-core";
import { MATCHSLOP_IDENTITIES, type MatchSlopIdentity } from "@/games/matchslop/identities";

type HostParticipation = "PLAYER" | "DISPLAY_ONLY";

function parseMatchSlopIdentity(value: unknown): MatchSlopIdentity | null {
  return typeof value === "string" && MATCHSLOP_IDENTITIES.includes(value as MatchSlopIdentity)
    ? value as MatchSlopIdentity
    : null;
}

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
    personaModelId?: unknown;
    seekerIdentity?: unknown;
    personaIdentity?: unknown;
    hostSecret?: unknown;
    hostParticipation?: unknown;
    timersDisabled?: unknown;
    ttsMode?: unknown;
    ttsVoice?: unknown;
    gameType?: unknown;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    hostName,
    aiModelIds,
    personaModelId,
    seekerIdentity,
    personaIdentity,
    hostSecret,
    hostParticipation,
    timersDisabled,
    ttsMode,
    ttsVoice,
    gameType: rawGameType,
  } = body;

  const secret = process.env.HOST_SECRET;
  if (!secret || hostSecret !== secret) {
    return NextResponse.json(
      { error: "Invalid host password" },
      { status: 403 }
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

  const validGameTypes = getAllGameTypes();
  const gameType: GameType = (
    typeof rawGameType === "string" && validGameTypes.includes(rawGameType as GameType)
  ) ? rawGameType as GameType : "SLOPLASH";
  const def = getGameDefinition(gameType);
  const requestedHostMode = parseHostParticipation(hostParticipation);
  const hostMode: HostParticipation =
    gameType === "MATCHSLOP" ? "DISPLAY_ONLY" : requestedHostMode;
  const isHostPlayer = hostMode === "PLAYER";
  const validPersonaModelId =
    typeof personaModelId === "string" &&
    personaModelId.trim().length > 0 &&
    getModelByModelId(personaModelId) != null
      ? personaModelId
      : null;
  const validSeekerIdentity = parseMatchSlopIdentity(seekerIdentity);
  const validPersonaIdentity = parseMatchSlopIdentity(personaIdentity);

  if (gameType === "MATCHSLOP") {
    if (!validPersonaModelId) {
      return NextResponse.json(
        { error: "Persona model is required for MatchSlop" },
        { status: 400 }
      );
    }
    if (!validSeekerIdentity || !validPersonaIdentity) {
      return NextResponse.json(
        { error: "MatchSlop requires valid seeker and persona identities" },
        { status: 400 }
      );
    }
  }

  if (isHostPlayer && (!hostName || typeof hostName !== "string")) {
    return NextResponse.json(
      { error: "Host name is required" },
      { status: 400 }
    );
  }

  const cleanName =
    typeof hostName === "string"
      ? sanitize(hostName, 20)
      : "";
  if (isHostPlayer && cleanName.length === 0) {
    return NextResponse.json(
      { error: "Host name is required" },
      { status: 400 }
    );
  }

  try {
    const roomCode = await generateUniqueRoomCode();
    if (!roomCode) {
      return NextResponse.json(
        { error: "Failed to generate a unique room code, please try again" },
        { status: 500 }
      );
    }

    const hostControlToken = createHostControlToken();
    const hostRejoinToken = isHostPlayer
      ? randomBytes(12).toString("base64url")
      : null;
    const effectiveTtsMode = def.capabilities.supportsNarrator ? parseTtsMode(ttsMode) : ("OFF" as const);
    const selectedAiModelIds = Array.isArray(aiModelIds)
      ? aiModelIds.filter((id): id is string => typeof id === "string")
      : [];
    const filteredAiModelIds = gameType === "MATCHSLOP" && validPersonaModelId
      ? selectedAiModelIds.filter((id) => id !== validPersonaModelId)
      : selectedAiModelIds;
    const game = await prisma.game.create({
      data: {
        roomCode,
        gameType,
        totalRounds: gameType === "MATCHSLOP" ? MATCHSLOP_TOTAL_TURNS : undefined,
        personaModelId: gameType === "MATCHSLOP" ? validPersonaModelId : null,
        modeState:
          gameType === "MATCHSLOP"
            ? (createInitialModeState(
                validSeekerIdentity!,
                validPersonaIdentity!,
              ) as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        timersDisabled: timersDisabled === true,
        ttsMode: effectiveTtsMode,
        ttsVoice: effectiveTtsMode === "ON" ? parseTtsVoice(ttsVoice) : "RANDOM",
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
        ...(isHostPlayer ? { players: { select: { id: true } } } : {}),
      },
    });

    const createdHostPlayerId = isHostPlayer
      ? (game as { players?: { id: string }[] }).players?.[0]?.id ?? null
      : null;
    if (createdHostPlayerId) {
      await prisma.game.update({
        where: { id: game.id },
        data: { hostPlayerId: createdHostPlayerId },
      });
    }

    if (filteredAiModelIds.length > 0) {
      const maxAiPlayers = def.constants.maxPlayers - (isHostPlayer ? 1 : 0);
      const aiPlayers = selectUniqueModelsByProvider(filteredAiModelIds)
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

    logGameEvent("created", { gameType, gameId: game.id, roomCode }, {
      hostMode,
      aiPlayers: filteredAiModelIds.length,
      personaModelId: validPersonaModelId,
      ttsMode: effectiveTtsMode,
    });

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
