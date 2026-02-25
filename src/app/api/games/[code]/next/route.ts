import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { LEADERBOARD_TAG } from "@/lib/game-constants";
import { advanceGame, generateAiResponses, forceAdvancePhase, generateAiVotes, generateTtsForCurrentPrompt, HOST_STALE_MS } from "@/lib/game-logic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { playerId } = await request.json();

  if (!playerId) {
    return NextResponse.json(
      { error: "playerId is required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    include: { players: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const isHost = playerId === game.hostPlayerId;

  if (game.status === "ROUND_RESULTS") {
    // Host can always advance; non-host can advance if host is stale
    if (!isHost) {
      const host = game.players.find((p) => p.id === game.hostPlayerId);
      if (host && Date.now() - new Date(host.lastSeen).getTime() <= HOST_STALE_MS) {
        return NextResponse.json(
          { error: "Only the host can advance" },
          { status: 403 }
        );
      }
    }
    const newRoundStarted = await advanceGame(game.id);
    if (newRoundStarted) {
      after(() => generateAiResponses(game.id));
    } else {
      // Game finished (no new round) — invalidate leaderboard cache
      revalidateTag(LEADERBOARD_TAG, { expire: 0 });
    }
    return NextResponse.json({ success: true });
  }

  if (game.status === "WRITING" || game.status === "VOTING") {
    if (!isHost) {
      return NextResponse.json(
        { error: "Only the host can skip the timer" },
        { status: 403 }
      );
    }
    // Only clear deadline for WRITING; VOTING sub-phases manage their own deadlines
    if (game.status === "WRITING") {
      await prisma.game.update({
        where: { id: game.id },
        data: { phaseDeadline: null },
      });
    }
    const advancedTo = await forceAdvancePhase(game.id);
    if (advancedTo === "VOTING") {
      after(() => Promise.all([
        generateAiVotes(game.id),
        generateTtsForCurrentPrompt(game.id),
      ]));
    } else if (advancedTo === "VOTING_SUBPHASE") {
      after(() => generateTtsForCurrentPrompt(game.id));
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Cannot advance from current phase" },
    { status: 400 }
  );
}
