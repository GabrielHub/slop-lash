import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { PhaseAdvanceResult } from "@/lib/game-logic";
import {
  checkAndEnforceDeadline,
  generateAiResponses,
  generateAiVotes,
  promoteHost,
  HOST_STALE_MS,
} from "@/lib/game-logic";
import { LEADERBOARD_TAG } from "@/lib/game-constants";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import type { GameMetaPayload, GameRoutePayload } from "./route-data";
import { findGameMeta, findGamePayloadByStatus } from "./route-data";
import { isDeadlineExpired, isVersionUnchanged, stripUnrevealedVotes } from "./route-helpers";
import { jsonByteLength, logDbTransfer, recordRouteHit } from "@/lib/db-transfer-debug";
import { matchesHostControlToken } from "@/lib/host-control";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

const HEARTBEAT_MIN_INTERVAL_MS = 15_000;

/** Fill optional fields that may be absent in lighter select queries. */
function normalizePayload(game: unknown): GameRoutePayload {
  const g = game as Record<string, unknown>;
  return {
    ...g,
    aiInputTokens: (g.aiInputTokens as number) ?? 0,
    aiOutputTokens: (g.aiOutputTokens as number) ?? 0,
    aiCostUsd: (g.aiCostUsd as number) ?? 0,
    modelUsages: (g.modelUsages as GameRoutePayload["modelUsages"]) ?? [],
    rounds: (g.rounds as GameRoutePayload["rounds"]) ?? [],
  } as GameRoutePayload;
}

function jsonGameResponse(game: GameRoutePayload): Response {
  return NextResponse.json(game, {
    headers: { ...CACHE_HEADERS, ETag: `"${game.version}"` },
  });
}

function scheduleHeartbeat(
  playerId: string,
  meta: GameMetaPayload,
): void {
  after(async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS);
    await prisma.player.updateMany({
      where: { id: playerId, gameId: meta.id, lastSeen: { lt: cutoff } },
      data: { lastSeen: new Date() },
    });

    await maybePromoteHost(playerId, meta);
  });
}

async function maybePromoteHost(
  playerId: string,
  meta: GameMetaPayload,
): Promise<void> {
  // Display-only host (no player) went stale
  const hostControlStale =
    !!meta.hostControlLastSeen &&
    Date.now() - meta.hostControlLastSeen.getTime() > HOST_STALE_MS;

  if (!meta.hostPlayerId && hostControlStale) {
    await promoteHost(meta.id);
    return;
  }

  // Player-host went stale
  if (meta.hostPlayerId && playerId !== meta.hostPlayerId) {
    const host = await prisma.player.findUnique({
      where: { id: meta.hostPlayerId },
      select: { gameId: true, lastSeen: true },
    });
    if (
      host?.gameId === meta.id &&
      Date.now() - host.lastSeen.getTime() > HOST_STALE_MS
    ) {
      await promoteHost(meta.id);
    }
  }
}

function scheduleHostHeartbeat(meta: GameMetaPayload): void {
  after(async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS);
    await prisma.game.updateMany({
      where: { id: meta.id, hostControlLastSeen: { lt: cutoff } },
      data: { hostControlLastSeen: new Date() },
    });
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  recordRouteHit("/api/games/[code]");
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");
  const clientVersion = url.searchParams.get("v");
  const shouldTouchRequested = url.searchParams.get("touch") === "1" && !!playerId;
  const shouldHostTouchRequested = url.searchParams.get("hostTouch") === "1";
  const hostToken = request.headers.get("x-host-control-token");

  const meta = await findGameMeta(roomCode);
  if (!meta) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }
  const shouldTouch = shouldTouchRequested && meta.status !== "FINAL_RESULTS";
  const shouldHostTouch =
    shouldHostTouchRequested &&
    meta.status !== "FINAL_RESULTS" &&
    matchesHostControlToken(meta.hostControlTokenHash, hostToken);

  let advancedTo: PhaseAdvanceResult = null;
  if (isDeadlineExpired(meta.phaseDeadline)) {
    advancedTo = await checkAndEnforceDeadline(meta.id);
    if (advancedTo === "VOTING") {
      after(() => generateAiVotes(meta.id));
    } else if (advancedTo === "WRITING") {
      after(() => generateAiResponses(meta.id));
    } else if (advancedTo === "FINAL_RESULTS") {
      after(async () => {
        await applyCompletedGameToLeaderboardAggregate(meta.id);
        revalidateTag(LEADERBOARD_TAG, { expire: 0 });
      });
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
    if (shouldTouch && playerId) scheduleHeartbeat(playerId, meta);
    if (shouldHostTouch) scheduleHostHeartbeat(meta);
    logDbTransfer("/api/games/[code]", {
      result: "304",
      status: meta.status,
      version: meta.version,
      touch: shouldTouch ? 1 : 0,
      hostTouch: shouldHostTouch ? 1 : 0,
    });

    return new Response(null, {
      status: 304,
      headers: { ...CACHE_HEADERS, ETag: `"${meta.version}"` },
    });
  }

  const payloadStatus =
    advancedTo && advancedTo !== "VOTING_SUBPHASE" ? advancedTo : meta.status;

  const game = await findGamePayloadByStatus(roomCode, payloadStatus);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (shouldTouch && playerId) scheduleHeartbeat(playerId, meta);
  if (shouldHostTouch) scheduleHostHeartbeat(meta);

  const normalized = normalizePayload(game);

  if (normalized.status !== "FINAL_RESULTS") {
    stripUnrevealedVotes(normalized);
  }

  const roundCount = normalized.rounds.length;
  const promptCount = normalized.rounds.reduce((sum, round) => sum + round.prompts.length, 0);
  const responseCount = normalized.rounds.reduce(
    (sum, round) =>
      sum +
      round.prompts.reduce((promptSum, prompt) => promptSum + prompt.responses.length, 0),
    0,
  );
  logDbTransfer("/api/games/[code]", {
    result: "200",
    status: normalized.status,
    version: normalized.version,
    bytes: jsonByteLength(normalized),
    players: normalized.players.length,
    rounds: roundCount,
    prompts: promptCount,
    responses: responseCount,
    touch: shouldTouch ? 1 : 0,
    hostTouch: shouldHostTouch ? 1 : 0,
  });

  return jsonGameResponse(normalized);
}
