import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidReactionEmoji } from "@/lib/reactions";
import { parseJsonBody } from "@/lib/http";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { bumpReactionsVersion } from "@/lib/reactions-version";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown; responseId?: unknown; emoji?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerId, responseId, emoji } = body;

  if (typeof playerId !== "string" || typeof responseId !== "string" || typeof emoji !== "string") {
    return NextResponse.json(
      { error: "playerId, responseId, and emoji are required" },
      { status: 400 },
    );
  }

  if (!isValidReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  if (!checkRateLimit(`react:${playerId}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 },
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, status: true, currentRound: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "VOTING") {
    return NextResponse.json(
      { error: "Reactions are only allowed during voting" },
      { status: 400 },
    );
  }

  const [player, response] = await Promise.all([
    prisma.player.findFirst({
      where: { id: playerId, gameId: game.id },
      select: { id: true, participationStatus: true },
    }),
    prisma.response.findFirst({
      where: {
        id: responseId,
        prompt: { round: { gameId: game.id, roundNumber: game.currentRound } },
      },
      select: { id: true },
    }),
  ]);

  if (!player) {
    return NextResponse.json({ error: "Player not in this game" }, { status: 403 });
  }
  if (player.participationStatus === "DISCONNECTED") {
    return NextResponse.json({ error: "Disconnected players cannot react" }, { status: 403 });
  }
  if (!response) {
    return NextResponse.json({ error: "Response not found in this game" }, { status: 400 });
  }

  // Toggle: delete if exists, create if not
  const existing = await prisma.reaction.findUnique({
    where: { responseId_playerId_emoji: { responseId, playerId, emoji } },
    select: { id: true },
  });

  let added: boolean;
  if (existing) {
    try {
      await prisma.reaction.delete({ where: { id: existing.id } });
      added = false;
    } catch (e) {
      // P2025: concurrent delete already removed it — still gone
      if (!hasPrismaErrorCode(e, "P2025")) throw e;
      added = false;
    }
  } else {
    try {
      await prisma.reaction.create({ data: { responseId, playerId, emoji } });
      added = true;
    } catch (e) {
      // P2002: unique constraint race — already exists
      if (!hasPrismaErrorCode(e, "P2002")) throw e;
      added = true;
    }
  }

  await bumpReactionsVersion(game.id);

  return NextResponse.json({ success: true, added });
}
