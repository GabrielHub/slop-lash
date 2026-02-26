import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import type { PhaseAdvanceResult } from "@/lib/game-logic";
import { checkAndEnforceDeadline, generateAiVotes, promoteHost, HOST_STALE_MS } from "@/lib/game-logic";
import type { GameMetaPayload, GameRoutePayload } from "./route-data";
import { findGameMeta, findGamePayloadByStatus } from "./route-data";
import { isDeadlineExpired, isVersionUnchanged, stripUnrevealedVotes } from "./route-helpers";
import { jsonByteLength, logDbTransfer, recordRouteHit } from "@/lib/db-transfer-debug";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

const HEARTBEAT_MIN_INTERVAL_MS = 15_000;

function normalizePayload(game: unknown): GameRoutePayload {
  const normalized = game as Record<string, unknown>;
  return {
    ...normalized,
    aiInputTokens: (normalized.aiInputTokens as number | undefined) ?? 0,
    aiOutputTokens: (normalized.aiOutputTokens as number | undefined) ?? 0,
    aiCostUsd: (normalized.aiCostUsd as number | undefined) ?? 0,
    modelUsages: (normalized.modelUsages as GameRoutePayload["modelUsages"] | undefined) ?? [],
    rounds: (normalized.rounds as GameRoutePayload["rounds"] | undefined) ?? [],
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

  const meta = await findGameMeta(roomCode);
  if (!meta) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }
  const shouldTouch = shouldTouchRequested && meta.status !== "FINAL_RESULTS";

  let advancedTo: PhaseAdvanceResult = null;
  if (isDeadlineExpired(meta.phaseDeadline)) {
    advancedTo = await checkAndEnforceDeadline(meta.id);
    if (advancedTo === "VOTING") {
      after(() => generateAiVotes(meta.id));
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
    if (shouldTouch) scheduleHeartbeat(playerId, meta);
    logDbTransfer("/api/games/[code]", {
      result: "304",
      status: meta.status,
      version: meta.version,
      touch: shouldTouch ? 1 : 0,
    });

    return new Response(null, {
      status: 304,
      headers: { ...CACHE_HEADERS, ETag: `"${meta.version}"` },
    });
  }

  const freshMeta = advancedTo ? await findGameMeta(roomCode) : meta;
  const payloadStatus = freshMeta?.status ?? meta.status;

  const game = await findGamePayloadByStatus(roomCode, payloadStatus);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (shouldTouch) scheduleHeartbeat(playerId, meta);

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
  });

  return jsonGameResponse(normalized);
}
