import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";
import { logGameEvent } from "@/games/core/observability";

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
    select: { id: true, gameType: true, status: true, hostPlayerId: true, hostControlTokenHash: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (!(await isAuthorizedHostControl(game, auth))) {
    return NextResponse.json(
      { error: "Only the host can end the game" },
      { status: 403 }
    );
  }

  if (game.status === "LOBBY" || game.status === "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Cannot end game in current state" },
      { status: 400 }
    );
  }

  const def = getGameDefinition(game.gameType);
  await def.handlers.endGameEarly(game.id);
  logGameEvent("ended", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
    fromStatus: game.status,
  });
  if (def.capabilities.retainsCompletedData) {
    after(() => applyCompletedGameToLeaderboardAggregate(game.id));
    revalidateTag(LEADERBOARD_TAG, { expire: 0 });
  }
  return NextResponse.json({ success: true });
}
