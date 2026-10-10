"use node";

import { jobResult, type JobRunners } from "../jobs";
import { getAiProviderKeys } from "../aiGateway";
import type { SloplashJobs } from "./mode";
import { castBallots, writeJokes, writeTagline } from "../../src/games/sloplash/ai";

export const sloplashRunners: JobRunners<SloplashJobs> = {
  async SLOPLASH_JOKES(input) {
    const result = await writeJokes({ ...input, keys: getAiProviderKeys() });
    return jobResult({ answers: result.answers }, result.calls, result.failReason);
  },

  async SLOPLASH_BALLOTS(input) {
    const result = await castBallots({ ...input, keys: getAiProviderKeys(), deadline: null });
    return jobResult({ ballots: result.ballots }, result.calls, result.failReason);
  },

  async SLOPLASH_TAGLINE(input) {
    const result = await writeTagline({ ...input, keys: getAiProviderKeys() });
    return jobResult({ text: result.text }, [result.call], result.failReason);
  },
};
