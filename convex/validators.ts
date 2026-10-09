import { v } from "convex/values";

export const gameTypeValidator = v.union(
  v.literal("SLOPLASH"),
  v.literal("MATCHSLOP"),
  v.literal("QUIZSLOP"),
);

/** Coarse room lifecycle. The mode-specific step lives in `games.phase`. */
export const gameStatusValidator = v.union(
  v.literal("LOBBY"),
  v.literal("PLAYING"),
  v.literal("FINISHED"),
);

export const playerTypeValidator = v.union(v.literal("HUMAN"), v.literal("AI"));

export const ttsModeValidator = v.union(v.literal("OFF"), v.literal("ON"));

export const matchSlopIdentityValidator = v.union(
  v.literal("MAN"),
  v.literal("WOMAN"),
  v.literal("NON_BINARY"),
  v.literal("OTHER"),
);

export const jobStatusValidator = v.union(
  v.literal("QUEUED"),
  v.literal("SUCCEEDED"),
  v.literal("FAILED"),
  v.literal("CANCELED"),
);

export const aiUsageValidator = v.object({
  modelId: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
});
