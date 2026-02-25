import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidReactionEmoji } from "@/lib/reactions";

function isPrismaCode(e: unknown, code: string): boolean {
  return e != null && typeof e === "object" && "code" in e && (e as Record<string, unknown>).code === code;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { playerId, responseId, emoji } = await request.json();

  if (!playerId || !responseId || !emoji) {
    return NextResponse.json(
      { error: "playerId, responseId, and emoji are required" },
      { status: 400 }
    );
  }

  if (!isValidReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  // Per-player rate limit (check early to avoid unnecessary DB work)
  if (!checkRateLimit(`react:${playerId}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
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
      { error: "Reactions are only allowed during voting" },
      { status: 400 }
    );
  }

  // Verify player and response belong to this game's current round (parallel)
  const [player, response] = await Promise.all([
    prisma.player.findFirst({ where: { id: playerId, gameId: game.id } }),
    prisma.response.findFirst({
      where: {
        id: responseId,
        prompt: { round: { gameId: game.id, roundNumber: game.currentRound } },
      },
    }),
  ]);

  if (!player) {
    return NextResponse.json({ error: "Player not in this game" }, { status: 403 });
  }
  if (!response) {
    return NextResponse.json({ error: "Response not found in this game" }, { status: 400 });
  }

  // Toggle: delete if exists, create if not
  const existing = await prisma.reaction.findUnique({
    where: { responseId_playerId_emoji: { responseId, playerId, emoji } },
  });

  if (existing) {
    try {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } catch (e) {
      // P2025: concurrent delete already removed it — treat as success
      if (!isPrismaCode(e, "P2025")) throw e;
    }
  } else {
    try {
      await prisma.reaction.create({ data: { responseId, playerId, emoji } });
    } catch (e) {
      // P2002: unique constraint race — treat as already exists (no-op)
      if (!isPrismaCode(e, "P2002")) throw e;
    }
  }

  // Bump version so polling picks up the change
  await prisma.game.update({
    where: { id: game.id },
    data: { version: { increment: 1 } },
  });

  return NextResponse.json({ success: true, added: !existing });
}
