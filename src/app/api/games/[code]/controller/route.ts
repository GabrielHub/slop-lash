import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { ControllerGameState } from "@/lib/controller-types";
import { getGameDefinition } from "@/games/registry";
import type { PhaseAdvanceResult } from "@/games/core";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { checkAndDisconnectInactivePlayers } from "@/games/core/disconnect";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { isDeadlineExpired, isVersionUnchanged } from "../route-helpers";
import { findControllerMeta, findControllerPayload } from "./controller-data";
import type { ControllerMetaPayload } from "./controller-data";
import { HEARTBEAT_MIN_INTERVAL_MS } from "../sse-helpers";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

function jsonControllerResponse(game: ControllerGameState): Response {
  return NextResponse.json(game, {
    headers: { ...CACHE_HEADERS, ETag: `"${game.version}"` },
  });
}

function scheduleHeartbeat(playerId: string, meta: ControllerMetaPayload, roomCode: string): void {
  const def = getGameDefinition(meta.gameType);
  after(async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS);
    await prisma.player.updateMany({
      where: { id: playerId, gameId: meta.id, lastSeen: { lt: cutoff } },
      data: { lastSeen: new Date() },
    });

    const hostControlStale =
      !!meta.hostControlLastSeen &&
      Date.now() - meta.hostControlLastSeen.getTime() > def.constants.hostStaleMs;

    if (!meta.hostPlayerId && hostControlStale) {
      await def.handlers.promoteHost(meta.id);
      return;
    }

    if (meta.hostPlayerId && playerId !== meta.hostPlayerId) {
      const host = await prisma.player.findUnique({
        where: { id: meta.hostPlayerId },
        select: { gameId: true, lastSeen: true },
      });
      if (host?.gameId === meta.id && Date.now() - host.lastSeen.getTime() > def.constants.hostStaleMs) {
        await def.handlers.promoteHost(meta.id);
      }
    }

    const isActivePhase = meta.status === "WRITING" || meta.status === "VOTING";
    if (isActivePhase) {
      await checkAndDisconnectInactivePlayers(meta.id, meta.gameType, roomCode);
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");
  const clientVersion = url.searchParams.get("v");
  const shouldTouchRequested = url.searchParams.get("touch") === "1" && !!playerId;

  const meta = await findControllerMeta(roomCode);
  if (!meta) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  const def = getGameDefinition(meta.gameType);
  const shouldTouch = shouldTouchRequested && meta.status !== "FINAL_RESULTS";

  let advancedTo: PhaseAdvanceResult = null;
  if (isDeadlineExpired(meta.phaseDeadline)) {
    advancedTo = await def.handlers.checkAndEnforceDeadline(meta.id);
    if (advancedTo === "VOTING") {
      after(() => def.handlers.generateAiVotes(meta.id));
    } else if (advancedTo === "WRITING") {
      after(() => def.handlers.generateAiResponses(meta.id));
    } else if (advancedTo === "FINAL_RESULTS" && def.capabilities.retainsCompletedData) {
      after(() => applyCompletedGameToLeaderboardAggregate(meta.id));
      revalidateTag(LEADERBOARD_TAG, { expire: 0 });
    }
  }

  if (
    !advancedTo &&
    isVersionUnchanged({
      clientVersion,
      ifNoneMatch: request.headers.get("if-none-match"),
      version: meta.version,
    })
  ) {
    if (playerId && shouldTouch) scheduleHeartbeat(playerId, meta, roomCode);
    return new Response(null, {
      status: 304,
      headers: { ...CACHE_HEADERS, ETag: `"${meta.version}"` },
    });
  }

  const payload = await findControllerPayload(roomCode, playerId);
  if (!payload) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (playerId && shouldTouch) scheduleHeartbeat(playerId, meta, roomCode);

  return jsonControllerResponse(payload);
}
