import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();

  const game = await prisma.game.findUnique({
    where: { roomCode },
    include: {
      players: {
        orderBy: { score: "desc" as const },
      },
      rounds: {
        orderBy: { roundNumber: "asc" as const },
        include: roundsInclude,
      },
      modelUsages: {
        select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
        orderBy: { costUsd: "desc" as const },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Game is still in progress", status: game.status },
      { status: 400 }
    );
  }

  return NextResponse.json(game);
}
