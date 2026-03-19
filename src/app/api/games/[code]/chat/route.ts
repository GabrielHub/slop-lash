import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { sanitize } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/http";
import { generateAiChatReply } from "@/games/ai-chat-showdown/ai-chat-reply";
import { publishChatEvent } from "@/lib/realtime-events";

const MAX_CHAT_LENGTH = 200;

export async function GET() {
  return NextResponse.json(
    { error: "Chat snapshot endpoint has been retired. Use the SSE chat stream instead." },
    { status: 410 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await parseJsonBody<{
    playerId?: unknown;
    content?: unknown;
    clientId?: unknown;
  }>(request);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { playerId, content, clientId } = body;
  const validClientId = typeof clientId === "string" ? clientId : null;

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

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: { id: true, gameType: true, status: true, currentRound: true },
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
  if (game.status === "FINAL_RESULTS") {
    return NextResponse.json(
      { error: "Chat is closed for this game" },
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
  if (!checkRateLimit(`chat:${player.id}`, 10, 10_000)) {
    return NextResponse.json(
      { error: "Too many messages, please slow down" },
      { status: 429 },
    );
  }
  if (!checkRateLimit(`chat-game:${game.id}`, 40, 10_000)) {
    return NextResponse.json(
      { error: "Chat is moving too fast, please slow down" },
      { status: 429 },
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
  await publishChatEvent(game.id, {
    clientId: validClientId,
    messageId: message.id,
    createdAt: message.createdAt.toISOString(),
  });

  // Fire-and-forget: check if a human message mentions an AI player
  if (player.type !== "AI") {
    after(() => generateAiChatReply(game.id, message.id, trimmed));
  }

  return NextResponse.json({
    id: message.id,
    createdAt: message.createdAt.toISOString(),
    clientId: validClientId,
  });
}
