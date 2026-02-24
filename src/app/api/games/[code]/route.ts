import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { checkAndEnforceDeadline, promoteHost, HOST_STALE_MS } from "@/lib/game-logic";

const roundsInclude = {
  prompts: {
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
    after(
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
  const advanced = await checkAndEnforceDeadline(game.id);

  if (advanced || hostPromoted) {
    // Re-fetch to get fresh data after state changes
    return NextResponse.json(await findGame(roomCode, { allRounds: true }));
  }

  // Smart polling: skip full response if version unchanged and no deadline was enforced
  if (clientVersion && Number(clientVersion) === game.version) {
    return NextResponse.json({ changed: false });
  }

  // Return all rounds for FINAL_RESULTS (needed for best-prompts carousel)
  if (game.status === "FINAL_RESULTS") {
    return NextResponse.json(await findGame(roomCode, { allRounds: true }));
  }

  return NextResponse.json(game);
}
