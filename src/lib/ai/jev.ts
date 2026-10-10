import {
  experimental_decide as decide,
  Experimental_DecisionRefusalError,
  InvalidResponseDataError,
  type Experimental_DecisionModel,
  type Experimental_DecisionQuestion,
  type Experimental_DecisionState,
} from "ai";
import { getDecisionModel, hasProviderKey, type AiProviderKeys } from "../ai-gateway";
import { JEV_MODEL } from "../models";
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
import { callMeta, type AiFailReason, type AiRunFailure, type AiRunMeta } from "./run";
import type { AiTaskId } from "./tasks";
import { normalizeDecisionUsage, type AiCallUsage } from "./usage";

/** Jev runs on the Vercel AI Gateway, so it needs `AI_GATEWAY_API_KEY`. */
export function canUseJev(keys: AiProviderKeys): boolean {
  return hasProviderKey(JEV_MODEL.id, keys);
}

/** One pick-one question: option name -> what it means (null for no description). */
export interface ChoiceQuestion {
  instructions: string;
  options: Readonly<Record<string, string | null>>;
}

export type ChoiceQuestions = Readonly<Record<string, ChoiceQuestion>>;

/** The picked option name for every question. */
export type DecidedChoices<Questions extends ChoiceQuestions> = {
  [Id in keyof Questions]: Extract<keyof Questions[Id]["options"], string>;
};

/** Each question's distribution over its options, when the model reports one. */
export type ChoiceProbabilities<Questions extends ChoiceQuestions> = {
  [Id in keyof Questions]?: Record<string, number>;
};

export type AiDecideSuccess<Questions extends ChoiceQuestions> = AiRunMeta & {
  ok: true;
  output: DecidedChoices<Questions>;
  probabilities: ChoiceProbabilities<Questions>;
};

export type AiDecideFailure = AiRunFailure & { refusedQuestionIds?: string[] };

export type AiDecideResult<Questions extends ChoiceQuestions> =
  | AiDecideSuccess<Questions>
  | AiDecideFailure;

type DecisionModelInstance = Extract<Experimental_DecisionModel, { doDecide: unknown }>;

export interface DecideChoicesOptions {
  /** The owning game's prompt version for these questions. */
  promptVersion: number;
  /** The phase deadline (ms since epoch), or null when timers are off. */
  deadline: number | null | undefined;
  /** Task the call is timed and recorded as. Defaults to `sloplash.ballots`. */
  task?: AiTaskId;
  /** Gateway decision model id. Defaults to Jev. */
  modelId?: string;
  abortSignal?: AbortSignal;
  /** Overrides the deadline-derived budget (and the floor check). */
  timeoutMs?: number;
  /** Ends the budget no later than this (ms since epoch); see `AiRunOptions.budgetEndsAt`. */
  budgetEndsAt?: number;
  /** Calls this decision model instead of the gateway; for tests. */
  decisionModel?: DecisionModelInstance;
  now?: () => number;
}

const DECIDE_RETRIES = 1;

/**
 * Wraps a decision model so every request goes through `guardAttempt`
 * (counted, and no retry the budget cannot cover) and the last reported
 * usage is kept.
 */
function observe(model: DecisionModelInstance, log: AttemptLog, policy: AttemptPolicy) {
  const seen: { usage: { inputTokens?: number; outputTokens?: number } | undefined } = {
    usage: undefined,
  };
  const wrapped: DecisionModelInstance = {
    specificationVersion: "v4",
    provider: model.provider,
    modelId: model.modelId,
    supportedQuestionTypes: model.supportedQuestionTypes,
    doDecide: (callOptions) =>
      guardAttempt(log, policy, async () => {
        const result = await model.doDecide(callOptions);
        seen.usage = result.usage;
        return result;
      }),
  };
  return { model: wrapped, seen };
}

function classify(
  error: unknown,
  timeoutSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
  log: AttemptLog,
): AiFailReason {
  if (Experimental_DecisionRefusalError.isInstance(error)) return "refused";
  if (InvalidResponseDataError.isInstance(error)) return "invalid-output";
  return classifyStop(error, timeoutSignal, callerSignal, log) ?? "provider-error";
}

type Settled<Questions extends ChoiceQuestions> = {
  attempts: number;
  usage: AiCallUsage;
} & (
  | {
      ok: true;
      output: DecidedChoices<Questions>;
      probabilities: ChoiceProbabilities<Questions>;
    }
  | { ok: false; failReason: AiFailReason; error?: string; refusedQuestionIds?: string[] }
);

/**
 * Asks a decision model (Jev by default) one pick-one question per id, in a
 * single call over a shared state. Free Play SlopLash ballots use it with
 * one question per matchup. A refusal of any question fails the whole call
 * as `refused` (the SDK returns no partial answers), so the caller can fall
 * back to the Haiku ballot call (pass this result's `budgetEndsAt` to it).
 * Never throws for a model or provider problem; throws for caller bugs: an
 * empty question map (skip the call when there is nothing to decide), or a
 * question or state the SDK rejects.
 */
export async function decideChoices<const Questions extends ChoiceQuestions>(
  questions: Questions,
  state: Experimental_DecisionState,
  keys: AiProviderKeys,
  options: DecideChoicesOptions,
): Promise<AiDecideResult<Questions>> {
  const ids = Object.keys(questions);
  if (ids.length === 0) {
    throw new Error(
      "decideChoices needs at least one question; skip the call when there is nothing to decide",
    );
  }
  const task = options.task ?? "sloplash.ballots";
  const modelId = options.modelId ?? JEV_MODEL.id;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const budget = callBudget(task, {
    deadline: options.deadline,
    now: startedAt,
    timeoutMs: options.timeoutMs,
    budgetEndsAt: options.budgetEndsAt,
  });

  const finish = (settled: Settled<Questions>): AiDecideResult<Questions> => {
    const error = settled.ok ? undefined : settled.error;
    const meta = callMeta({
      task,
      promptVersion: options.promptVersion,
      modelId,
      startedAt,
      endedAt: now(),
      budgetEndsAt: budget.endsAt,
      usage: settled.usage,
      attempts: settled.attempts,
      finishReason: null,
      failReason: settled.ok ? null : settled.failReason,
      error,
    });
    if (settled.ok) {
      return {
        ...meta,
        ok: true,
        output: settled.output,
        probabilities: settled.probabilities,
      };
    }
    return {
      ...meta,
      ok: false,
      failReason: settled.failReason,
      ...(error === undefined ? {} : { error }),
      ...(settled.refusedQuestionIds ? { refusedQuestionIds: settled.refusedQuestionIds } : {}),
    };
  };

  if (!options.decisionModel && !canUseJev(keys)) {
    return finish({
      ok: false,
      failReason: "missing-key",
      attempts: 0,
      usage: normalizeDecisionUsage(modelId, undefined),
    });
  }
  if (budget.skip) {
    return finish({
      ok: false,
      failReason: "timeout",
      error: budget.skip,
      attempts: 0,
      usage: normalizeDecisionUsage(modelId, undefined),
    });
  }

  const { signal, timeoutSignal } = callSignal(budget.timeoutMs, options.abortSignal);
  const log = createAttemptLog();
  const { model, seen } = observe(options.decisionModel ?? getDecisionModel(modelId, keys), log, {
    maxRetries: DECIDE_RETRIES,
    endsAt: budget.endsAt,
    minAttemptMs: budget.minAttemptMs,
    signal,
    now,
  });
  const decisionQuestions: Record<string, Experimental_DecisionQuestion> = {};
  for (const [id, question] of Object.entries(questions)) {
    decisionQuestions[id] = {
      type: "choice",
      instructions: question.instructions,
      criteria: question.options,
    };
  }

  try {
    const result = await decide({
      model,
      state,
      questions: decisionQuestions,
      maxRetries: DECIDE_RETRIES,
      abortSignal: signal,
    });
    const usage = normalizeDecisionUsage(modelId, result.usage);
    const output: Record<string, string> = {};
    const probabilities: Record<string, Record<string, number>> = {};
    for (const id of ids) {
      const answer = result.answers[id];
      if (answer?.type !== "choice") {
        return finish({ ok: false, failReason: "invalid-output", attempts: log.attempts, usage });
      }
      output[id] = answer.choice;
      if (answer.probabilities) probabilities[id] = answer.probabilities;
    }
    return finish({
      ok: true,
      attempts: log.attempts,
      usage,
      // Every id was just checked against `questions`, and `decide` validated each choice.
      output: output as DecidedChoices<Questions>,
      probabilities: probabilities as ChoiceProbabilities<Questions>,
    });
  } catch (error) {
    // An empty or malformed question map or state is a bug, not a failed call.
    if (isCallerError(error)) throw error;
    const waitedOnRetry = timeoutSignal.aborted && log.pendingError !== undefined;
    return finish({
      ok: false,
      failReason: classify(error, timeoutSignal, options.abortSignal, log),
      error: describeAiError(error, waitedOnRetry ? log.pendingError : undefined),
      ...(Experimental_DecisionRefusalError.isInstance(error)
        ? { refusedQuestionIds: [...error.questionIds] }
        : {}),
      attempts: log.attempts,
      // A refusal throws after the model answered, so that usage was billed.
      usage: normalizeDecisionUsage(modelId, seen.usage),
    });
  }
}
