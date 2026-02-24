import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { checkAllResponsesIn, startVoting, generateAiVotes, preGenerateTtsAudio } from "@/lib/game-logic";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { playerId, promptId, text } = await request.json();

  if (!playerId || !promptId || !text || typeof text !== "string") {
    return NextResponse.json(
      { error: "playerId, promptId, and text are required" },
      { status: 400 }
    );
  }

  const trimmed = sanitize(text, 200);
  if (trimmed.length === 0) {
    return NextResponse.json(
      { error: "Response text cannot be empty" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "WRITING") {
    return NextResponse.json(
      { error: "Game not in writing phase" },
      { status: 400 }
    );
  }

  // Verify player belongs to this game
  const player = await prisma.player.findFirst({
    where: { id: playerId, gameId: game.id },
  });
  if (!player) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 403 }
    );
  }

  // Spectators cannot submit responses
  if (player.type === "SPECTATOR") {
    return NextResponse.json(
      { error: "Spectators cannot submit responses" },
      { status: 403 }
    );
  }

  // Per-player rate limit
  if (!checkRateLimit(`respond:${playerId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
    );
  }

  // Validate player is assigned to this prompt
  const assignment = await prisma.promptAssignment.findUnique({
    where: { promptId_playerId: { promptId, playerId } },
  });

  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to this prompt" },
      { status: 403 }
    );
  }

  // Use transaction to prevent race conditions on duplicate submission
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.response.findFirst({
        where: { promptId, playerId },
      });

      if (existing) {
        throw new Error("ALREADY_RESPONDED");
      }

      await tx.response.create({
        data: { promptId, playerId, text: trimmed },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_RESPONDED") {
      return NextResponse.json(
        { error: "Already responded to this prompt" },
        { status: 400 }
      );
    }
    throw e;
  }

  // Check and advance in background so the human gets an instant response
  after(async () => {
    const allIn = await checkAllResponsesIn(game.id);
    if (allIn) {
      const claimed = await startVoting(game.id);
      if (claimed) {
        await Promise.all([
          generateAiVotes(game.id),
          preGenerateTtsAudio(game.id),
        ]);
      }
    }
  });

  return NextResponse.json({ success: true });
}
