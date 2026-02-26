import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import type { PhaseAdvanceResult } from "@/lib/game-logic";
import { checkAndEnforceDeadline, generateAiVotes, promoteHost, HOST_STALE_MS } from "@/lib/game-logic";
import type { GameRoutePayload } from "./route-data";
import { findGameMeta, findGamePayload } from "./route-data";
import { isDeadlineExpired, isVersionUnchanged, stripUnrevealedVotes } from "./route-helpers";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

function jsonGameResponse(game: GameRoutePayload): Response {
  return NextResponse.json(game, {
    headers: { ...CACHE_HEADERS, ETag: `"${game.version}"` },
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

  const meta = await findGameMeta(roomCode);
  if (!meta) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (playerId) {
    after(() =>
      prisma.player.updateMany({
        where: { id: playerId, gameId: meta.id },
        data: { lastSeen: new Date() },
      }),
    );
  }

  let hostPromoted = false;
  if (meta.hostPlayerId) {
    const host = await prisma.player.findUnique({
      where: { id: meta.hostPlayerId },
      select: { gameId: true, lastSeen: true },
    });
    if (
      host?.gameId === meta.id &&
      Date.now() - host.lastSeen.getTime() > HOST_STALE_MS
    ) {
      await promoteHost(meta.id);
      hostPromoted = true;
    }
  }

  let advancedTo: PhaseAdvanceResult = null;
  if (isDeadlineExpired(meta.phaseDeadline)) {
    advancedTo = await checkAndEnforceDeadline(meta.id);
    if (advancedTo === "VOTING") {
      after(() => generateAiVotes(meta.id));
    }
  }

  if (
    !hostPromoted &&
    !advancedTo &&
    isVersionUnchanged({
      clientVersion,
      ifNoneMatch: request.headers.get("if-none-match"),
      version: meta.version,
    })
  ) {
    return new Response(null, {
      status: 304,
      headers: { ...CACHE_HEADERS, ETag: `"${meta.version}"` },
    });
  }

  const allRounds = !hostPromoted && !advancedTo && meta.status === "FINAL_RESULTS";
  const game = await findGamePayload(roomCode, { allRounds });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (game.status !== "FINAL_RESULTS") {
    stripUnrevealedVotes(game);
  }

  return jsonGameResponse(game);
}
