import presence from "@convex-dev/presence/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    FAL_KEY: v.optional(v.string()),
    GEMINI_API_KEY: v.optional(v.string()),
    HOST_SECRET: v.optional(v.string()),
  },
});

app.use(presence);
app.use(workpool, { name: "aiGenerationWorkpool" });
app.use(workflow);

export default app;
