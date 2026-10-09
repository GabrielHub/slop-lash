import { Presence } from "@convex-dev/presence";
import { Workpool } from "@convex-dev/workpool";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";

/** Presence users are seats (player IDs) or a display-only host's session ID. */
export const roomPresence = new Presence<Id<"games">, string>(components.presence);

export const aiWorkpool = new Workpool(components.aiGenerationWorkpool, {
  maxParallelism: 8,
});
