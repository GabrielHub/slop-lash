import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { LEADERBOARD_TAG } from "@/lib/game-constants";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { advanceGame, generateAiResponses, forceAdvancePhase, generateAiVotes, HOST_STALE_MS } from "@/lib/game-logic";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";

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
      status: true,
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

  const isHost = await isAuthorizedHostControl(game, auth);

  if (game.status === "ROUND_RESULTS") {
    if (!isHost) {
      const host = game.hostPlayerId
        ? game.players.find((p) => p.id === game.hostPlayerId)
        : null;
      const playerHostIsActive =
        host != null &&
        Date.now() - new Date(host.lastSeen).getTime() <= HOST_STALE_MS;
      const displayHostIsActive =
        !game.hostPlayerId &&
        game.hostControlLastSeen != null &&
        Date.now() - new Date(game.hostControlLastSeen).getTime() <= HOST_STALE_MS;

      if (playerHostIsActive || displayHostIsActive) {
        return NextResponse.json(
          { error: "Only the host can advance" },
          { status: 403 }
        );
      }
    }
    const newRoundStarted = await advanceGame(game.id);
    if (newRoundStarted) {
      after(() => generateAiResponses(game.id));
    } else {
      after(() => applyCompletedGameToLeaderboardAggregate(game.id));
      revalidateTag(LEADERBOARD_TAG, { expire: 0 });
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
    if (game.status === "WRITING") {
      await prisma.game.update({
        where: { id: game.id },
        data: { phaseDeadline: null },
      });
    }
    const advancedTo = await forceAdvancePhase(game.id);
    if (advancedTo === "VOTING") {
      after(() => generateAiVotes(game.id));
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Cannot advance from current phase" },
    { status: 400 }
  );
}
