import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";
import { logGameEvent } from "@/games/core/observability";
import { runAiResponsesGeneration, runAiVotesGeneration, runGameStateMaintenance } from "@/games/core/runtime";
import type { PhaseAdvanceResult } from "@/games/core";
import { publishGameStateEvent } from "@/lib/realtime-events";

async function findAdvanceSnapshot(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, currentRound: true },
  });
}

function toPhaseAdvanceResult(status: string): Exclude<PhaseAdvanceResult, null> | null {
  switch (status) {
    case "WRITING":
    case "VOTING":
    case "VOTING_SUBPHASE":
    case "ROUND_RESULTS":
    case "FINAL_RESULTS":
      return status;
    default:
      return null;
  }
}

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
      currentRound: true,
      hostPlayerId: true,
      hostControlTokenHash: true,
      hostControlLastSeen: true,
      players: {
        select: {
          id: true,
          lastSeen: true,
        },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const def = getGameDefinition(game.gameType);
  const isHost = await isAuthorizedHostControl(game, auth);

  if (game.status === "ROUND_RESULTS") {
    if (!isHost) {
      const host = game.hostPlayerId
        ? game.players.find((p) => p.id === game.hostPlayerId)
        : null;
      const playerHostIsActive =
        host != null &&
        Date.now() - new Date(host.lastSeen).getTime() <= def.constants.hostStaleMs;
      const displayHostIsActive =
        !game.hostPlayerId &&
        game.hostControlLastSeen != null &&
        Date.now() - new Date(game.hostControlLastSeen).getTime() <= def.constants.hostStaleMs;

      if (playerHostIsActive || displayHostIsActive) {
        return NextResponse.json(
          { error: "Only the host can advance" },
          { status: 403 }
        );
      }
    }
    let advancedTo = await def.handlers.advanceGame(game.id);

    if (advancedTo == null) {
      const latestGame = await findAdvanceSnapshot(game.id);
      if (latestGame?.status === "FINAL_RESULTS") {
        advancedTo = "FINAL_RESULTS";
      } else if (
        latestGame?.status === "WRITING" &&
        latestGame.currentRound > game.currentRound
      ) {
        advancedTo = "WRITING";
      }
    }

    if (advancedTo == null) {
      return NextResponse.json(
        { error: "Could not advance game state" },
        { status: 409 }
      );
    }
    logGameEvent("phaseAdvanced", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
      from: "ROUND_RESULTS",
      to: advancedTo,
      newRound: advancedTo === "WRITING",
    });
    if (advancedTo === "WRITING") {
      await publishGameStateEvent(game.id);
      after(async () => {
        const ran = await runAiResponsesGeneration(game.id, game.gameType);
        if (ran) {
          await publishGameStateEvent(game.id);
        }
        await runGameStateMaintenance(game.id, game.gameType);
      });
    } else if (def.capabilities.retainsCompletedData) {
      after(() => applyCompletedGameToLeaderboardAggregate(game.id));
      revalidateTag(LEADERBOARD_TAG, { expire: 0 });
      await publishGameStateEvent(game.id);
      after(async () => {
        await runGameStateMaintenance(game.id, game.gameType);
      });
    } else {
      await publishGameStateEvent(game.id);
      after(async () => {
        await runGameStateMaintenance(game.id, game.gameType);
      });
    }
    return NextResponse.json({ success: true });
  }

  if (game.status === "WRITING" || game.status === "VOTING") {
    if (!isHost) {
      return NextResponse.json(
        { error: "Only the host can skip the timer" },
        { status: 403 }
      );
    }
    let advancedTo = await def.handlers.forceAdvancePhase(game.id);
    if (advancedTo == null) {
      const latestGame = await findAdvanceSnapshot(game.id);
      if (
        latestGame != null &&
        (latestGame.status !== game.status || latestGame.currentRound !== game.currentRound)
      ) {
        advancedTo = toPhaseAdvanceResult(latestGame.status);
      }
    }
    if (advancedTo == null) {
      return NextResponse.json(
        { error: "Could not advance current phase" },
        { status: 409 }
      );
    }
    logGameEvent("phaseAdvanced", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
      from: game.status,
      to: advancedTo,
      forced: true,
    });
    // AI_CHAT_SHOWDOWN already triggers AI votes inside forceAdvancePhase().
    if (advancedTo === "VOTING") {
      await publishGameStateEvent(game.id);
      after(async () => {
        const ran = await runAiVotesGeneration(game.id, game.gameType);
        if (ran) {
          await publishGameStateEvent(game.id);
        }
        await runGameStateMaintenance(game.id, game.gameType);
      });
    } else {
      await publishGameStateEvent(game.id);
      after(async () => {
        await runGameStateMaintenance(game.id, game.gameType);
      });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Cannot advance from current phase" },
    { status: 400 }
  );
}
