import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { checkAndEnforceDeadline, generateAiVotes, generateTtsForCurrentPrompt, promoteHost, HOST_STALE_MS } from "@/lib/game-logic";
import { roundsInclude, modelUsagesInclude } from "@/lib/game-queries";

const gameInclude = {
  players: {
    orderBy: { score: "desc" as const },
  },
  rounds: {
    orderBy: { roundNumber: "desc" as const },
    take: 1,
    include: roundsInclude,
  },
  modelUsages: modelUsagesInclude,
} as const;

function findGame(roomCode: string, { allRounds = false } = {}) {
  return prisma.game.findUnique({
    where: { roomCode },
    include: allRounds
      ? {
          ...gameInclude,
          rounds: {
            orderBy: { roundNumber: "asc" as const },
            include: roundsInclude,
          },
        }
      : gameInclude,
  });
}

/**
 * Strip votes from prompts that haven't been revealed yet during VOTING phase.
 * Prevents clients from peeking at partial vote results.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUnrevealedVotes(game: any): void {
  if (game.status !== "VOTING" || !game.rounds?.[0]) return;

  const round = game.rounds[0];
  const votable = [...round.prompts]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p.responses.length >= 2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.id.localeCompare(b.id));

  for (let i = 0; i < votable.length; i++) {
    const isFuture = i > game.votingPromptIndex;
    const isCurrentUnrevealed = i === game.votingPromptIndex && !game.votingRevealing;

    if (isFuture || isCurrentUnrevealed) {
      votable[i].votes = [];
      // Strip reactions from unrevealed prompts (match vote stripping)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const resp of votable[i].responses as any[]) {
        resp.reactions = [];
      }
    }
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");
  const clientVersion = url.searchParams.get("v");

  const game = await findGame(roomCode);

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Heartbeat: update lastSeen for the polling player (non-blocking)
  if (playerId) {
    after(() =>
      prisma.player.updateMany({
        where: { id: playerId, gameId: game.id },
        data: { lastSeen: new Date() },
      })
    );
  }

  // Check if host is stale and promote a new one
  let hostPromoted = false;
  if (game.hostPlayerId) {
    const host = game.players.find((p) => p.id === game.hostPlayerId);
    if (host && Date.now() - new Date(host.lastSeen).getTime() > HOST_STALE_MS) {
      await promoteHost(game.id);
      hostPromoted = true;
    }
  }

  // Check and enforce deadline (auto-advance if expired)
  const advancedTo = await checkAndEnforceDeadline(game.id);

  // If deadline advanced to a voting phase, generate AI votes + TTS in background
  if (advancedTo === "VOTING") {
    after(() => Promise.all([
      generateAiVotes(game.id),
      generateTtsForCurrentPrompt(game.id),
    ]));
  } else if (advancedTo === "VOTING_SUBPHASE") {
    after(() => generateTtsForCurrentPrompt(game.id));
  }

  if (advancedTo || hostPromoted) {
    const fresh = await findGame(roomCode);
    stripUnrevealedVotes(fresh);
    return NextResponse.json(fresh, {
      headers: { ETag: `"${fresh?.version}"` },
    });
  }

  // Smart polling: skip full response if version unchanged
  // Supports both ?v= query param and standard HTTP If-None-Match header
  const etag = `"${game.version}"`;
  const versionUnchanged =
    (clientVersion && Number(clientVersion) === game.version) ||
    request.headers.get("if-none-match") === etag;

  if (versionUnchanged) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // Return all rounds for FINAL_RESULTS (needed for best-prompts carousel)
  if (game.status === "FINAL_RESULTS") {
    const data = await findGame(roomCode, { allRounds: true });
    return NextResponse.json(data, { headers: { ETag: etag } });
  }

  stripUnrevealedVotes(game);
  return NextResponse.json(game, { headers: { ETag: etag } });
}
