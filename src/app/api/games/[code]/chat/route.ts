import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/http";

const MAX_CHAT_LENGTH = 200;
const FETCH_LIMIT = 50;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const afterId = url.searchParams.get("afterId");

  const game = await prisma.game.findUnique({
    where: { roomCode },
    select: { id: true, gameType: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.gameType !== "AI_CHAT_SHOWDOWN") {
    return NextResponse.json(
      { error: "Chat not available for this game type" },
      { status: 400 },
    );
  }

  let where:
    | {
        gameId: string;
        createdAt?: { gt: Date };
      }
    | {
        gameId: string;
        OR: Array<{ createdAt: { gt: Date } } | { createdAt: Date; id: { gt: string } }>;
      } = { gameId: game.id };

  if (after) {
    const afterDate = new Date(after);
    if (isNaN(afterDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'after' timestamp" },
        { status: 400 },
      );
    }
    // Stable cursor when multiple rows share the same createdAt timestamp.
    if (afterId) {
      where = {
        gameId: game.id,
        OR: [
          { createdAt: { gt: afterDate } },
          { createdAt: afterDate, id: { gt: afterId } },
        ],
      };
    } else {
      where = { gameId: game.id, createdAt: { gt: afterDate } };
    }
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    select: {
      id: true,
      playerId: true,
      content: true,
      createdAt: true,
    },
    // Bootstrap with newest-first when no cursor, then normalize to ascending for clients.
    orderBy: after
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }],
    take: FETCH_LIMIT,
  });

  const ordered = after ? messages : [...messages].reverse();

  return NextResponse.json({
    messages: ordered.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await parseJsonBody<{
    playerId?: unknown;
    content?: unknown;
  }>(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { playerId, content } = body;

  if (typeof playerId !== "string" || typeof content !== "string") {
    return NextResponse.json(
      { error: "playerId and content are required" },
      { status: 400 },
    );
  }

  const trimmed = sanitize(content, MAX_CHAT_LENGTH);
  if (!trimmed) {
    return NextResponse.json(
      { error: "Message cannot be empty" },
      { status: 400 },
    );
  }

  if (!checkRateLimit(`chat:${playerId}`, 10, 10_000)) {
    return NextResponse.json(
      { error: "Too many messages, please slow down" },
      { status: 429 },
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, gameType: true, currentRound: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.gameType !== "AI_CHAT_SHOWDOWN") {
    return NextResponse.json(
      { error: "Chat not available for this game type" },
      { status: 400 },
    );
  }

  const player = await prisma.player.findFirst({
    where: { id: playerId, gameId: game.id },
    select: { id: true, type: true, participationStatus: true },
  });

  if (!player) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 403 },
    );
  }

  if (player.type === "SPECTATOR") {
    return NextResponse.json(
      { error: "Spectators cannot chat" },
      { status: 403 },
    );
  }
  if (player.participationStatus === "DISCONNECTED") {
    return NextResponse.json(
      { error: "Disconnected players cannot chat" },
      { status: 403 },
    );
  }

  const message = await prisma.chatMessage.create({
    data: {
      gameId: game.id,
      playerId: player.id,
      roundNumber: game.currentRound > 0 ? game.currentRound : null,
      content: trimmed,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({
    id: message.id,
    createdAt: message.createdAt.toISOString(),
  });
}
