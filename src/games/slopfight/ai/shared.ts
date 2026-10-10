import type { AiProviderKeys } from "@/lib/ai-gateway";
import type { AiCallRecord, AiFailReason, AiRunResult, LanguageModelInstance } from "@/lib/ai/run";
import { decodeXmlEntities } from "@/lib/ai/xml";

/** SlopFight's model in every room, Free Play included (build decision 12). */
export const SLOPFIGHT_MODEL_ID = "anthropic/claude-haiku-5.5";
/** The better model a failed Haiku call falls back to, never a template. */
export const SLOPFIGHT_FALLBACK_MODEL_ID = "anthropic/claude-sonnet-5.5";

/**
 * Test and probe seam: a model object to call instead of resolving the catalog
 * id, or a function that picks one per catalog id (so the Haiku call and the
 * Sonnet fallback can be told apart).
 */
export type ModelSource = LanguageModelInstance | ((modelId: string) => LanguageModelInstance);

export interface CallOptions {
  keys: AiProviderKeys;
  /** The phase deadline (ms since epoch), or null when timers are off. */
  deadline: number | null;
  languageModel?: ModelSource;
  abortSignal?: AbortSignal;
  /** Clock for latency and budgets; for tests. */
  now?: () => number;
}

const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s|$)/gu;
/** A clause break: a comma, semicolon or colon before a space, or a dash between words. */
const CLAUSE_BREAK = /[,;:](?=\s)|\s[—–-]\s|—/gu;
const ENDS_SENTENCE = /[.!?…]["'”’)\]]*$/u;

/** Where the last match that fits in `max` characters ends (sentences) or starts (clauses); -1 for none. */
function lastBreak(text: string, pattern: RegExp, max: number, at: "end" | "start"): number {
  let found = -1;
  for (const match of text.matchAll(pattern)) {
    const position = at === "end" ? match.index + match[0].length : match.index;
    if (position > max) break;
    found = position;
  }
  return found;
}

/**
 * Model text for a field capped at `max` characters: entities decoded and,
 * when it runs over, cut back so it still reads as a whole thought. Models
 * overshoot character caps by a few words, and a shorter whole sentence reads
 * better than one cut mid-clause. In order of preference:
 * 1. the last whole sentence that fits, when it keeps 60% of the room;
 * 2. the longer of that sentence (if it keeps a third of the room) and the
 *    text up to the last clause break that fits, closed with a full stop (if
 *    it keeps a quarter): "Try an invented pop star: a sequined hedgehog
 *    with a microphone and a sold-out crowd" becomes "Try an invented pop star.";
 * 3. the text unchanged, for `cleanText` to cut at a word boundary.
 * `cleanText` still enforces the cap on whatever this returns.
 */
export function modelText(text: string, max: number): string {
  const decoded = decodeXmlEntities(text).trim();
  if (decoded.length <= max) return decoded;
  const sentenceEnd = lastBreak(decoded, SENTENCE_END, max, "end");
  if (sentenceEnd >= max * 0.6) return decoded.slice(0, sentenceEnd);
  const sentence = sentenceEnd >= max / 3 ? decoded.slice(0, sentenceEnd) : "";
  // One character is kept free for the full stop that closes a clause.
  const clauseStart = lastBreak(decoded, CLAUSE_BREAK, max - 1, "start");
  const head = clauseStart > 0 ? decoded.slice(0, clauseStart).trimEnd() : "";
  const clause = !head ? "" : ENDS_SENTENCE.test(head) ? head : `${head}.`;
  const best = clause.length >= max / 4 && clause.length > sentence.length ? clause : sentence;
  return best || decoded;
}

/** Every wrapper's result: what it got plus every call made, for `aiCalls`. */
export type AiOutcome<Fields> =
  | ({ ok: true; calls: AiCallRecord[] } & Fields)
  | { ok: false; failReason: AiFailReason; calls: AiCallRecord[] };

export function modelFor(source: ModelSource | undefined, modelId: string) {
  if (!source) return {};
  return { languageModel: typeof source === "function" ? source(modelId) : source };
}

/** The shared options for one call on `modelId`. */
export function callSettings(options: CallOptions, modelId: string) {
  return {
    model: modelId,
    keys: options.keys,
    deadline: options.deadline,
    ...modelFor(options.languageModel, modelId),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    ...(options.now ? { now: options.now } : {}),
  };
}

/** Why a call's output could not be used: the provider's reason, or `invalid-output` for a bad reply. */
export function failReasonOf(result: AiRunResult<unknown> | undefined): AiFailReason {
  return result && !result.ok ? result.failReason : "invalid-output";
}

/**
 * A non-forge call: Haiku first, then Sonnet once on any failure (a refusal
 * included) or when `accept` finds the output unusable. `attempt` runs one
 * call on the given model and task; `accept` turns its output into the
 * wrapper's fields, or null when it cannot be used.
 */
export async function withFallback<Output, Fields>(
  attempt: (modelId: string, fallback: boolean) => Promise<AiRunResult<Output>>,
  accept: (output: Output) => Fields | null,
): Promise<AiOutcome<Fields>> {
  const calls: AiCallRecord[] = [];
  let last: AiRunResult<Output> | undefined;
  for (const [modelId, fallback] of [
    [SLOPFIGHT_MODEL_ID, false],
    [SLOPFIGHT_FALLBACK_MODEL_ID, true],
  ] as const) {
    last = await attempt(modelId, fallback);
    calls.push(last.call);
    if (last.ok) {
      const fields = accept(last.output);
      if (fields !== null) return { ok: true, ...fields, calls };
    } else if (last.failReason === "aborted") {
      break;
    }
  }
  return { ok: false, failReason: failReasonOf(last), calls };
}
