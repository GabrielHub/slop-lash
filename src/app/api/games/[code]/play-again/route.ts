import { NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { generateUniqueRoomCode } from "@/games/core/room";
import { deleteTransientGameData } from "@/games/core/cleanup";
import { parseJsonBody } from "@/lib/http";
import { selectUniqueModelsByProvider } from "@/lib/models";
import { logGameEvent } from "@/games/core/observability";

const PLAY_AGAIN_ALREADY_CREATED = "PLAY_AGAIN_ALREADY_CREATED";

async function buildExistingPlayAgainResponse(nextGameCode: string) {
  const nextGame = await prisma.game.findUnique({
    where: { roomCode: nextGameCode },
    select: {
      roomCode: true,
      hostPlayerId: true,
      players: {
        select: { id: true, type: true, rejoinToken: true },
      },
    },
  });
  if (!nextGame) return null;

  const hostPlayer =
    nextGame.players.find((p) => p.id === nextGame.hostPlayerId) ??
    nextGame.players.find((p) => p.type === "HUMAN");

  if (!hostPlayer?.rejoinToken) {
    return null;
  }

  return {
    roomCode: nextGame.roomCode,
    hostPlayerId: nextGame.hostPlayerId ?? hostPlayer.id,
    rejoinToken: hostPlayer.rejoinToken,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerId } = body;

  if (!playerId || typeof playerId !== "string") {
    return NextResponse.json(
      { error: "playerId is required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: {
      id: true,
      gameType: true,
      status: true,
      hostPlayerId: true,
      nextGameCode: true,
      timersDisabled: true,
      ttsMode: true,
      ttsVoice: true,
      players: {
        select: {
          id: true,
          name: true,
          type: true,
          modelId: true,
          lastSeen: true,
        },
      },
    },
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

  const requester = game.players.find((p) => p.id === playerId);
  if (!requester || requester.type !== "HUMAN") {
    return NextResponse.json(
      { error: "Only a human player can start a new game" },
      { status: 403 }
    );
  }

  const def = getGameDefinition(game.gameType);

  let actingHostId = game.hostPlayerId;
  const needsHostTakeover = playerId !== game.hostPlayerId;
  if (needsHostTakeover) {
    const host = game.players.find((p) => p.id === game.hostPlayerId);
    const hostIsStale =
      !host || Date.now() - new Date(host.lastSeen).getTime() > def.constants.hostStaleMs;
    if (!hostIsStale) {
      return NextResponse.json(
        { error: "Only the host can start a new game" },
        { status: 403 }
      );
    }
    actingHostId = playerId;
  }

  if (game.nextGameCode) {
    const existing = await buildExistingPlayAgainResponse(game.nextGameCode);
    if (existing) {
      return NextResponse.json(existing);
    }
  }

  const newRoomCode = await generateUniqueRoomCode();
  if (!newRoomCode) {
    return NextResponse.json(
      { error: "Failed to generate room code" },
      { status: 500 }
    );
  }

  const hostPlayer = game.players.find((p) => p.id === actingHostId);
  if (!hostPlayer) {
    return NextResponse.json(
      { error: "Host player not found" },
      { status: 500 }
    );
  }

  const aiPlayers = selectUniqueModelsByProvider(
    game.players
      .filter((p): p is typeof p & { modelId: string } => p.type === "AI" && p.modelId != null)
      .map((p) => p.modelId)
  );

  const hostRejoinToken = randomBytes(12).toString("base64url");
  let createdResponse:
    | { roomCode: string; hostPlayerId: string; rejoinToken: string }
    | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic compare-and-set so only one caller can create/link the next game.
      const claim = await tx.game.updateMany({
        where: { id: game.id, nextGameCode: null },
        data: { nextGameCode: newRoomCode },
      });
      if (claim.count === 0) {
        throw new Error(PLAY_AGAIN_ALREADY_CREATED);
      }

      // Promote host inside the transaction so it rolls back if anything fails.
      if (needsHostTakeover) {
        await tx.game.update({
          where: { id: game.id },
          data: { hostPlayerId: playerId, version: { increment: 1 } },
        });
      }

      const newGame = await tx.game.create({
        data: {
          roomCode: newRoomCode,
          gameType: game.gameType,
          timersDisabled: game.timersDisabled,
          ttsMode: game.ttsMode,
          ttsVoice: game.ttsVoice,
          players: {
            create: [
              { name: hostPlayer.name, type: "HUMAN", rejoinToken: hostRejoinToken },
              ...aiPlayers.map((model) => ({
                name: model.shortName,
                type: "AI" as const,
                modelId: model.id,
              })),
            ],
          },
        },
        select: {
          id: true,
          players: { select: { id: true, type: true } },
        },
      });

      const newHost = newGame.players.find((p) => p.type === "HUMAN");
      if (!newHost) {
        throw new Error("FAILED_TO_SET_UP_NEW_GAME");
      }

      await tx.game.update({
        where: { id: newGame.id },
        data: { hostPlayerId: newHost.id },
      });

      createdResponse = {
        roomCode: newRoomCode,
        hostPlayerId: newHost.id,
        rejoinToken: hostRejoinToken,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === PLAY_AGAIN_ALREADY_CREATED) {
      const latest = await prisma.game.findUnique({
        where: { id: game.id },
        select: { nextGameCode: true },
      });
      if (latest?.nextGameCode) {
        const existing = await buildExistingPlayAgainResponse(latest.nextGameCode);
        if (existing) {
          return NextResponse.json(existing);
        }
      }
      return NextResponse.json(
        { error: "New game was already created but could not be retrieved" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "FAILED_TO_SET_UP_NEW_GAME") {
      return NextResponse.json(
        { error: "Failed to set up new game" },
        { status: 500 }
      );
    }
    throw error;
  }

  if (!createdResponse) {
    return NextResponse.json(
      { error: "Failed to create new game" },
      { status: 500 }
    );
  }

  logGameEvent("playAgain", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
    newRoomCode,
    transientCleanup: !def.capabilities.retainsCompletedData,
  });

  if (!def.capabilities.retainsCompletedData) {
    after(() => deleteTransientGameData(game.id));
  }

  return NextResponse.json(createdResponse);
}
