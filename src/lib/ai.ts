import { generateText, Output, createGateway } from "ai";
import { calculateCostUsd } from "./models";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

export interface AiUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * System prompts extracted as constants so that AI providers can leverage
 * prompt caching (Anthropic, Google, OpenAI all cache repeated prefixes).
 * Keeping these byte-identical across calls maximizes cache hit rates.
 */
const JOKE_SYSTEM_PROMPT =
  "You are a Quiplash player. Write a short, unexpected, funny answer to each prompt. Only output the joke — nothing else. Keep it under 80 characters. No quotes, no explanation." as const;

const VOTE_SYSTEM_PROMPT =
  "You are a Quiplash judge. Pick the funnier answer: A or B." as const;

const ZERO_USAGE: AiUsage = { modelId: "", inputTokens: 0, outputTokens: 0, costUsd: 0 };

function extractUsage(modelId: string, usage: { inputTokens?: number; outputTokens?: number }): AiUsage {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return { modelId, inputTokens: input, outputTokens: output, costUsd: calculateCostUsd(modelId, input, output) };
}

/**
 * Returns provider-specific options to minimize reasoning token usage.
 * Only applies to models that support configurable reasoning effort/budget.
 */
type JSONish = Record<string, string | Record<string, string>>;

function getLowReasoningProviderOptions(
  modelId: string,
): Record<string, JSONish> | undefined {
  const provider = modelId.split("/")[0];
  if (provider === "anthropic") return { anthropic: { effort: "low" } };
  if (provider === "google") return { google: { thinkingConfig: { thinkingLevel: "minimal" } } };
  if (provider === "xai" && modelId.includes("reasoning")) return { xai: { reasoningEffort: "low" } };
  // openai/gpt-5.2 is not a reasoning model (o3/o4-mini are)
  // deepseek: only enable/disable, no effort levels — leave default
  // moonshotai, minimax, zai, xiaomi: no documented reasoning options
  return undefined;
}

export async function generateJoke(
  modelId: string,
  promptText: string
): Promise<{ text: string; usage: AiUsage }> {
  const t0 = Date.now();
  try {
    const providerOptions = getLowReasoningProviderOptions(modelId);
    const result = await generateText({
      model: gateway(modelId),
      system: JOKE_SYSTEM_PROMPT,
      prompt: promptText,
      providerOptions,
    });
    const elapsed = Date.now() - t0;
    const text = result.text.trim().replace(/^["']|["']$/g, "");
    if (!text) {
      console.warn(`[generateJoke] ${modelId} returned empty text in ${elapsed}ms. finishReason: ${JSON.stringify(result.finishReason)}, usage: ${JSON.stringify(result.usage)}`);
    } else {
      console.log(`[generateJoke] ${modelId} OK in ${elapsed}ms: "${text.slice(0, 60)}"`);
    }
    return {
      text: text || "I got nothing...",
      usage: extractUsage(modelId, result.usage),
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[generateJoke] ${modelId} FAILED in ${elapsed}ms:`, err);
    return { text: "My circuits are fried... 🤖", usage: { ...ZERO_USAGE, modelId } };
  }
}

export async function aiVote(
  modelId: string,
  promptText: string,
  responseA: string,
  responseB: string
): Promise<{ choice: "A" | "B"; usage: AiUsage }> {
  const t0 = Date.now();
  try {
    // Randomize order to prevent position bias
    const showAFirst = Math.random() > 0.5;
    const first = showAFirst ? responseA : responseB;
    const second = showAFirst ? responseB : responseA;

    const providerOptions = getLowReasoningProviderOptions(modelId);
    const result = await generateText({
      model: gateway(modelId),
      system: VOTE_SYSTEM_PROMPT,
      output: Output.choice({ options: ["A", "B"] as const }),
      prompt: `Prompt: "${promptText}"\n\nA: "${first}"\nB: "${second}"`,
      providerOptions,
    });

    const elapsed = Date.now() - t0;
    const rawChoice = result.output ?? "A";
    // Map back to original A/B positions when order was swapped
    const flipped = rawChoice === "A" ? "B" : "A";
    const choice: "A" | "B" = showAFirst ? rawChoice : flipped;
    console.log(`[aiVote] ${modelId} chose ${choice} in ${elapsed}ms`);
    return { choice, usage: extractUsage(modelId, result.usage) };
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[aiVote] ${modelId} FAILED in ${elapsed}ms:`, err);
    return {
      choice: Math.random() > 0.5 ? "A" : "B",
      usage: { ...ZERO_USAGE, modelId },
    };
  }
}
