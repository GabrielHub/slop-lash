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

/** `AiFailReason` in `src/lib/ai/run.ts`. */
export const aiFailReasonValidator = v.union(
  v.literal("timeout"),
  v.literal("aborted"),
  v.literal("refused"),
  v.literal("invalid-output"),
  v.literal("length"),
  v.literal("provider-error"),
  v.literal("missing-key"),
);

/** AI SDK's unified `FinishReason`. */
export const aiFinishReasonValidator = v.union(
  v.literal("stop"),
  v.literal("length"),
  v.literal("content-filter"),
  v.literal("tool-calls"),
  v.literal("error"),
  v.literal("other"),
);

/** `AiCallUsage` in `src/lib/ai/usage.ts`: one call's tokens and estimated cost. */
export const aiCallUsageValidator = v.object({
  /** Every input token, cached or not. */
  inputTokens: v.number(),
  /** Every output token, reasoning included. */
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
  reasoningTokens: v.number(),
  costUsd: v.number(),
  /** False when cached tokens were priced as plain input for lack of cache prices. */
  cachePriceKnown: v.boolean(),
});

/** `AiCallRecord` in `src/lib/ai/run.ts`; the `aiCalls` table adds the game and job. */
export const aiCallFields = {
  task: v.string(),
  promptVersion: v.number(),
  modelId: v.string(),
  ok: v.boolean(),
  failReason: v.union(aiFailReasonValidator, v.null()),
  finishReason: v.union(aiFinishReasonValidator, v.null()),
  latencyMs: v.number(),
  attempts: v.number(),
  usage: aiCallUsageValidator,
  error: v.optional(v.string()),
  createdAt: v.number(),
};

export const aiCallRecordValidator = v.object(aiCallFields);
