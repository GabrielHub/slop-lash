import type { AiReasoning } from "../ai-reasoning";

/**
 * Workpool a job runs in. `critical` holds calls the room waits on (persona
 * replies, ballots); `background` holds calls hidden behind a timer or the
 * lobby (jokes, bot lines, profiles, taglines, post-mortems).
 */
export type AiPool = "critical" | "background";

/**
 * Settings for one kind of AI call. Prompts live with their game; the task
 * fixes how the call runs. See docs/ai-calls.md for when each one fires.
 *
 * Prompt versions: every call passes `promptVersion`, an integer the owning
 * game's prompt module exports per task and bumps whenever the instructions,
 * schema, examples or message layout change. `aiCalls` rows carry it, so
 * results can be compared across versions.
 */
export interface AiTaskSpec {
  /** When the call fires and what it returns. */
  summary: string;
  reasoning: AiReasoning;
  /**
   * Output cap. Thinking tokens count against it, so it covers the expected
   * output plus thinking headroom; hitting it fails the call as `length`.
   */
  maxOutputTokens: number;
  /**
   * SDK retries for transient provider errors (429, 5xx), all inside the
   * timeout. A retry whose wait (`retry-after` or backoff) plus `floorMs`
   * does not fit in the time left is not made: the call fails at once as
   * `provider-error`.
   */
  maxRetries: number;
  pool: AiPool;
  /**
   * The call's budget is `deadline - now - 1.5s`, capped at `capMs`; without
   * a deadline (timers off, lobby) it is `capMs`. `floorMs` is the least time
   * worth a request: a budget under it skips the call (`timeout`, no request).
   */
  timeout: { floorMs: number; capMs: number };
}

export const AI_TASKS = {
  "sloplash.jokes": {
    summary: "WRITING starts: one call per AI seat answers all of its prompts.",
    reasoning: "minimal",
    maxOutputTokens: 8_000,
    maxRetries: 2,
    pool: "background",
    timeout: { floorMs: 5_000, capMs: 45_000 },
  },
  "sloplash.ballots": {
    summary: "WRITING closes: one call per AI voter picks a side in every matchup it may vote on.",
    reasoning: "none",
    maxOutputTokens: 4_000,
    maxRetries: 1,
    pool: "critical",
    timeout: { floorMs: 3_000, capMs: 20_000 },
  },
  "sloplash.tagline": {
    summary: "ROUND_RESULTS or FINAL starts: one line (100 chars max) for the leading AI.",
    reasoning: "none",
    maxOutputTokens: 2_000,
    maxRetries: 1,
    pool: "background",
    timeout: { floorMs: 2_000, capMs: 10_000 },
  },
  "matchslop.profile": {
    summary: "Room created: the persona's profile, including its portrait prompt.",
    reasoning: "minimal",
    maxOutputTokens: 12_000,
    maxRetries: 2,
    pool: "background",
    timeout: { floorMs: 10_000, capMs: 45_000 },
  },
  "matchslop.botLine": {
    summary: "WRITING starts: one opener or follow-up line per AI seat.",
    reasoning: "minimal",
    maxOutputTokens: 6_000,
    maxRetries: 2,
    pool: "background",
    timeout: { floorMs: 5_000, capMs: 40_000 },
  },
  "matchslop.vote": {
    summary: "VOTING starts: one call per AI voter picks the line most likely to win her over.",
    reasoning: "none",
    maxOutputTokens: 2_000,
    maxRetries: 1,
    pool: "critical",
    timeout: { floorMs: 3_000, capMs: 20_000 },
  },
  "matchslop.reply": {
    summary: "SENT starts: the persona judges the sent line (a level) and replies in character.",
    reasoning: "minimal",
    maxOutputTokens: 6_000,
    maxRetries: 1,
    pool: "critical",
    timeout: { floorMs: 5_000, capMs: 20_000 },
  },
  "matchslop.postMortem": {
    summary: "FINAL starts: the persona's in-character recap of the chat.",
    reasoning: "minimal",
    maxOutputTokens: 8_000,
    maxRetries: 2,
    pool: "background",
    timeout: { floorMs: 10_000, capMs: 40_000 },
  },
  "narrator.line": {
    summary: "Host screen cue: one short spoken line before text-to-speech.",
    reasoning: "none",
    maxOutputTokens: 1_000,
    maxRetries: 0,
    pool: "background",
    timeout: { floorMs: 3_000, capMs: 3_000 },
  },
} as const satisfies Record<string, AiTaskSpec>;

export type AiTaskId = keyof typeof AI_TASKS;

export const AI_TASK_IDS = Object.keys(AI_TASKS) as AiTaskId[];

export function getAiTask(task: AiTaskId): AiTaskSpec {
  return AI_TASKS[task];
}
