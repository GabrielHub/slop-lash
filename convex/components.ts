import { Presence } from "@convex-dev/presence";
import { Workpool } from "@convex-dev/workpool";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import type { AiPool } from "../src/lib/ai/tasks";

/** Presence users are seats (player IDs) or a display-only host's session ID. */
export const roomPresence = new Presence<Id<"games">, string>(components.presence);

/**
 * AI jobs run in two pools so background work can never delay a call the
 * room is waiting on. Together they stay at 16 parallel actions, under the
 * workpool's advice of 20 across all pools on the free plan (100 on Pro).
 *
 * - critical (8): persona replies and AI ballots. Short calls (seconds) on
 *   the room's critical path; 8 covers a full room of AI voters at once.
 * - background (8): jokes, bot lines, profiles and portraits, taglines and
 *   post-mortems. Hidden behind a timer or the lobby; portraits can hold a
 *   slot for up to a minute.
 */
export const aiWorkpools: Record<AiPool, Workpool> = {
  critical: new Workpool(components.aiCriticalWorkpool, { maxParallelism: 8 }),
  background: new Workpool(components.aiGenerationWorkpool, { maxParallelism: 8 }),
};
