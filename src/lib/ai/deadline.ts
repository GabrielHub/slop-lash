import { getAiTask, type AiTaskId } from "./tasks";

/** A call gives up this long before its phase does, so the result can still land. */
export const DEADLINE_MARGIN_MS = 1_500;

/**
 * Total time budget for one call, retries included: the time left before the
 * phase deadline (less `DEADLINE_MARGIN_MS`), capped at the task's `capMs`.
 * With no deadline (timers off, the lobby) it is the cap. Never negative and
 * never past the deadline: a result that lands after the phase is discarded
 * but still billed, so there is no point waiting for one.
 */
export function callTimeoutMs(
  task: AiTaskId,
  deadline: number | null | undefined,
  now: number,
): number {
  const { capMs } = getAiTask(task).timeout;
  if (deadline === null || deadline === undefined) return capMs;
  return Math.max(0, Math.min(capMs, deadline - now - DEADLINE_MARGIN_MS));
}

export interface CallBudgetInput {
  /** The phase deadline (ms since epoch), or null when timers are off. */
  deadline: number | null | undefined;
  /** When the call starts (ms since epoch). */
  now: number;
  /** An explicit budget; it replaces the deadline math and the floor check. */
  timeoutMs?: number;
  /**
   * An absolute end shared with an earlier call (its `budgetEndsAt`), so a
   * fallback only gets whatever time the first call left.
   */
  budgetEndsAt?: number;
}

export interface CallBudget {
  /** The call's whole budget, retries included. */
  timeoutMs: number;
  /** When the budget runs out (ms since epoch). */
  endsAt: number;
  /** The least time worth starting a request with, the first or a retry. */
  minAttemptMs: number;
  /**
   * Set when the budget is under the task's floor: the call is skipped and
   * reported as `timeout` with no request made.
   */
  skip?: string;
}

/**
 * The budget for one call. It is `callTimeoutMs`, cut short by
 * `budgetEndsAt` when given. A budget under the task's `floorMs` is not worth
 * a request, so the call is skipped; an explicit `timeoutMs` is always used
 * as given.
 */
export function callBudget(task: AiTaskId, input: CallBudgetInput): CallBudget {
  const { floorMs } = getAiTask(task).timeout;
  const explicit = input.timeoutMs !== undefined;
  let timeoutMs = explicit
    ? Math.max(0, input.timeoutMs!)
    : callTimeoutMs(task, input.deadline, input.now);
  if (input.budgetEndsAt !== undefined) {
    timeoutMs = Math.max(0, Math.min(timeoutMs, input.budgetEndsAt - input.now));
  }
  const minAttemptMs = Math.min(floorMs, timeoutMs);
  const tooShort = timeoutMs <= 0 || (!explicit && timeoutMs < floorMs);
  return {
    timeoutMs,
    endsAt: input.now + timeoutMs,
    minAttemptMs,
    ...(tooShort
      ? { skip: `skipped: ${timeoutMs} ms left, under the ${floorMs} ms floor for ${task}` }
      : {}),
  };
}

/**
 * The abort signal for one call: it fires after `timeoutMs` or when the
 * caller's signal does. `timeoutSignal` tells the two apart afterwards.
 */
export function callSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): { signal: AbortSignal; timeoutSignal: AbortSignal } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal,
    timeoutSignal,
  };
}
