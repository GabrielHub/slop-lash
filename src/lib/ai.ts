import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const provider = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1",
});

const jokeSchema = z.object({ joke: z.string() });
const voteSchema = z.object({ vote: z.enum(["A", "B"]) });

export async function generateJoke(
  modelId: string,
  promptText: string
): Promise<string> {
  try {
    const result = await generateText({
      model: provider(modelId),
      maxOutputTokens: 150,
      output: Output.object({ schema: jokeSchema }),
      prompt: `You are playing Quiplash, a party game where players write funny responses to prompts. Write a short, witty, funny response (under 100 characters) to this prompt: "${promptText}". Be creative and unexpected. Do NOT repeat the prompt.`,
    });
    return result.output?.joke ?? "I got nothing...";
  } catch {
    return "My circuits are fried... 🤖";
  }
}

export async function aiVote(
  modelId: string,
  promptText: string,
  responseA: string,
  responseB: string
): Promise<"A" | "B"> {
  try {
    const result = await generateText({
      model: provider(modelId),
      maxOutputTokens: 50,
      output: Output.object({ schema: voteSchema }),
      prompt: `You're a judge in Quiplash. Which response to "${promptText}" is funnier?\n\nA: "${responseA}"\nB: "${responseB}"\n\nPick the funnier one. Vote A or B.`,
    });
    return result.output?.vote ?? "A";
  } catch {
    return Math.random() > 0.5 ? "A" : "B";
  }
}
