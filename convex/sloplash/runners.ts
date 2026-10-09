"use node";

import type { JobRunners } from "../jobs";
import { getAiProviderKeys } from "../aiGateway";
import type { SloplashJobs } from "./mode";
import {
  aiVote,
  generateJoke,
  generateWinnerTagline,
  judgeVote,
} from "../../src/games/sloplash/ai";

export const sloplashRunners: JobRunners<SloplashJobs> = {
  async SLOPLASH_RESPONSE(input) {
    const keys = getAiProviderKeys();
    const results = await Promise.all(
      input.prompts.map((prompt) => generateJoke(input.modelId, prompt.text, keys, input.history)),
    );
    return {
      output: {
        answers: input.prompts.map((prompt, index) => ({
          promptId: prompt.promptId,
          text: results[index]!.text,
        })),
      },
      usage: results.map((result) => result.usage),
    };
  },

  async SLOPLASH_VOTE(input) {
    const vote = input.judgeModelId ? judgeVote : aiVote;
    const result = await vote(
      input.judgeModelId ?? input.modelId,
      input.promptText,
      input.a.text,
      input.b.text,
      getAiProviderKeys(),
    );
    return {
      output: {
        responseId:
          result.choice === "A"
            ? input.a.responseId
            : result.choice === "B"
              ? input.b.responseId
              : null,
        failed: result.failReason !== null,
        reactions: [
          ...result.reactionsA.map((emoji) => ({ responseId: input.a.responseId, emoji })),
          ...result.reactionsB.map((emoji) => ({ responseId: input.b.responseId, emoji })),
        ],
      },
      usage: [result.usage],
    };
  },

  async SLOPLASH_TAGLINE(input) {
    return generateWinnerTagline(
      input.modelId,
      input.leaderName,
      input.isFinal,
      input.context,
      getAiProviderKeys(),
    );
  },
};
