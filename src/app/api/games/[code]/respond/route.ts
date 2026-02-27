import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/http";
import { logGameEvent } from "@/games/core/observability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ playerId?: unknown; promptId?: unknown; text?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { playerId, promptId, text } = body;
  const validPlayerId = typeof playerId === "string" ? playerId : null;
  const validPromptId = typeof promptId === "string" ? promptId : null;

  if (!validPlayerId || !validPromptId || !text || typeof text !== "string") {
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
    select: { id: true, gameType: true, status: true },
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

  const player = await prisma.player.findFirst({
    where: { id: validPlayerId, gameId: game.id },
    select: { id: true, type: true, participationStatus: true },
  });
  if (!player) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 403 }
    );
  }

  if (player.type === "SPECTATOR") {
    return NextResponse.json(
      { error: "Spectators cannot submit responses" },
      { status: 403 }
    );
  }
  if (player.participationStatus === "DISCONNECTED") {
    return NextResponse.json(
      { error: "Disconnected players cannot submit responses" },
      { status: 403 }
    );
  }

  if (!checkRateLimit(`respond:${validPlayerId}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429 }
    );
  }

  const assignment = await prisma.promptAssignment.findUnique({
    where: { promptId_playerId: { promptId: validPromptId, playerId: validPlayerId } },
    select: { id: true },
  });

  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to this prompt" },
      { status: 403 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.response.findFirst({
        where: { promptId: validPromptId, playerId: validPlayerId },
        select: { id: true },
      });

      if (existing) {
        throw new Error("ALREADY_RESPONDED");
      }

      await tx.response.create({
        data: { promptId: validPromptId, playerId: validPlayerId, text: trimmed },
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

  const def = getGameDefinition(game.gameType);

  logGameEvent("responded", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
    playerId: validPlayerId,
  });

  after(async () => {
    const allIn = await def.handlers.checkAllResponsesIn(game.id);
    if (allIn) {
      const claimed = await def.handlers.startVoting(game.id);
      if (claimed) {
        await def.handlers.generateAiVotes(game.id);
      }
    }
  });

  return NextResponse.json({ success: true });
}
