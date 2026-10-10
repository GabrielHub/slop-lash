import presence from "@convex-dev/presence/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    ANTHROPIC_API_KEY: v.optional(v.string()),
    FAL_KEY: v.optional(v.string()),
    FREE_PLAY_DAILY_GAME_LIMIT: v.optional(v.string()),
    HOST_SECRET: v.optional(v.string()),
  },
});

app.use(presence);
// Background AI jobs (the original pool) and calls the room waits on; see components.ts.
app.use(workpool, { name: "aiGenerationWorkpool" });
app.use(workpool, { name: "aiCriticalWorkpool" });

export default app;
