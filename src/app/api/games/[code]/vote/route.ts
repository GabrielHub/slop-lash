import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAllVotesIn, calculateRoundScores } from "@/lib/game-logic";

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

  const voterResponse = await prisma.response.findFirst({
    where: { promptId, playerId: voterId },
  });

  if (voterResponse) {
    return NextResponse.json(
      { error: "Cannot vote on a prompt you responded to" },
      { status: 400 }
    );
  }

  // Use transaction to prevent race conditions on duplicate votes
  try {
    await prisma.$transaction(async (tx) => {
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
    if (e instanceof Error && e.message === "ALREADY_VOTED") {
      return NextResponse.json(
        { error: "Already voted on this prompt" },
        { status: 400 }
      );
    }
    throw e;
  }

  const allIn = await checkAllVotesIn(game.id);
  if (allIn) {
    await calculateRoundScores(game.id);
  }

  return NextResponse.json({ success: true });
}
