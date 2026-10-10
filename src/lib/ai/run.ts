import {
  generateText,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  streamText,
  wrapLanguageModel,
  type FinishReason,
  type InferGenerateOutput,
  type InferStreamOutput,
  type LanguageModel,
  type LanguageModelMiddleware,
  type LanguageModelUsage,
  type ModelMessage,
  type OutputInterface,
  type SystemModelMessage,
} from "ai";
import {
  getLanguageModel,
  getModelRoute,
  hasProviderKey,
  type AiProviderKeys,
  type ModelRoute,
} from "../ai-gateway";
import type { AiReasoning } from "../ai-reasoning";
import {
  classifyStop,
  createAttemptLog,
  describeAiError,
  guardAttempt,
  isCallerError,
  type AttemptLog,
  type AttemptPolicy,
} from "./attempts";
import { callBudget, callSignal } from "./deadline";
import {
  buildInstructions,
  cachingProviderOptions,
  countCacheBreakpoints,
  limitMessageBreakpoints,
  MAX_CACHE_BREAKPOINTS,
  type InstructionBlock,
} from "./prompt";
import { getAiTask, type AiTaskId } from "./tasks";
import { normalizeUsage, type AiCallUsage } from "./usage";

/**
 * Why a call produced nothing usable.
 * - `timeout`: the deadline-derived budget ran out, or was under the task's
 *   floor so no request was made (`attempts: 0`).
 * - `aborted`: the caller's `abortSignal` fired.
 * - `refused`: the provider declined (finish reason `content-filter`, or a decision refusal).
 * - `invalid-output`: the reply did not parse, match the schema, or was empty.
 * - `length`: the output cap was hit (thinking counts against it).
 * - `provider-error`: an API, network or gateway error, after the SDK's retries;
 *   also a retryable error (e.g. a 429) whose retry the budget cannot cover.
 * - `missing-key`: the provider key this model needs is not configured.
 */
export type AiFailReason =
  | "timeout"
  | "aborted"
  | "refused"
  | "invalid-output"
  | "length"
  | "provider-error"
  | "missing-key";

/** One AI call as an `aiCalls` row (the table adds `gameId` and `jobId`). */
export interface AiCallRecord {
  task: string;
  promptVersion: number;
  modelId: string;
  ok: boolean;
  failReason: AiFailReason | null;
  finishReason: FinishReason | null;
  latencyMs: number;
  /** Model requests made, SDK retries included; 0 when the call never started. */
  attempts: number;
  usage: AiCallUsage;
  /** Short error message for failed calls. */
  error?: string;
  /** When the call started (ms since epoch). */
  createdAt: number;
}

export interface AiRunMeta {
  task: AiTaskId;
  promptVersion: number;
  modelId: string;
  usage: AiCallUsage;
  latencyMs: number;
  attempts: number;
  finishReason: FinishReason | null;
  /**
   * When this call's budget ran out (ms since epoch). Pass it as a fallback
   * call's `budgetEndsAt` so the two share one budget.
   */
  budgetEndsAt: number;
  /** This call as an `aiCalls` row: return it from a job runner in `calls`. */
  call: AiCallRecord;
}

export type AiRunSuccess<Output> = AiRunMeta & { ok: true; output: Output };

export type AiRunFailure = AiRunMeta & {
  ok: false;
  failReason: AiFailReason;
  /** Raw model text when there was some, e.g. JSON that failed the schema. */
  text?: string;
  error?: string;
};

export type AiRunResult<Output> = AiRunSuccess<Output> | AiRunFailure;

/** `runText` also exposes the trimmed text as `text`. */
export type AiTextResult = (AiRunSuccess<string> & { text: string }) | AiRunFailure;

/** A model object, as opposed to a gateway model id string. */
export type LanguageModelInstance = Exclude<LanguageModel, string>;

type ProviderOptions = NonNullable<SystemModelMessage["providerOptions"]>;

type PromptInput =
  | { prompt: string | ModelMessage[]; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };

export type AiRunOptions = PromptInput & {
  /** Catalog model id (`src/lib/models.ts`); picks the route, prices and cache markers. */
  model: string;
  keys: AiProviderKeys;
  /** The owning game's prompt version for this task (see `tasks.ts`). */
  promptVersion: number;
  /** A plain string, or blocks ordered static -> game -> call (see `prompt.ts`). */
  instructions: string | readonly InstructionBlock[];
  /** The phase deadline (ms since epoch), or null when timers are off. */
  deadline: number | null | undefined;
  abortSignal?: AbortSignal;
  /** Overrides the deadline-derived budget (and the floor check). */
  timeoutMs?: number;
  /**
   * Ends the budget no later than this (ms since epoch): pass an earlier
   * call's `budgetEndsAt` so a fallback only gets the time that call left.
   */
  budgetEndsAt?: number;
  /** Calls this model instead of resolving `model`; for tests. */
  languageModel?: LanguageModelInstance;
  /** Clock for latency and timeouts; for tests. */
  now?: () => number;
};

type CallArgs = {
  model: LanguageModelInstance;
  instructions: SystemModelMessage[];
  reasoning: AiReasoning;
  maxOutputTokens: number;
  maxRetries: number;
  abortSignal: AbortSignal;
  providerOptions: ProviderOptions | undefined;
} & ({ prompt: string; messages?: never } | { messages: ModelMessage[]; prompt?: never });

type Outcome<Output> =
  | { ok: true; output: Output }
  | { ok: false; failReason: AiFailReason; text?: string };

type Generated<Output> = {
  finishReason: FinishReason;
  usage: LanguageModelUsage;
  read: () => Outcome<Output>;
  /** A provider error reported inside a stream that still finished. */
  error?: unknown;
};

/** Routes every model request through `guardAttempt`, so SDK retries are counted and budgeted. */
function guardModel(model: LanguageModelInstance, log: AttemptLog, policy: AttemptPolicy) {
  const middleware: LanguageModelMiddleware = {
    wrapGenerate: ({ doGenerate }) => guardAttempt(log, policy, doGenerate),
    // `streamText` retries only the request that opens the stream, so this counts the same way.
    wrapStream: ({ doStream }) => guardAttempt(log, policy, doStream),
  };
  return wrapLanguageModel({ model, middleware });
}

function preparePrompt(
  options: PromptInput,
  route: ModelRoute,
  breakpointBudget: number,
): { prompt: string } | { messages: ModelMessage[] } {
  const messages = options.messages ?? (Array.isArray(options.prompt) ? options.prompt : null);
  if (!messages) return { prompt: options.prompt as string };
  return {
    messages:
      route === "anthropic" ? limitMessageBreakpoints(messages, breakpointBudget) : messages,
  };
}

function failureFor(finishReason: FinishReason | undefined): AiFailReason {
  if (finishReason === "length") return "length";
  if (finishReason === "content-filter") return "refused";
  if (finishReason === "error") return "provider-error";
  return "invalid-output";
}

/** Why a call threw (`classifyStop` covers budget, timeout and caller stops). */
function classifyError(
  error: unknown,
  timeoutSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
  log: AttemptLog,
): AiFailReason {
  if (NoObjectGeneratedError.isInstance(error)) return failureFor(error.finishReason);
  const stop = classifyStop(error, timeoutSignal, callerSignal, log);
  if (stop) return stop;
  if (LoadAPIKeyError.isInstance(error)) return "missing-key";
  return "provider-error";
}

/** A finished call, as `runStructured`, `runText` and `decideChoices` report it. */
export interface FinishedCall {
  task: AiTaskId;
  promptVersion: number;
  modelId: string;
  startedAt: number;
  endedAt: number;
  budgetEndsAt: number;
  usage: AiCallUsage;
  attempts: number;
  finishReason: FinishReason | null;
  failReason: AiFailReason | null;
  error?: string | undefined;
}

/** Builds a call's `AiRunMeta` and `aiCalls` row, and logs it when it failed. */
export function callMeta(finished: FinishedCall): AiRunMeta {
  const { task, promptVersion, modelId, usage, attempts, finishReason, failReason, error } =
    finished;
  const latencyMs = Math.max(0, finished.endedAt - finished.startedAt);
  if (failReason) {
    console.warn(
      `[ai] ${task} v${promptVersion} ${modelId} failed: ${failReason}` +
        (error ? ` (${error})` : ""),
    );
  }
  return {
    task,
    promptVersion,
    modelId,
    usage,
    latencyMs,
    attempts,
    finishReason,
    budgetEndsAt: finished.budgetEndsAt,
    call: {
      task,
      promptVersion,
      modelId,
      ok: failReason === null,
      failReason,
      finishReason,
      latencyMs,
      attempts,
      usage,
      ...(error === undefined ? {} : { error }),
      createdAt: finished.startedAt,
    },
  };
}

interface Settled<Output> {
  outcome: Outcome<Output>;
  usage: AiCallUsage;
  attempts: number;
  finishReason: FinishReason | null;
  error?: string;
}

function settle<Output>(
  task: AiTaskId,
  options: AiRunOptions,
  startedAt: number,
  budgetEndsAt: number,
  { outcome, usage, attempts, finishReason, error }: Settled<Output>,
): AiRunResult<Output> {
  const meta = callMeta({
    task,
    promptVersion: options.promptVersion,
    modelId: options.model,
    startedAt,
    endedAt: (options.now ?? Date.now)(),
    budgetEndsAt,
    usage,
    attempts,
    finishReason,
    failReason: outcome.ok ? null : outcome.failReason,
    error,
  });
  if (outcome.ok) return { ...meta, ok: true, output: outcome.output };
  return {
    ...meta,
    ok: false,
    failReason: outcome.failReason,
    ...(outcome.text ? { text: outcome.text } : {}),
    ...(error === undefined ? {} : { error }),
  };
}

async function execute<Output>(
  task: AiTaskId,
  options: AiRunOptions,
  invoke: (args: CallArgs) => Promise<Generated<Output>>,
): Promise<AiRunResult<Output>> {
  const spec = getAiTask(task);
  const now = options.now ?? Date.now;
  const startedAt = now();
  const route = getModelRoute(options.model);
  // A layout mistake is a bug, not a failed call, so it throws.
  const instructions = buildInstructions(options.instructions, route);
  const prompt = preparePrompt(
    options,
    route,
    MAX_CACHE_BREAKPOINTS - countCacheBreakpoints(instructions),
  );
  const budget = callBudget(task, {
    deadline: options.deadline,
    now: startedAt,
    timeoutMs: options.timeoutMs,
    budgetEndsAt: options.budgetEndsAt,
  });
  const failEarly = (failReason: AiFailReason, error?: string) =>
    settle<Output>(task, options, startedAt, budget.endsAt, {
      outcome: { ok: false, failReason },
      usage: normalizeUsage(options.model, undefined),
      attempts: 0,
      finishReason: null,
      ...(error === undefined ? {} : { error }),
    });

  if (!options.languageModel && !hasProviderKey(options.model, options.keys)) {
    return failEarly("missing-key");
  }
  if (budget.skip) return failEarly("timeout", budget.skip);

  const { signal: abortSignal, timeoutSignal } = callSignal(budget.timeoutMs, options.abortSignal);
  const log = createAttemptLog();
  const model = guardModel(
    options.languageModel ?? getLanguageModel(options.model, options.keys),
    log,
    {
      maxRetries: spec.maxRetries,
      endsAt: budget.endsAt,
      minAttemptMs: budget.minAttemptMs,
      signal: abortSignal,
      now,
    },
  );

  try {
    const generated = await invoke({
      model,
      instructions,
      ...prompt,
      reasoning: spec.reasoning,
      maxOutputTokens: spec.maxOutputTokens,
      maxRetries: spec.maxRetries,
      abortSignal,
      providerOptions: cachingProviderOptions(route),
    });
    return settle(task, options, startedAt, budget.endsAt, {
      outcome: generated.read(),
      usage: normalizeUsage(options.model, generated.usage),
      attempts: log.attempts,
      finishReason: generated.finishReason,
      ...(generated.error === undefined ? {} : { error: describeAiError(generated.error) }),
    });
  } catch (error) {
    // A malformed request (e.g. a system message inside `messages`) is a bug too.
    if (isCallerError(error)) throw error;
    const salvage = NoObjectGeneratedError.isInstance(error) ? error : undefined;
    const waitedOnRetry = timeoutSignal.aborted && log.pendingError !== undefined;
    return settle(task, options, startedAt, budget.endsAt, {
      outcome: {
        ok: false,
        failReason: classifyError(error, timeoutSignal, options.abortSignal, log),
        ...(salvage?.text ? { text: salvage.text } : {}),
      },
      usage: normalizeUsage(options.model, salvage?.usage),
      attempts: log.attempts,
      finishReason: salvage?.finishReason ?? null,
      error: describeAiError(error, waitedOnRetry ? log.pendingError : undefined),
    });
  }
}

/**
 * One structured call (`Output.object` / `Output.choice` / `Output.array`)
 * with the task's reasoning, output cap, retries and deadline-derived
 * timeout. Never throws for a model or provider problem: a refusal, a
 * truncated or invalid reply, a timeout or an API error comes back as
 * `{ ok: false, failReason }` with whatever usage was billed. It throws only
 * for caller bugs: instruction blocks out of order, or a request the SDK
 * rejects as invalid (`InvalidPromptError`, `InvalidArgumentError`).
 *
 * Keep the output schema identical on every call of a task (fixed keys, see
 * `slotKeys`): providers cache the schema as part of the prompt prefix.
 */
export async function runStructured<Spec extends OutputInterface>(
  task: AiTaskId,
  options: AiRunOptions & { output: Spec },
): Promise<AiRunResult<InferGenerateOutput<Spec>>> {
  return execute(task, options, async (args) => {
    const result = await generateText({ ...args, output: options.output });
    return {
      finishReason: result.finishReason,
      usage: result.usage,
      read: (): Outcome<InferGenerateOutput<Spec>> => {
        if (result.finishReason === "content-filter") return { ok: false, failReason: "refused" };
        try {
          return { ok: true, output: result.output };
        } catch (error) {
          if (!NoOutputGeneratedError.isInstance(error)) throw error;
          return {
            ok: false,
            failReason: failureFor(result.finishReason),
            ...(result.text ? { text: result.text } : {}),
          };
        }
      },
    };
  });
}

/** Receives each partial output; return quickly (it is not awaited) and throttle on your side. */
export type PartialListener<Partial> = (partial: Partial) => void | PromiseLike<void>;

function deliver<Partial>(task: AiTaskId, listener: PartialListener<Partial>, partial: Partial) {
  const report = (error: unknown) =>
    console.warn(`[ai] ${task} onPartial threw: ${describeAiError(error)}`);
  try {
    const pending = listener(partial);
    if (pending && typeof pending.then === "function") pending.then(undefined, report);
  } catch (error) {
    report(error);
  }
}

/**
 * `runStructured`, streamed: `onPartial` gets each partial output in order as
 * the reply arrives (a listener error is logged, never fails the call), and
 * the result is the same `AiRunResult` once the stream ends. The final
 * output, finish reason and usage are awaited inside the call, so a refusal
 * (checked first), a truncated or invalid reply, a timeout or a provider
 * error comes back as `{ ok: false, failReason }` exactly as in
 * `runStructured`. A stream that failed before finishing reports the
 * provider's error, not the SDK's "no output" wrapper.
 */
export async function runStructuredStream<Spec extends OutputInterface>(
  task: AiTaskId,
  options: AiRunOptions & {
    output: Spec;
    onPartial: PartialListener<InferStreamOutput<Spec>>;
  },
): Promise<AiRunResult<InferGenerateOutput<Spec>>> {
  return execute(task, options, async (args) => {
    let streamError: unknown;
    const result = streamText({
      ...args,
      output: options.output,
      onError: ({ error }) => {
        streamError ??= error;
      },
    });
    let finishReason: FinishReason;
    let usage: LanguageModelUsage;
    try {
      for await (const partial of result.partialOutputStream) {
        deliver(task, options.onPartial, partial);
      }
      finishReason = await result.finishReason;
      usage = await result.usage;
    } catch (error) {
      // No step finished: the SDK rejects with "no output" or the abort reason;
      // the error the stream reported says why (API error, budget stop).
      throw streamError ?? error;
    }
    let outcome: Outcome<InferGenerateOutput<Spec>>;
    if (finishReason === "content-filter") {
      outcome = { ok: false, failReason: "refused" };
    } else {
      try {
        outcome = { ok: true, output: await result.output };
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) {
          throw error;
        }
        const text = NoObjectGeneratedError.isInstance(error) ? error.text : undefined;
        outcome = {
          ok: false,
          failReason: failureFor(finishReason),
          ...(text ? { text } : {}),
        };
      }
    }
    return {
      finishReason,
      usage,
      read: () => outcome,
      ...(finishReason === "error" && streamError !== undefined ? { error: streamError } : {}),
    };
  });
}

/**
 * One plain-text call. Succeeds only when the model stopped on its own
 * (`finishReason: 'stop'`) with non-empty text, which comes back trimmed.
 */
export async function runText(task: AiTaskId, options: AiRunOptions): Promise<AiTextResult> {
  const result = await execute(task, options, async (args) => {
    const generated = await generateText(args);
    return {
      finishReason: generated.finishReason,
      usage: generated.usage,
      read: (): Outcome<string> => {
        const text = generated.text.trim();
        if (generated.finishReason !== "stop") {
          return {
            ok: false,
            failReason: failureFor(generated.finishReason),
            ...(text ? { text } : {}),
          };
        }
        return text ? { ok: true, output: text } : { ok: false, failReason: "invalid-output" };
      },
    };
  });
  return result.ok ? { ...result, text: result.output } : result;
}
