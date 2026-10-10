import type { LanguageModelUsage } from "ai";
import { getModelInfo } from "../models";

/** Token usage and estimated cost of one AI call. */
export interface AiCallUsage {
  /** Every input token, cached or not. */
  inputTokens: number;
  /** Every output token, reasoning included. */
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  /**
   * False when the call read or wrote cached tokens but the model's cache
   * prices are unknown; those tokens are then priced as plain input.
   */
  cachePriceKnown: boolean;
}

/** The per-model roll-up that `gameModelUsage` and the job contract store. */
export interface AiModelUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const ZERO_CALL_USAGE: AiCallUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
  cachePriceKnown: true,
};

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

export interface TokenCounts {
  /** Input tokens billed at the full input rate. */
  noCacheInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

/**
 * Estimated USD cost from the catalog prices in `src/lib/models.ts`. Cached
 * tokens use the model's cache prices when known; otherwise they are priced
 * as plain input and `cachePriceKnown` is false. Unknown models cost 0.
 */
export function estimateCostUsd(
  modelId: string,
  tokens: TokenCounts,
): { costUsd: number; cachePriceKnown: boolean } {
  const model = getModelInfo(modelId);
  const cachePriceKnown =
    (tokens.cacheReadTokens === 0 || model?.cacheReadPer1M !== undefined) &&
    (tokens.cacheWriteTokens === 0 || model?.cacheWritePer1M !== undefined);
  if (!model) return { costUsd: 0, cachePriceKnown };
  const readPrice = model.cacheReadPer1M ?? model.inputPer1M;
  const writePrice = model.cacheWritePer1M ?? model.inputPer1M;
  const costUsd =
    (tokens.noCacheInputTokens * model.inputPer1M +
      tokens.cacheReadTokens * readPrice +
      tokens.cacheWriteTokens * writePrice +
      tokens.outputTokens * model.outputPer1M) /
    1_000_000;
  return { costUsd, cachePriceKnown };
}

/**
 * Normalizes AI SDK usage. Providers report `inputTokens` as the total
 * (Anthropic's includes cache reads and writes), so uncached input is
 * `noCacheTokens` when reported, else the total minus cached tokens.
 */
export function normalizeUsage(
  modelId: string,
  usage: LanguageModelUsage | undefined,
): AiCallUsage {
  if (!usage) return { ...ZERO_CALL_USAGE };
  const cacheReadTokens = count(usage.inputTokenDetails?.cacheReadTokens);
  const cacheWriteTokens = count(usage.inputTokenDetails?.cacheWriteTokens);
  const reportedNoCache = usage.inputTokenDetails?.noCacheTokens;
  const inputTokens = Math.max(
    count(usage.inputTokens),
    count(reportedNoCache) + cacheReadTokens + cacheWriteTokens,
  );
  const noCacheInputTokens =
    reportedNoCache !== undefined
      ? count(reportedNoCache)
      : Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const reasoningTokens = count(usage.outputTokenDetails?.reasoningTokens);
  const outputTokens = Math.max(count(usage.outputTokens), reasoningTokens);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    ...estimateCostUsd(modelId, {
      noCacheInputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
    }),
  };
}

/** Decision models report only input and output totals. */
export function normalizeDecisionUsage(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
): AiCallUsage {
  const inputTokens = count(usage?.inputTokens);
  const outputTokens = count(usage?.outputTokens);
  return {
    ...ZERO_CALL_USAGE,
    inputTokens,
    outputTokens,
    ...estimateCostUsd(modelId, {
      noCacheInputTokens: inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens,
    }),
  };
}

/** Per-model totals of a job's calls, one row per distinct model. */
export function rollUpUsage(
  calls: readonly { modelId: string; usage: AiCallUsage }[],
): AiModelUsage[] {
  const byModel = new Map<string, AiModelUsage>();
  for (const { modelId, usage } of calls) {
    const total = byModel.get(modelId);
    if (total) {
      total.inputTokens += usage.inputTokens;
      total.outputTokens += usage.outputTokens;
      total.costUsd += usage.costUsd;
    } else {
      byModel.set(modelId, {
        modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      });
    }
  }
  return [...byModel.values()];
}
