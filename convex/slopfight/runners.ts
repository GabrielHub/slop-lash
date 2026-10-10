"use node";

import { getAiProviderKeys } from "../aiGateway";
import { jobResult, type JobRunners } from "../jobs";
import type { SlopfightJobs } from "./jobs";
import { inventHouseChampions, writeMatchup, writeRecapLine } from "./ports";

/** Network half of SlopFight's AI jobs. Every call falls back to Sonnet inside the wrapper. */
export const slopfightRunners: JobRunners<SlopfightJobs> = {
  async SLOPFIGHT_HOUSE(input) {
    const result = await inventHouseChampions({
      ...input,
      keys: getAiProviderKeys(),
      deadline: null,
    });
    return result.ok
      ? jobResult({ descriptions: result.descriptions }, result.calls)
      : jobResult({ descriptions: [] }, result.calls, result.failReason);
  },

  async SLOPFIGHT_MATCHUP(input) {
    const result = await writeMatchup({
      a: input.a,
      b: input.b,
      arena: input.arena,
      keys: getAiProviderKeys(),
      deadline: null,
    });
    return result.ok
      ? jobResult({ notes: result.notes, walkOn: result.walkOn }, result.calls)
      : jobResult(null, result.calls, result.failReason);
  },

  async SLOPFIGHT_RECAP(input) {
    const result = await writeRecapLine({
      a: input.a,
      b: input.b,
      outcome: input.outcome,
      events: input.events,
      keys: getAiProviderKeys(),
      deadline: null,
    });
    return result.ok
      ? jobResult({ line: result.line }, result.calls)
      : jobResult({ line: null }, result.calls, result.failReason);
  },
};
