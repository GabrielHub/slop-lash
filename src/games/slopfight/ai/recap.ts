import { Output } from "ai";
import { z } from "zod";
import { runStructured } from "@/lib/ai/run";
import { cleanText, type Champion } from "../sheet";
import {
  RECAP_LINE_MAX,
  RECAP_PROMPT_VERSION,
  recapInstructions,
  recapPrompt,
  type RecapEvent,
  type RecapOutcome,
} from "./recap-prompt";
import { callSettings, modelText, withFallback, type AiOutcome, type CallOptions } from "./shared";

export type { RecapEvent, RecapOutcome } from "./recap-prompt";

const RECAP_OUTPUT = Output.object({
  schema: z.object({
    line: z.string().describe(`The highlight, one sentence, at most ${RECAP_LINE_MAX} characters`),
  }),
});

export interface WriteRecapOptions extends CallOptions {
  a: Champion;
  b: Champion;
  outcome: RecapOutcome;
  events: readonly RecapEvent[];
}

/** One highlight line (at most 100 characters) for a finished fight. Haiku, then Sonnet on any failure. */
export async function writeRecapLine(
  options: WriteRecapOptions,
): Promise<AiOutcome<{ line: string }>> {
  const prompt = recapPrompt(options.a, options.b, options.outcome, options.events);
  return withFallback(
    (modelId, fallback) =>
      runStructured(fallback ? "slopfight.recapFallback" : "slopfight.recap", {
        ...callSettings(options, modelId),
        promptVersion: RECAP_PROMPT_VERSION,
        instructions: recapInstructions(),
        prompt,
        output: RECAP_OUTPUT,
      }),
    (output) => {
      const line = cleanText(modelText(output.line, RECAP_LINE_MAX), RECAP_LINE_MAX);
      return line ? { line } : null;
    },
  );
}
