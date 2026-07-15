import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { tryEnqueueChatReplyJob } from "./aiChatReplyData";
import { requireCapability, requirePlayerCapability } from "./capabilities";
import { sanitize } from "../src/lib/sanitize";

const MAX_CHAT_LENGTH = 200;
const MAX_CLIENT_ID_LENGTH = 100;
const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_PLAYER_MESSAGES_PER_WINDOW = 10;
const MAX_ROOM_MESSAGES_PER_WINDOW = 40;

const chatMessageValidator = v.object({
  clientId: v.union(v.string(), v.null()),
  content: v.string(),
  createdAt: v.string(),
  id: v.id("chatMessages"),
  playerId: v.id("players"),
  replyToId: v.union(v.id("chatMessages"), v.null()),
});

function normalizeClientId(clientId: string | undefined): string | undefined {
  const normalized = clientId?.trim().slice(0, MAX_CLIENT_ID_LENGTH);
  return normalized ? normalized : undefined;
}

async function enforceChatAdmission(
  ctx: MutationCtx,
  gameId: Id<"games">,
  playerId: Id<"players">,
  now: number,
): Promise<void> {
  const cutoff = now - CHAT_RATE_LIMIT_WINDOW_MS;
  const [playerMessages, roomMessages] = await Promise.all([
    ctx.db
      .query("chatMessages")
      .withIndex("by_playerId_and_createdAt", (index) =>
        index.eq("playerId", playerId).gte("createdAt", cutoff),
      )
      .take(MAX_PLAYER_MESSAGES_PER_WINDOW),
    ctx.db
      .query("chatMessages")
      .withIndex("by_gameId_and_createdAt", (index) =>
        index.eq("gameId", gameId).gte("createdAt", cutoff),
      )
      .take(MAX_ROOM_MESSAGES_PER_WINDOW),
  ]);
  if (playerMessages.length >= MAX_PLAYER_MESSAGES_PER_WINDOW) {
    throw new ConvexError("Too many messages, please slow down");
  }
  if (roomMessages.length >= MAX_ROOM_MESSAGES_PER_WINDOW) {
    throw new ConvexError("Chat is moving too fast, please slow down");
  }
}

function mapChatMessage(message: {
  _id: import("./_generated/dataModel").Id<"chatMessages">;
  clientId?: string;
  content: string;
  createdAt: number;
  playerId: import("./_generated/dataModel").Id<"players">;
  replyToId?: import("./_generated/dataModel").Id<"chatMessages">;
}) {
  return {
    clientId: message.clientId ?? null,
    content: message.content,
    createdAt: new Date(message.createdAt).toISOString(),
    id: message._id,
    playerId: message.playerId,
    replyToId: message.replyToId ?? null,
  };
}

export const list = query({
  args: {
    capability: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(chatMessageValidator),
  handler: async (ctx, args) => {
    const authorized = await requireCapability(ctx, args.capability);
    if (authorized.game.gameType !== "AI_CHAT_SHOWDOWN") {
      throw new ConvexError("Chat not available for this game type");
    }

    const page = await ctx.db
      .query("chatMessages")
      .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", authorized.game._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map(mapChatMessage),
    };
  },
});

export const send = mutation({
  args: {
    capability: v.string(),
    clientId: v.optional(v.string()),
    content: v.string(),
  },
  returns: chatMessageValidator,
  handler: async (ctx, args) => {
    const authorized = await requirePlayerCapability(ctx, args.capability);
    if (authorized.game.gameType !== "AI_CHAT_SHOWDOWN") {
      throw new ConvexError("Chat not available for this game type");
    }
    if (authorized.game.status === "FINAL_RESULTS") {
      throw new ConvexError("Chat is closed for this game");
    }
    if (
      authorized.player.type === "SPECTATOR" ||
      authorized.player.participationStatus !== "ACTIVE"
    ) {
      throw new ConvexError("Only active players can chat");
    }

    const content = sanitize(args.content, MAX_CHAT_LENGTH);
    if (!content) throw new ConvexError("Message cannot be empty");
    const clientId = normalizeClientId(args.clientId);

    if (clientId) {
      const existing = await ctx.db
        .query("chatMessages")
        .withIndex("by_playerId_and_clientId", (index) =>
          index.eq("playerId", authorized.player._id).eq("clientId", clientId),
        )
        .unique();
      if (existing) return mapChatMessage(existing);
    }

    const now = Date.now();
    await enforceChatAdmission(ctx, authorized.game._id, authorized.player._id, now);
    const messageId = await ctx.db.insert("chatMessages", {
      gameId: authorized.game._id,
      playerId: authorized.player._id,
      ...(authorized.game.currentRound > 0 ? { roundNumber: authorized.game.currentRound } : {}),
      content,
      ...(clientId ? { clientId } : {}),
      createdAt: now,
    });

    if (authorized.player.type === "HUMAN") {
      await tryEnqueueChatReplyJob(ctx, {
        game: authorized.game,
        triggerMessageId: messageId,
        triggerContent: content,
        now,
      });
    }

    return {
      clientId: clientId ?? null,
      content,
      createdAt: new Date(now).toISOString(),
      id: messageId,
      playerId: authorized.player._id,
      replyToId: null,
    };
  },
});
