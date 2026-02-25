import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { LEADERBOARD_TAG } from "@/lib/game-constants";
import { endGameEarly } from "@/lib/game-logic";
import { parseJsonBody } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerId } = body;

  if (!playerId || typeof playerId !== "string") {
    return NextResponse.json(
      { error: "playerId is required" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (playerId !== game.hostPlayerId) {
    return NextResponse.json(
      { error: "Only the host can end the game" },
      { status: 403 }
    );
  }

  if (game.status === "LOBBY" || game.status === "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Cannot end game in current state" },
      { status: 400 }
    );
  }

  await endGameEarly(game.id);
  revalidateTag(LEADERBOARD_TAG, { expire: 0 });
  return NextResponse.json({ success: true });
}
