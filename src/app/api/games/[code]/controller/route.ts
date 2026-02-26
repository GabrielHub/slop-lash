import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import type { ControllerGameState } from "@/lib/controller-types";
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
import { FORFEIT_MARKER } from "@/lib/scoring";
import { isDeadlineExpired, isVersionUnchanged } from "../route-helpers";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

const HEARTBEAT_MIN_INTERVAL_MS = 15_000;

function jsonControllerResponse(game: ControllerGameState): Response {
  return NextResponse.json(game, {
    headers: { ...CACHE_HEADERS, ETag: `"${game.version}"` },
  });
}

async function findControllerMeta(roomCode: string) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: {
      id: true,
      status: true,
      version: true,
      phaseDeadline: true,
      hostPlayerId: true,
      hostControlLastSeen: true,
    },
  });
}

function scheduleHeartbeat(playerId: string, meta: NonNullable<Awaited<ReturnType<typeof findControllerMeta>>>): void {
  after(async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS);
    await prisma.player.updateMany({
      where: { id: playerId, gameId: meta.id, lastSeen: { lt: cutoff } },
      data: { lastSeen: new Date() },
    });

    const hostControlStale =
      !!meta.hostControlLastSeen &&
      Date.now() - meta.hostControlLastSeen.getTime() > HOST_STALE_MS;

    if (!meta.hostPlayerId && hostControlStale) {
      await promoteHost(meta.id);
      return;
    }

    if (meta.hostPlayerId && playerId !== meta.hostPlayerId) {
      const host = await prisma.player.findUnique({
        where: { id: meta.hostPlayerId },
        select: { gameId: true, lastSeen: true },
      });
      if (host?.gameId === meta.id && Date.now() - host.lastSeen.getTime() > HOST_STALE_MS) {
        await promoteHost(meta.id);
      }
    }
  });
}

async function findControllerPayload(roomCode: string, playerId: string | null): Promise<ControllerGameState | null> {
  const game = await prisma.game.findUnique({
    where: { roomCode },
    select: {
      id: true,
      roomCode: true,
      status: true,
      currentRound: true,
      totalRounds: true,
      hostPlayerId: true,
      phaseDeadline: true,
      timersDisabled: true,
      votingPromptIndex: true,
      votingRevealing: true,
      nextGameCode: true,
      version: true,
      players: {
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      },
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        select: {
          roundNumber: true,
          prompts: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              text: true,
              assignments: { select: { playerId: true } },
              responses: {
                select: { id: true, playerId: true, text: true },
                orderBy: { id: "asc" },
              },
              votes: {
                select: { voterId: true, responseId: true, failReason: true },
              },
            },
          },
        },
      },
    },
  });

  if (!game) return null;

  const { players } = game;
  const me = playerId ? players.find((p) => p.id === playerId) ?? null : null;
  const currentRound = game.rounds[0];

  let writing: ControllerGameState["writing"] = null;
  if (game.status === "WRITING" && currentRound && playerId && me?.type !== "AI") {
    const prompts = currentRound.prompts
      .filter((p) => p.assignments.some((a) => a.playerId === playerId))
      .map((p) => ({
        id: p.id,
        text: p.text,
        submitted: p.responses.some((r) => r.playerId === playerId),
      }));
    writing = { prompts };
  }

  let voting: ControllerGameState["voting"] = null;
  if (game.status === "VOTING" && currentRound) {
    const votablePrompts = currentRound.prompts.filter(
      (p) =>
        p.responses.length >= 2 &&
        !p.responses.some((r) => r.text === FORFEIT_MARKER),
    );
    const currentPrompt = votablePrompts[game.votingPromptIndex] ?? null;

    if (currentPrompt && playerId) {
      const isRespondent = currentPrompt.responses.some((r) => r.playerId === playerId);
      const ownVote = currentPrompt.votes.find((v) => v.voterId === playerId) ?? null;
      voting = {
        totalPrompts: votablePrompts.length,
        currentPrompt: {
          id: currentPrompt.id,
          text: currentPrompt.text,
          responses: currentPrompt.responses.slice(0, 2).map((r) => ({
            id: r.id,
            text: r.text,
          })),
          isRespondent,
          hasVoted: ownVote != null,
          hasAbstained:
            ownVote != null &&
            ownVote.responseId == null &&
            ownVote.failReason == null,
        },
      };
    } else {
      voting = {
        totalPrompts: votablePrompts.length,
        currentPrompt: null,
      };
    }
  }

  return {
    id: game.id,
    roomCode: game.roomCode,
    status: game.status,
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    hostPlayerId: game.hostPlayerId,
    phaseDeadline: game.phaseDeadline?.toISOString() ?? null,
    timersDisabled: game.timersDisabled,
    votingPromptIndex: game.votingPromptIndex,
    votingRevealing: game.votingRevealing,
    nextGameCode: game.nextGameCode,
    version: game.version,
    players,
    me,
    writing,
    voting,
  };
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
  const shouldTouch = shouldTouchRequested && meta.status !== "FINAL_RESULTS";

  let advancedTo: PhaseAdvanceResult = null;
  if (isDeadlineExpired(meta.phaseDeadline)) {
    advancedTo = await checkAndEnforceDeadline(meta.id);
    if (advancedTo === "VOTING") {
      after(() => generateAiVotes(meta.id));
    } else if (advancedTo === "WRITING") {
      after(() => generateAiResponses(meta.id));
    } else if (advancedTo === "FINAL_RESULTS") {
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
    if (playerId && shouldTouch) scheduleHeartbeat(playerId, meta);
    return new Response(null, {
      status: 304,
      headers: { ...CACHE_HEADERS, ETag: `"${meta.version}"` },
    });
  }

  const payload = await findControllerPayload(roomCode, playerId);
  if (!payload) {
    return NextResponse.json({ error: "Game not found" }, { status: 404, headers: CACHE_HEADERS });
  }

  if (playerId && shouldTouch) scheduleHeartbeat(playerId, meta);

  return jsonControllerResponse(payload);
}
