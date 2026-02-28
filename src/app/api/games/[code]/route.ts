import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import type { PhaseAdvanceResult } from "@/games/core";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { checkAndDisconnectInactivePlayers } from "@/games/core/disconnect";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import type { GameMetaPayload, GameRoutePayload } from "./route-data";
import { findGameMeta, findGamePayloadByStatus, normalizePayload } from "./route-data";
import { isDeadlineExpired, isVersionUnchanged, stripUnrevealedVotes } from "./route-helpers";
import { jsonByteLength, logDbTransfer, recordRouteHit } from "@/lib/db-transfer-debug";
import { matchesHostControlToken } from "@/lib/host-control";
import { HEARTBEAT_MIN_INTERVAL_MS } from "./sse-helpers";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;
const SAFETY_CHECK_INTERVAL_MS = 10_000;
const lastSafetyCheck = new Map<string, number>();

function jsonGameResponse(game: GameRoutePayload): Response {
  return NextResponse.json(game, {
    headers: { ...CACHE_HEADERS, ETag: `"${game.version}"` },
  });
}

function scheduleHeartbeat(
  playerId: string,
  meta: GameMetaPayload,
  hostStaleMs: number,
  roomCode: string,
): void {
  after(async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS);
    await prisma.player.updateMany({
      where: { id: playerId, gameId: meta.id, lastSeen: { lt: cutoff } },
      data: { lastSeen: new Date() },
    });

    await maybePromoteHost(playerId, meta, hostStaleMs);

    const isActivePhase = meta.status === "WRITING" || meta.status === "VOTING";
    if (isActivePhase) {
      await checkAndDisconnectInactivePlayers(meta.id, meta.gameType, roomCode);
    }
  });
}

async function maybePromoteHost(
  playerId: string,
  meta: GameMetaPayload,
  hostStaleMs: number,
): Promise<void> {
  const def = getGameDefinition(meta.gameType);

  const hostControlStale =
    !!meta.hostControlLastSeen &&
    Date.now() - meta.hostControlLastSeen.getTime() > hostStaleMs;

  if (!meta.hostPlayerId && hostControlStale) {
    await def.handlers.promoteHost(meta.id);
    return;
  }

  if (meta.hostPlayerId && playerId !== meta.hostPlayerId) {
    const host = await prisma.player.findUnique({
      where: { id: meta.hostPlayerId },
      select: { gameId: true, lastSeen: true },
    });
    if (
      host?.gameId === meta.id &&
      Date.now() - host.lastSeen.getTime() > hostStaleMs
    ) {
      await def.handlers.promoteHost(meta.id);
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

  const def = getGameDefinition(meta.gameType);

  const shouldTouch = shouldTouchRequested && meta.status !== "FINAL_RESULTS";
  const shouldHostTouch =
    shouldHostTouchRequested &&
    meta.status !== "FINAL_RESULTS" &&
    matchesHostControlToken(meta.hostControlTokenHash, hostToken);

  let advancedTo: PhaseAdvanceResult = null;
  if (isDeadlineExpired(meta.phaseDeadline)) {
    advancedTo = await def.handlers.checkAndEnforceDeadline(meta.id);
    if (advancedTo === "VOTING") {
      after(() => def.handlers.generateAiVotes(meta.id));
    } else if (advancedTo === "WRITING") {
      after(() => def.handlers.generateAiResponses(meta.id));
    } else if (advancedTo === "FINAL_RESULTS" && def.capabilities.retainsCompletedData) {
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
    if (shouldTouch && playerId) scheduleHeartbeat(playerId, meta, def.constants.hostStaleMs, roomCode);
    if (shouldHostTouch) scheduleHostHeartbeat(meta);

    // Safety net: check if all responses are in during WRITING phase.
    // The respond route's after() can fail silently, so pollers provide
    // redundancy. startVoting() uses optimistic locking so concurrent
    // calls from multiple pollers are safe. Throttled to at most once
    // per SAFETY_CHECK_INTERVAL_MS per game to avoid N-per-second DB spam.
    if (meta.status === "WRITING") {
      const now = Date.now();
      const lastCheck = lastSafetyCheck.get(meta.id) ?? 0;
      if (now - lastCheck >= SAFETY_CHECK_INTERVAL_MS) {
        lastSafetyCheck.set(meta.id, now);
        after(async () => {
          try {
            const allIn = await def.handlers.checkAllResponsesIn(meta.id);
            if (allIn) {
              lastSafetyCheck.delete(meta.id);
              const claimed = await def.handlers.startVoting(meta.id);
              // AI_CHAT_SHOWDOWN triggers AI votes inside forceAdvancePhase()
              if (claimed && meta.gameType !== "AI_CHAT_SHOWDOWN") {
                await def.handlers.generateAiVotes(meta.id);
              }
            }
          } catch {
            lastSafetyCheck.delete(meta.id);
          }
        });
      }
    }

    logDbTransfer("/api/games/[code]", {
      result: "304",
      gameType: meta.gameType,
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

  if (shouldTouch && playerId) scheduleHeartbeat(playerId, meta, def.constants.hostStaleMs, roomCode);
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
    gameType: meta.gameType,
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
