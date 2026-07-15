import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCapability } from "./capabilities";
import { roomPresence } from "./components";

const MAX_PRESENCE_USERS = 16;
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_ACTIVE_TABS_PER_CAPABILITY = 4;
const STALE_TAB_SESSION_MS = MAX_HEARTBEAT_INTERVAL_MS * 3;
const DURABLE_SESSION_ACTIVITY_REFRESH_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validateHeartbeat(interval: number, sessionId: string): void {
  if (
    !Number.isFinite(interval) ||
    !Number.isInteger(interval) ||
    interval < MIN_HEARTBEAT_INTERVAL_MS ||
    interval > MAX_HEARTBEAT_INTERVAL_MS
  ) {
    throw new ConvexError("Invalid presence heartbeat interval");
  }
  if (!UUID_PATTERN.test(sessionId)) {
    throw new ConvexError("Invalid presence session ID");
  }
}

export const heartbeat = mutation({
  args: {
    capability: v.string(),
    interval: v.number(),
    sessionId: v.string(),
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, args) => {
    validateHeartbeat(args.interval, args.sessionId);
    const authorized = await requireCapability(ctx, args.capability);
    const now = Date.now();
    const existingTab = await ctx.db
      .query("roomPresenceSessions")
      .withIndex("by_tabSessionId", (index) => index.eq("tabSessionId", args.sessionId))
      .unique();
    if (
      existingTab &&
      (existingTab.gameId !== authorized.game._id ||
        existingTab.roomSessionId !== authorized.session._id)
    ) {
      throw new ConvexError("Presence session is already bound to another room capability");
    }

    const capabilityTabs = await ctx.db
      .query("roomPresenceSessions")
      .withIndex("by_roomSessionId", (index) => index.eq("roomSessionId", authorized.session._id))
      .take(MAX_ACTIVE_TABS_PER_CAPABILITY + 8);
    const activeTabs = [];
    for (const tab of capabilityTabs) {
      if (tab.lastHeartbeatAt < now - STALE_TAB_SESSION_MS) {
        if (tab._id !== existingTab?._id) {
          await ctx.db.delete("roomPresenceSessions", tab._id);
        }
      } else {
        activeTabs.push(tab);
      }
    }
    if (!existingTab && activeTabs.length >= MAX_ACTIVE_TABS_PER_CAPABILITY) {
      throw new ConvexError("Too many active presence sessions for this room capability");
    }

    const result = await roomPresence.heartbeat(
      ctx,
      authorized.game._id,
      authorized.session._id,
      args.sessionId,
      args.interval,
    );
    if (existingTab) {
      await ctx.db.patch("roomPresenceSessions", existingTab._id, {
        lastHeartbeatAt: now,
        sessionToken: result.sessionToken,
      });
    } else {
      await ctx.db.insert("roomPresenceSessions", {
        gameId: authorized.game._id,
        roomSessionId: authorized.session._id,
        tabSessionId: args.sessionId,
        sessionToken: result.sessionToken,
        lastHeartbeatAt: now,
      });
    }
    if (now - authorized.session.lastSeenAt >= DURABLE_SESSION_ACTIVITY_REFRESH_MS) {
      await ctx.db.patch("playerSessions", authorized.session._id, { lastSeenAt: now });
    }
    return result;
  },
});

export const list = query({
  args: { capability: v.string() },
  returns: v.array(
    v.object({
      lastDisconnected: v.number(),
      online: v.boolean(),
      userId: v.id("playerSessions"),
    }),
  ),
  handler: async (ctx, args) => {
    const authorized = await requireCapability(ctx, args.capability);
    return roomPresence.listRoom(ctx, authorized.game._id, false, MAX_PRESENCE_USERS);
  },
});

// The component session token is an opaque bearer issued only after an
// authenticated heartbeat. This endpoint intentionally stays compatible with
// sendBeacon, which cannot attach the room capability during page teardown.
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lease = await ctx.db
      .query("roomPresenceSessions")
      .withIndex("by_sessionToken", (index) => index.eq("sessionToken", args.sessionToken))
      .unique();
    if (lease) await ctx.db.delete("roomPresenceSessions", lease._id);
    await roomPresence.disconnect(ctx, args.sessionToken);
    return null;
  },
});
