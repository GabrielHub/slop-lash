import { generateText, Output } from "ai";
import { createOpenAI, type OpenAILanguageModelChatOptions } from "@ai-sdk/openai";
import { z } from "zod";
import { calculateCostUsd } from "./models";

const provider = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1",
});

const LOW_REASONING: { openai: OpenAILanguageModelChatOptions } = {
  openai: { reasoningEffort: "low" },
};

export interface AiUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const ZERO_USAGE: AiUsage = { modelId: "", inputTokens: 0, outputTokens: 0, costUsd: 0 };

function extractUsage(modelId: string, usage: { inputTokens?: number; outputTokens?: number }): AiUsage {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return { modelId, inputTokens: input, outputTokens: output, costUsd: calculateCostUsd(modelId, input, output) };
}

const jokeSchema = z.object({
  joke: z.string().describe("Your Quiplash answer, under 80 characters"),
});

export async function generateJoke(
  modelId: string,
  promptText: string
): Promise<{ text: string; usage: AiUsage }> {
  try {
    const result = await generateText({
      model: provider(modelId),
      maxOutputTokens: 150,
      system:
        "You are a Quiplash player. Write a short, unexpected, funny answer to each prompt. Only output the joke — nothing else. Keep it under 80 characters.",
      output: Output.object({ schema: jokeSchema }),
      prompt: promptText,
      providerOptions: LOW_REASONING,
    });
    return {
      text: result.output?.joke ?? "I got nothing...",
      usage: extractUsage(modelId, result.usage),
    };
  } catch {
    return { text: "My circuits are fried... 🤖", usage: { ...ZERO_USAGE, modelId } };
  }
}

export async function aiVote(
  modelId: string,
  promptText: string,
  responseA: string,
  responseB: string
): Promise<{ choice: "A" | "B"; usage: AiUsage }> {
  try {
    // Randomize order to prevent position bias
    const showAFirst = Math.random() > 0.5;
    const first = showAFirst ? responseA : responseB;
    const second = showAFirst ? responseB : responseA;

    const result = await generateText({
      model: provider(modelId),
      maxOutputTokens: 50,
      system: "You are a Quiplash judge. Pick the funnier answer: A or B.",
      output: Output.choice({ options: ["A", "B"] as const }),
      prompt: `Prompt: "${promptText}"\n\nA: "${first}"\nB: "${second}"`,
      providerOptions: LOW_REASONING,
    });

    const rawChoice = result.output ?? "A";
    // Map back to original A/B positions when order was swapped
    const choice = showAFirst ? rawChoice : rawChoice === "A" ? "B" : "A";
    return { choice, usage: extractUsage(modelId, result.usage) };
  } catch {
    return {
      choice: Math.random() > 0.5 ? "A" : "B",
      usage: { ...ZERO_USAGE, modelId },
    };
  }
}
