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

  const existingVote = await prisma.vote.findFirst({
    where: { promptId, voterId },
  });

  if (existingVote) {
    return NextResponse.json(
      { error: "Already voted on this prompt" },
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

  await prisma.vote.create({
    data: { promptId, voterId, responseId },
  });

  const allIn = await checkAllVotesIn(game.id);
  if (allIn) {
    await calculateRoundScores(game.id);
  }

  return NextResponse.json({ success: true });
}
