import { Output } from "ai";
import { z } from "zod";
import { runStructured } from "@/lib/ai/run";
import type { ArenaId } from "../arenas";
import { DESCRIBE_TEXT_MAX } from "../constants";
import { cleanText } from "../sheet";
import { HOUSE_PROMPT_VERSION, houseInstructions, housePrompt } from "./house-prompt";
import { callSettings, modelText, withFallback, type AiOutcome, type CallOptions } from "./shared";

const HOUSE_OUTPUT = Output.object({
  schema: z.object({
    champions: z
      .array(
        z.object({
          description: z
            .string()
            .describe(`What a player would type into Describe it, at most ${DESCRIBE_TEXT_MAX} characters`),
        }),
      )
      .describe("One entry per champion the call block asks for"),
  }),
});

export interface InventHouseOptions extends CallOptions {
  arenas: readonly ArenaId[];
  count: number;
  /** Per-game variety seed (the room's seed); rendered into the call block only. Random when omitted. */
  seed?: number;
}

/**
 * Descriptions for the house champions, each at most DESCRIBE_TEXT_MAX
 * characters, in the house voice and different every game. Haiku first,
 * then Sonnet on any failure or a short list.
 */
export async function inventHouseChampions(
  options: InventHouseOptions,
): Promise<AiOutcome<{ descriptions: string[] }>> {
  const count = Math.max(0, Math.floor(options.count));
  if (count === 0) return { ok: true, descriptions: [], calls: [] };
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  return withFallback(
    (modelId, fallback) =>
      runStructured(fallback ? "slopfight.houseFallback" : "slopfight.house", {
        ...callSettings(options, modelId),
        promptVersion: HOUSE_PROMPT_VERSION,
        instructions: houseInstructions(options.arenas),
        prompt: housePrompt(count, seed),
        output: HOUSE_OUTPUT,
      }),
    (output) => {
      const descriptions: string[] = [];
      for (const { description } of output.champions) {
        const text = cleanText(modelText(description, DESCRIBE_TEXT_MAX), DESCRIBE_TEXT_MAX);
        if (text && !descriptions.includes(text)) descriptions.push(text);
      }
      return descriptions.length >= count ? { descriptions: descriptions.slice(0, count) } : null;
    },
  );
}
