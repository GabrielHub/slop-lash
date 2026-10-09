import { v } from "convex/values";
import { env, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getFreePlayDay, parseFreePlayDailyGameLimit } from "../src/lib/free-play";

/** Without Claude credentials Free Play has no writer, so it is switched off. */
export function isFreePlayConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

async function loadFreePlayDay(ctx: QueryCtx, now: number) {
  const day = getFreePlayDay(now);
  const usage = await ctx.db
    .query("freePlayUsage")
    .withIndex("by_day", (index) => index.eq("day", day))
    .unique();
  const gamesCreated = usage?.gamesCreated ?? 0;
  const gamesLeft = Math.max(
    0,
    parseFreePlayDailyGameLimit(env.FREE_PLAY_DAILY_GAME_LIMIT) - gamesCreated,
  );
  return { day, usage, gamesCreated, gamesLeft };
}

/** Counts a Free Play room against today's cap; false once the cap is spent. */
export async function claimFreePlaySlot(ctx: MutationCtx, now: number): Promise<boolean> {
  const { day, usage, gamesCreated, gamesLeft } = await loadFreePlayDay(ctx, now);
  if (gamesLeft === 0) return false;
  if (usage) await ctx.db.patch("freePlayUsage", usage._id, { gamesCreated: gamesCreated + 1 });
  else await ctx.db.insert("freePlayUsage", { day, gamesCreated: 1 });
  return true;
}

/** Public availability for the host page; reveals no secrets. */
export const status = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    gamesLeftToday: v.number(),
  }),
  handler: async (ctx) => ({
    configured: isFreePlayConfigured(),
    gamesLeftToday: (await loadFreePlayDay(ctx, Date.now())).gamesLeft,
  }),
});
