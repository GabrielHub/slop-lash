import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getVotablePrompts, checkAllVotesForCurrentPrompt, revealCurrentPrompt } from "@/lib/game-logic";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/http";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ voterId?: unknown; promptId?: unknown; responseId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { voterId, promptId, responseId } = body;
  const validVoterId = typeof voterId === "string" ? voterId : null;
  const validPromptId = typeof promptId === "string" ? promptId : null;

  const validResponseId =
    responseId == null ? null :
    typeof responseId === "string" ? responseId :
    undefined;

  if (!validVoterId || !validPromptId || validResponseId === undefined) {
    return NextResponse.json(
      { error: "voterId and promptId are required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, status: true, votingPromptIndex: true, votingRevealing: true },
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

  if (!currentPrompt || currentPrompt.id !== validPromptId) {
    return NextResponse.json(
      { error: "Not the current prompt" },
      { status: 400 }
    );
  }

  // Verify voter belongs to this game
  const voter = await prisma.player.findFirst({
    where: { id: validVoterId, gameId: game.id },
    select: { id: true, type: true },
  });
  if (!voter) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 403 }
    );
  }
  if (voter.type === "SPECTATOR") {
    return NextResponse.json(
      { error: "Spectators cannot vote" },
      { status: 403 }
    );
  }

  // Per-player rate limit
  if (!checkRateLimit(`vote:${validVoterId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
    );
  }

  // Verify response belongs to this prompt (skip for abstain votes)
  if (validResponseId) {
    const response = await prisma.response.findFirst({
      where: { id: validResponseId, promptId: validPromptId },
      select: { id: true },
    });
    if (!response) {
      return NextResponse.json(
        { error: "Response does not belong to this prompt" },
        { status: 400 }
      );
    }
  }

  // Use transaction to prevent race conditions on self-vote and duplicate votes
  try {
    await prisma.$transaction(async (tx) => {
      const voterResponse = await tx.response.findFirst({
        where: { promptId: validPromptId, playerId: validVoterId },
        select: { id: true },
      });
      if (voterResponse) {
        throw new Error("RESPONDENT");
      }

      const existingVote = await tx.vote.findFirst({
        where: { promptId: validPromptId, voterId: validVoterId },
        select: { id: true },
      });
      if (existingVote) {
        throw new Error("ALREADY_VOTED");
      }

      await tx.vote.create({
        data: { promptId: validPromptId, voterId: validVoterId, responseId: validResponseId },
      });

      // Bump version so pollers pick up the new vote
      await tx.game.update({
        where: { id: game.id },
        data: { version: { increment: 1 } },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RESPONDENT") {
      return NextResponse.json(
        { error: "Cannot vote on a prompt you responded to" },
        { status: 400 }
      );
    }
    // ALREADY_VOTED (explicit check) or P2002 (unique constraint race with forfeit pre-creation)
    if (
      (e instanceof Error && e.message === "ALREADY_VOTED") ||
      hasPrismaErrorCode(e, "P2002")
    ) {
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
