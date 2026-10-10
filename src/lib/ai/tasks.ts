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
  "slopfight.forge": {
    summary:
      "A champion is submitted (BUILD, UPGRADE, a lenient or house forge): one streamed Haiku call turns the drawing or description into a ForgeResult; also its one repair call.",
    reasoning: "high",
    // Probe (8 full runs, 338 forges, Haiku 5.5 high via the AI Gateway, 4 at
    // a time): output p50 2.4-2.7k tokens (1.4-1.6k thinking), max 5.2k;
    // first part p50 10-12s; totals p50 12-14s, p90 18-22s. The slowest was
    // 33.2s, a 1.7k-token reply that waited 26s for its first part; the
    // next slowest was 27.7s. One 40-leg house forge (before the eight-leg
    // rule) wrote 8.5k tokens in 47.5s. 45s clears every normal forge, and a
    // stuck call still leaves Sonnet time in a 90s BUILD.
    maxOutputTokens: 16_000,
    maxRetries: 1,
    pool: "critical",
    timeout: { floorMs: 12_000, capMs: 45_000 },
  },
  "slopfight.forgeFallback": {
    summary: "A Haiku forge failed or stayed broken after its repair: Sonnet 5.5 forges once.",
    reasoning: "medium",
    // Probe: Sonnet 5.5 at medium forged in 5-12s (first part about 2s).
    maxOutputTokens: 16_000,
    maxRetries: 1,
    pool: "critical",
    timeout: { floorMs: 12_000, capMs: 40_000 },
  },
  "slopfight.house": {
    summary: "The game starts: one call invents descriptions for the house champions.",
    reasoning: "high",
    maxOutputTokens: 8_000,
    maxRetries: 1,
    pool: "critical",
    // Probe: 8s for three descriptions, about 1k output tokens.
    timeout: { floorMs: 8_000, capMs: 30_000 },
  },
  "slopfight.houseFallback": {
    summary: "The house call failed: Sonnet 5.5 invents the descriptions once.",
    reasoning: "medium",
    maxOutputTokens: 8_000,
    maxRetries: 1,
    pool: "critical",
    timeout: { floorMs: 8_000, capMs: 25_000 },
  },
  "slopfight.matchup": {
    summary: "A fight is paired: 2-4 matchup notes and two walk-on lines.",
    reasoning: "high",
    maxOutputTokens: 8_000,
    maxRetries: 1,
    pool: "background",
    timeout: { floorMs: 6_000, capMs: 30_000 },
  },
  "slopfight.matchupFallback": {
    summary: "The matchup call failed: Sonnet 5.5 writes the notes and walk-ons once.",
    reasoning: "medium",
    maxOutputTokens: 8_000,
    maxRetries: 1,
    pool: "background",
    timeout: { floorMs: 6_000, capMs: 25_000 },
  },
  "slopfight.recap": {
    summary: "A fight ends: one highlight line (100 chars max) for the result card and recap.",
    reasoning: "high",
    maxOutputTokens: 6_000,
    maxRetries: 1,
    pool: "background",
    timeout: { floorMs: 4_000, capMs: 20_000 },
  },
  "slopfight.recapFallback": {
    summary: "The recap call failed: Sonnet 5.5 writes the highlight line once.",
    reasoning: "medium",
    maxOutputTokens: 6_000,
    maxRetries: 1,
    pool: "background",
    timeout: { floorMs: 4_000, capMs: 15_000 },
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
