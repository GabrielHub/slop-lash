import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { parseJsonBody } from "@/lib/http";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";
import { logGameEvent } from "@/games/core/observability";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { ensurePersonaProfile } from "@/games/matchslop/persona-profile";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown; hostToken?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const auth = readHostAuth(body);
  if (!auth.playerId && !auth.hostToken) {
    return NextResponse.json(
      { error: "playerId or hostToken is required" },
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
      hostControlTokenHash: true,
      players: { select: { type: true } },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Game already started" },
      { status: 400 }
    );
  }

  if (!(await isAuthorizedHostControl(game, auth))) {
    return NextResponse.json(
      { error: "Only the host can start the game" },
      { status: 403 }
    );
  }

  const def = getGameDefinition(game.gameType);

  const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
  if (activePlayers.length < def.constants.minPlayers) {
    return NextResponse.json(
      { error: `Need at least ${def.constants.minPlayers} players` },
      { status: 400 }
    );
  }

  let startedRound = false;
  try {
    await def.handlers.startGame(game.id, 1);
    startedRound = true;
  } catch (e) {
    // Race-loser on unique(roundNumber) — treat as success
    if (!hasPrismaErrorCode(e, "P2002")) throw e;
  }

  if (startedRound) {
    logGameEvent("started", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
      players: activePlayers.length,
    });
    await publishGameStateEvent(game.id);
    after(async () => {
      if (game.gameType === "MATCHSLOP") {
        await ensurePersonaProfile(game.id);
        return;
      }

      const tasks: Promise<unknown>[] = [
        (async () => {
          await def.handlers.generateAiResponses(game.id);
          await publishGameStateEvent(game.id);
        })(),
      ];

      await Promise.allSettled(tasks);
    });
  }

  return NextResponse.json({ success: true });
}
