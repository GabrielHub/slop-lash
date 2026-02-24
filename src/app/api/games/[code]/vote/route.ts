import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getVotablePrompts, checkAllVotesForCurrentPrompt, revealCurrentPrompt } from "@/lib/game-logic";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { voterId, promptId, responseId } = await request.json();

  if (!voterId || !promptId || !responseId) {
    return NextResponse.json(
      { error: "voterId, promptId, and responseId are required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "VOTING") {
    return NextResponse.json(
      { error: "Game not in voting phase" },
      { status: 400 }
    );
  }

  // Reject votes during reveal sub-phase
  if (game.votingRevealing) {
    return NextResponse.json(
      { error: "Voting is paused during reveal" },
      { status: 400 }
    );
  }

  // Validate vote is for the currently active prompt
  const votablePrompts = await getVotablePrompts(game.id);
  const currentPrompt = votablePrompts[game.votingPromptIndex];

  if (!currentPrompt || currentPrompt.id !== promptId) {
    return NextResponse.json(
      { error: "Not the current prompt" },
      { status: 400 }
    );
  }

  // Verify voter belongs to this game
  const voter = await prisma.player.findFirst({
    where: { id: voterId, gameId: game.id },
  });
  if (!voter) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 403 }
    );
  }

  // Per-player rate limit
  if (!checkRateLimit(`vote:${voterId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
    );
  }

  // Verify response belongs to this prompt
  const response = await prisma.response.findFirst({
    where: { id: responseId, promptId },
  });
  if (!response) {
    return NextResponse.json(
      { error: "Response does not belong to this prompt" },
      { status: 400 }
    );
  }

  // Use transaction to prevent race conditions on self-vote and duplicate votes
  try {
    await prisma.$transaction(async (tx) => {
      const voterResponse = await tx.response.findFirst({
        where: { promptId, playerId: voterId },
      });
      if (voterResponse) {
        throw new Error("RESPONDENT");
      }

      const existingVote = await tx.vote.findFirst({
        where: { promptId, voterId },
      });
      if (existingVote) {
        throw new Error("ALREADY_VOTED");
      }

      await tx.vote.create({
        data: { promptId, voterId, responseId },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RESPONDENT") {
      return NextResponse.json(
        { error: "Cannot vote on a prompt you responded to" },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "ALREADY_VOTED") {
      return NextResponse.json(
        { error: "Already voted on this prompt" },
        { status: 400 }
      );
    }
    // P2002: unique constraint violation -- forfeit vote pre-creation raced with this human vote
    const isPrismaConflict = e != null && typeof e === "object" && "code" in e && (e as Record<string, unknown>).code === "P2002";
    if (isPrismaConflict) {
      return NextResponse.json(
        { error: "Already voted on this prompt" },
        { status: 400 }
      );
    }
    throw e;
  }

  // Check and reveal in background so the human gets an instant response
  after(async () => {
    const allIn = await checkAllVotesForCurrentPrompt(game.id);
    if (allIn) {
      await revealCurrentPrompt(game.id);
    }
  });

  return NextResponse.json({ success: true });
}
