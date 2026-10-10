"use node";

import { fal } from "@fal-ai/client";
import { z } from "zod";
import { env } from "../_generated/server";
import { getAiProviderKeys } from "../aiGateway";
import { jobResult, type JobRunners } from "../jobs";
import type { MatchslopJobs } from "./mode";
import {
  generatePersona,
  writeBotLine,
  writePersonaReply,
  writePostMortem,
} from "../../src/games/matchslop/ai-calls";
import { aiVote } from "../../src/games/matchslop/ai-voting";
import { PORTRAIT_SAFETY } from "../../src/games/matchslop/prompts";

const PORTRAIT_TIMEOUT_MS = 60_000;

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().url() })).min(1),
  has_nsfw_concepts: z.array(z.boolean()).optional(),
});

async function requestPortrait(prompt: string): Promise<string> {
  const apiKey = env.FAL_KEY;
  if (!apiKey) throw new Error("Fal API key is missing. Set FAL_KEY in the environment.");
  fal.config({ credentials: apiKey });
  const result = await fal.run("recraft/v4.1/flash/text-to-image", {
    input: { prompt, image_size: "landscape_4_3", enable_safety_checker: true },
    abortSignal: AbortSignal.timeout(PORTRAIT_TIMEOUT_MS),
  });
  const parsed = falResponseSchema.parse(result.data);
  if (parsed.has_nsfw_concepts?.[0]) throw new Error("Fal marked the portrait as NSFW.");
  return parsed.images[0]!.url;
}

/**
 * The network half of MatchSlop's jobs. Every model call goes through the
 * task layer (src/games/matchslop/ai-calls.ts); a failed call still returns
 * its stand-in output, so `apply` runs and the job is marked FAILED.
 */
export const matchslopRunners: JobRunners<MatchslopJobs> = {
  async MATCHSLOP_PROFILE(input) {
    const { output, calls, failReason } = await generatePersona(input, {
      keys: getAiProviderKeys(),
    });
    return jobResult({ persona: output }, calls, failReason);
  },

  async MATCHSLOP_PORTRAIT(input) {
    const url = await requestPortrait(`${input.imagePrompt.trim()} ${PORTRAIT_SAFETY}`);
    return jobResult({ url }, []);
  },

  async MATCHSLOP_RESPONSE(input) {
    const { output, calls, failReason } = await writeBotLine(input, { keys: getAiProviderKeys() });
    return jobResult(
      { text: output?.text ?? null, openerPromptId: output?.openerPromptId ?? null },
      calls,
      failReason,
    );
  },

  async MATCHSLOP_VOTE(input) {
    const vote = await aiVote(input, { keys: getAiProviderKeys() });
    return jobResult(
      { responseId: vote.responseId, failed: vote.failed },
      vote.calls,
      vote.failReason,
    );
  },

  async MATCHSLOP_REPLY(input) {
    const { output, calls, failReason } = await writePersonaReply(input, {
      keys: getAiProviderKeys(),
    });
    return jobResult(output, calls, failReason);
  },

  async MATCHSLOP_POST_MORTEM(input) {
    const { output, calls, failReason } = await writePostMortem(input, {
      keys: getAiProviderKeys(),
    });
    return jobResult({ postMortem: output }, calls, failReason);
  },
};
