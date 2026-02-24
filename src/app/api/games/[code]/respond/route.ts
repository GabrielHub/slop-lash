import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAllResponsesIn, startVoting } from "@/lib/game-logic";

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

  const existing = await prisma.response.findFirst({
    where: { promptId, playerId },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Already responded to this prompt" },
      { status: 400 }
    );
  }

  await prisma.response.create({
    data: { promptId, playerId, text: text.trim() },
  });

  const allIn = await checkAllResponsesIn(game.id);
  if (allIn) {
    await startVoting(game.id);
  }

  return NextResponse.json({ success: true });
}
