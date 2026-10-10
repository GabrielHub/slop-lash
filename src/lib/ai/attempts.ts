import {
  APICallError,
  Experimental_DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidPromptError,
  RetryError,
} from "ai";

/**
 * Request bookkeeping shared by `runStructured`, `runText` and
 * `decideChoices`. The SDK retries inside `generateText` / `decide`; each
 * request goes through `guardAttempt`, which counts it and stops a retry the
 * call's budget cannot cover.
 */

/** The SDK's backoff: 2s, then doubling (ai `retryWithExponentialBackoffRespectingRetryHeaders`). */
const INITIAL_RETRY_DELAY_MS = 2_000;
const RETRY_BACKOFF_FACTOR = 2;
/** The SDK honors `retry-after` / `retry-after-ms` only below this. */
const MAX_HONORED_RETRY_AFTER_MS = 60_000;
const MAX_ERROR_CHARS = 300;

const BUDGET_ERROR_NAME = "AI_RetryBudgetError";

/**
 * Thrown in place of a retryable provider error when the SDK's wait before
 * the retry, plus the least useful time for the retry itself, would outlast
 * the call's budget. It is not retryable, so the call fails right away as
 * `provider-error` instead of sleeping until it times out.
 */
export class RetryBudgetError extends Error {
  override readonly name = BUDGET_ERROR_NAME;
  /** The retryable error the SDK would otherwise have waited out. */
  readonly providerError: unknown;
  /** The SDK's wait before the retry. */
  readonly retryInMs: number;
  /** Budget left when the request failed. */
  readonly remainingMs: number;

  constructor(providerError: unknown, retryInMs: number, remainingMs: number) {
    super(
      `retry in ${Math.round(retryInMs)} ms would outlast the ${Math.max(0, Math.round(remainingMs))} ms left (${describeAiError(providerError)})`,
    );
    this.providerError = providerError;
    this.retryInMs = retryInMs;
    this.remainingMs = remainingMs;
  }

  static isInstance(error: unknown): error is RetryBudgetError {
    return error instanceof Error && error.name === BUDGET_ERROR_NAME && "providerError" in error;
  }
}

export interface AttemptLog {
  /** Requests started, SDK retries included. */
  attempts: number;
  /**
   * The provider error the latest request failed with, while the SDK waits
   * to retry it; cleared when the next request starts or when a request is
   * cut off by the abort signal.
   */
  pendingError: unknown;
}

export interface AttemptPolicy {
  /** The SDK `maxRetries` for this call. */
  maxRetries: number;
  /** When the call's budget runs out (ms since epoch, on `now`'s clock). */
  endsAt: number;
  /** The least time worth starting a retry with. */
  minAttemptMs: number;
  /** The call's merged abort signal. */
  signal: AbortSignal;
  now: () => number;
}

export function createAttemptLog(): AttemptLog {
  return { attempts: 0, pendingError: undefined };
}

function headersOf(error: unknown): Record<string, string | undefined> | undefined {
  if (APICallError.isInstance(error)) return error.responseHeaders;
  const cause = error instanceof Error ? error.cause : undefined;
  return APICallError.isInstance(cause) ? cause.responseHeaders : undefined;
}

/** Whether the SDK would retry this error (an API or Gateway error marked retryable). */
export function isRetryableProviderError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "isRetryable" in error &&
    (error as { isRetryable?: unknown }).isRetryable === true
  );
}

/**
 * How long the SDK waits before retrying after the `failedAttempts`-th
 * failure: `retry-after-ms` / `retry-after` when under 60s, else exponential
 * backoff. Mirrors ai@7 `getRetryDelayInMs`.
 */
export function sdkRetryDelayMs(error: unknown, failedAttempts: number): number {
  const backoff = INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_FACTOR ** Math.max(0, failedAttempts - 1);
  const headers = headersOf(error);
  if (!headers) return backoff;
  let ms: number | undefined;
  const retryAfterMs = headers["retry-after-ms"];
  if (retryAfterMs) {
    const parsed = Number.parseFloat(retryAfterMs);
    if (!Number.isNaN(parsed)) ms = parsed;
  }
  const retryAfter = headers["retry-after"];
  if (retryAfter && ms === undefined) {
    const seconds = Number.parseFloat(retryAfter);
    ms = Number.isNaN(seconds) ? Date.parse(retryAfter) - Date.now() : seconds * 1_000;
  }
  if (
    ms !== undefined &&
    !Number.isNaN(ms) &&
    ms >= 0 &&
    (ms < MAX_HONORED_RETRY_AFTER_MS || ms < backoff)
  ) {
    return ms;
  }
  return backoff;
}

/**
 * Runs one request: counts it, remembers a provider error while the SDK
 * waits to retry, and turns a retry the budget cannot cover into a
 * `RetryBudgetError` so the SDK gives up at once.
 */
export async function guardAttempt<Result>(
  log: AttemptLog,
  policy: AttemptPolicy,
  request: () => PromiseLike<Result>,
): Promise<Result> {
  log.attempts += 1;
  log.pendingError = undefined;
  const attempt = log.attempts;
  try {
    return await request();
  } catch (error) {
    // Cut off by the timeout or the caller: the abort, not the provider, ended it.
    if (policy.signal.aborted) throw error;
    log.pendingError = error;
    const sdkWillRetry = attempt <= policy.maxRetries && isRetryableProviderError(error);
    if (!sdkWillRetry) throw error;
    const retryInMs = sdkRetryDelayMs(error, attempt);
    const remainingMs = policy.endsAt - policy.now();
    if (retryInMs + policy.minAttemptMs > remainingMs) {
      throw new RetryBudgetError(error, retryInMs, remainingMs);
    }
    throw error;
  }
}

/**
 * Errors that mean the caller built a bad request (a system message inside
 * `messages`, an empty decision question map, an invalid setting). They are
 * bugs, not failed calls, so the task layer rethrows them.
 */
export function isCallerError(error: unknown): boolean {
  return (
    InvalidPromptError.isInstance(error) ||
    InvalidArgumentError.isInstance(error) ||
    Experimental_DecisionUnsupportedQuestionTypeError.isInstance(error)
  );
}

/**
 * Why a call threw when its budget, timeout or caller ended it, else
 * undefined. A budget stop, or a timeout while waiting to retry a provider
 * error, counts as `provider-error`, so rate limiting stays visible.
 */
export function classifyStop(
  error: unknown,
  timeoutSignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
  log: AttemptLog,
): "provider-error" | "timeout" | "aborted" | undefined {
  if (isBudgetStop(error)) return "provider-error";
  if (timeoutSignal.aborted) return log.pendingError === undefined ? "timeout" : "provider-error";
  if (callerSignal?.aborted) return "aborted";
  return undefined;
}

/** Whether the SDK gave up because a retry would have outlasted the budget. */
export function isBudgetStop(error: unknown): boolean {
  if (RetryBudgetError.isInstance(error)) return true;
  return RetryError.isInstance(error) && RetryBudgetError.isInstance(error.lastError);
}

function describeOne(error: unknown): string {
  if (RetryBudgetError.isInstance(error)) return `${error.name}: ${error.message}`;
  if (RetryError.isInstance(error)) {
    return `${error.name} after ${error.errors.length} attempts: ${describeOne(error.lastError)}`;
  }
  if (APICallError.isInstance(error)) {
    return `${error.name}${error.statusCode === undefined ? "" : ` ${error.statusCode}`}: ${error.message}`;
  }
  if (error instanceof Error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    return `${error.name}${typeof status === "number" ? ` ${status}` : ""}: ${error.message}`;
  }
  return String(error);
}

/**
 * A short description for `aiCalls.error`, with the HTTP status when there is
 * one. `pending` is the provider error the call was waiting to retry when it
 * timed out.
 */
export function describeAiError(error: unknown, pending?: unknown): string {
  const message =
    pending === undefined
      ? describeOne(error)
      : `budget ran out waiting to retry: ${describeOne(pending)}`;
  return message.slice(0, MAX_ERROR_CHARS);
}
