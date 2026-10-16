import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireViewer } from "./capabilities";
import { roomPresence } from "./components";
import { maintainFromHeartbeat } from "./engine";
import { presenceUserId } from "./roster";

const MIN_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 30_000;
const TAB_ID_PATTERN = /^[0-9a-f-]{16,64}$/iu;

/**
 * Keeps this tab's seat marked as here. Also returns the server clock, which
 * the client uses to line its countdowns up with the real deadlines.
 */
export const heartbeat = mutation({
  args: { capability: v.string(), tabId: v.string(), interval: v.number() },
  returns: v.object({ sessionToken: v.string(), serverNow: v.number() }),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.interval) ||
      args.interval < MIN_INTERVAL_MS ||
      args.interval > MAX_INTERVAL_MS ||
      !TAB_ID_PATTERN.test(args.tabId)
    ) {
      throw new ConvexError("Invalid presence heartbeat");
    }
    const { game, session, player } = await requireViewer(ctx, args.capability);
    const userId = presenceUserId(session, player);
    // A seat belongs to one game; rematches clear old display-host presence.
    // Read just this user's status before the heartbeat marks it online, so a
    // returning phone gets grace even while the TV keeps the room active.
    const previousPresence = await roomPresence.listUser(ctx, userId, false, 1);
    const reconnecting = !previousPresence.some(
      (entry) => entry.roomId === game._id && entry.online,
    );
    const { sessionToken } = await roomPresence.heartbeat(
      ctx,
      game._id,
      userId,
      args.tabId,
      args.interval,
    );
    await maintainFromHeartbeat(ctx, game, reconnecting);
    return { sessionToken, serverNow: Date.now() };
  },
});

/**
 * The server clock alone, for a screen with no seat (a TV opened at
 * /stage/CODE). It has no heartbeat, but its countdowns and SlopFight's
 * replayed fights must still run on the server's clock, not the device's.
 */
export const clock = mutation({
  args: {},
  returns: v.object({ serverNow: v.number() }),
  handler: async () => ({ serverNow: Date.now() }),
});

/**
 * Marks a tab as gone. Takes only the opaque token so `navigator.sendBeacon`
 * can call it while the page unloads.
 */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await roomPresence.disconnect(ctx, args.sessionToken);
  },
});
