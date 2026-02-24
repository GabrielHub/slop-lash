import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { checkAndEnforceDeadline, generateAiVotes, preGenerateTtsAudio, promoteHost, HOST_STALE_MS } from "@/lib/game-logic";

const roundsInclude = {
  prompts: {
    omit: { ttsAudio: true },
    include: {
      responses: {
        include: { player: { select: { id: true, name: true, type: true, modelId: true, lastSeen: true } } },
      },
      votes: true,
      assignments: { select: { promptId: true, playerId: true } },
    },
  },
} as const;

const gameInclude = {
  players: {
    orderBy: { score: "desc" as const },
  },
  rounds: {
    orderBy: { roundNumber: "desc" as const },
    take: 1,
    include: roundsInclude,
  },
  modelUsages: {
    select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
    orderBy: { costUsd: "desc" as const },
  },
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
    if (i > game.votingPromptIndex || (i === game.votingPromptIndex && !game.votingRevealing)) {
      votable[i].votes = [];
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

  // If deadline advanced WRITING→VOTING, generate AI votes + TTS in background
  if (advancedTo === "VOTING") {
    after(() => Promise.all([
      generateAiVotes(game.id),
      preGenerateTtsAudio(game.id),
    ]));
  }

  if (advancedTo || hostPromoted) {
    const fresh = await findGame(roomCode);
    stripUnrevealedVotes(fresh);
    return NextResponse.json(fresh);
  }

  // Smart polling: skip full response if version unchanged
  if (clientVersion && Number(clientVersion) === game.version) {
    return NextResponse.json({ changed: false });
  }

  // Return all rounds for FINAL_RESULTS (needed for best-prompts carousel)
  if (game.status === "FINAL_RESULTS") {
    return NextResponse.json(await findGame(roomCode, { allRounds: true }));
  }

  stripUnrevealedVotes(game);
  return NextResponse.json(game);
}
