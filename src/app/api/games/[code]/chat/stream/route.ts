import { prisma } from "@/lib/db";
import { waitForRealtimeEvent } from "@/lib/realtime-events";
import { sseEvent, SSE_HEADERS, SSE_KEEPALIVE_INTERVAL_MS } from "../../sse-helpers";

export const dynamic = "force-dynamic";

const FETCH_LIMIT = 50;

type ChatCursor = {
  createdAt: string;
  id: string;
};

type StreamChatMessage = {
  id: string;
  playerId: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
  clientId: string | null;
};

function compareCursor(a: ChatCursor, b: ChatCursor): number {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  if (aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

function isNewerThanCursor(
  cursor: ChatCursor | null,
  message: { createdAt: string; id: string },
): boolean {
  if (!cursor) return true;
  return compareCursor(cursor, message) < 0;
}

async function fetchChatMessages(
  gameId: string,
  cursor: ChatCursor | null,
): Promise<Array<Omit<StreamChatMessage, "clientId">>> {
  let where:
    | {
        gameId: string;
        createdAt?: { gt: Date };
      }
    | {
        gameId: string;
        OR: Array<{ createdAt: { gt: Date } } | { createdAt: Date; id: { gt: string } }>;
      } = { gameId };

  if (cursor) {
    const afterDate = new Date(cursor.createdAt);
    where = {
      gameId,
      OR: [
        { createdAt: { gt: afterDate } },
        { createdAt: afterDate, id: { gt: cursor.id } },
      ],
    };
  }

  const messages = await prisma.chatMessage.findMany({
    where,
    select: {
      id: true,
      playerId: true,
      content: true,
      replyToId: true,
      createdAt: true,
    },
    orderBy: cursor
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }],
    take: FETCH_LIMIT,
  });

  const ordered = cursor ? messages : [...messages].reverse();
  return ordered.map((message) => ({
    id: message.id,
    playerId: message.playerId,
    content: message.content,
    replyToId: message.replyToId,
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const afterCursor = url.searchParams.get("after");
  const afterId = url.searchParams.get("afterId");
  const initialCursor =
    afterCursor && afterId
      ? { createdAt: afterCursor, id: afterId }
      : null;

  const encoder = new TextEncoder();
  let cursor = initialCursor;
  let lastKeepaliveAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(text: string) {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream already closed.
        }
      }

      function sendKeepalive() {
        const now = Date.now();
        if (now - lastKeepaliveAt >= SSE_KEEPALIVE_INTERVAL_MS) {
          enqueue(": ping\n\n");
          lastKeepaliveAt = now;
        }
      }

      function enqueueMessage(message: StreamChatMessage) {
        enqueue(sseEvent("message", message));
        cursor = { createdAt: message.createdAt, id: message.id };
        lastKeepaliveAt = Date.now();
      }

      async function enqueueBacklog() {
        const game = await prisma.game.findUnique({
          where: { roomCode },
          select: { id: true, gameType: true, status: true },
        });

        if (!game) {
          enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
          return false;
        }

        if (game.gameType !== "AI_CHAT_SHOWDOWN") {
          enqueue(sseEvent("server-error", { code: "UNSUPPORTED", message: "Chat not available" }));
          return false;
        }

        const messages = await fetchChatMessages(game.id, cursor);
        for (const message of messages) {
          enqueueMessage({ ...message, clientId: null });
        }

        if (game.status === "FINAL_RESULTS") {
          enqueue(sseEvent("done", {}));
          return false;
        }

        return game.id;
      }

      async function enqueueMessageById(gameId: string, messageId: string, clientId: string | null) {
        const message = await prisma.chatMessage.findUnique({
          where: { id: messageId },
          select: {
            id: true,
            gameId: true,
            playerId: true,
            content: true,
            replyToId: true,
            createdAt: true,
          },
        });

        if (!message || message.gameId !== gameId) return;
        const serialized = {
          id: message.id,
          playerId: message.playerId,
          content: message.content,
          replyToId: message.replyToId,
          createdAt: message.createdAt.toISOString(),
        };
        if (!isNewerThanCursor(cursor, serialized)) return;
        enqueueMessage({ ...serialized, clientId });
      }

      try {
        const gameId = await enqueueBacklog();
        if (!gameId || typeof gameId !== "string") return;

        while (!request.signal.aborted) {
          const event = await waitForRealtimeEvent(
            { gameId, kinds: ["chat", "state"] },
            request.signal,
            SSE_KEEPALIVE_INTERVAL_MS,
          );
          if (request.signal.aborted) break;

          if (!event) {
            sendKeepalive();
            continue;
          }

          if (event.kind === "chat" && event.chat) {
            await enqueueMessageById(gameId, event.chat.messageId, event.chat.clientId);
            continue;
          }

          if (!(await enqueueBacklog())) {
            break;
          }
        }
      } catch {
        if (!request.signal.aborted) {
          enqueue(sseEvent("server-error", { code: "INTERNAL", message: "Stream error" }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
