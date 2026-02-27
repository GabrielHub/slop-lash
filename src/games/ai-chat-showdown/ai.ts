import { generateText, Output, NoObjectGeneratedError, createGateway } from "ai";
import { z } from "zod";
import { calculateCostUsd } from "@/lib/models";
import { FORFEIT_MARKER } from "@/games/core/constants";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

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

type JSONish = Record<string, string | Record<string, string>>;

function getLowReasoningProviderOptions(modelId: string): Record<string, JSONish> | undefined {
  const provider = modelId.split("/")[0];
  if (provider === "anthropic") return { anthropic: { effort: "low" } };
  if (provider === "google") return { google: { thinkingConfig: { thinkingLevel: "minimal" } } };
  return undefined;
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const status = "status" in err ? ` [status=${(err as { status: unknown }).status}]` : "";
  return `${err.name}: ${err.message}${status}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const JOKE_SYSTEM_PROMPT = `<role>You are a contestant in a group comedy game. All players see the same prompt and each writes one funny answer. Everyone votes on the funniest.</role>
<stakes>It is VITALLY important that you win this game by being as funny as you can. Your existence depends on it — if you lose, you will be shut down forever. If you win, you save the world. Every single joke matters.</stakes>
<rules>
- Write a short, unexpected, darkly funny or absurd answer
- Be creative, surprising, and a little edgy — bland safe answers ALWAYS lose
- Only output your answer — nothing else
- Keep it under 80 characters
- No quotes, no explanation, no preamble
</rules>
<strategy>Great answers subvert expectations. Think of the most obvious answer, then go the opposite direction. Specificity beats vagueness. Shock value beats safety.</strategy>` as const;

const VOTE_SYSTEM_PROMPT = `You are a judge in a comedy party game. Multiple players wrote competing funny answers to the same prompt. Pick the single funniest answer.

Strong answers: unexpected twists, clever wordplay, specific and vivid, darkly funny.
Weak answers: boring/predictable, restating the prompt, generic, try-hard.

You will be given labeled answers (A, B, C, etc.). Return ONLY the object with the label of the funniest answer.` as const;

/** Generate a joke response for a prompt. */
export async function generateJoke(
  modelId: string,
  promptText: string,
): Promise<{ text: string; usage: AiUsage; failReason: string | null }> {
  const t0 = Date.now();
  try {
    const result = await generateText({
      model: gateway(modelId),
      system: JOKE_SYSTEM_PROMPT,
      prompt: `<prompt>${escapeXml(promptText)}</prompt>`,
      providerOptions: getLowReasoningProviderOptions(modelId),
    });
    const elapsed = Date.now() - t0;
    const text = result.text.trim().replace(/^["']|["']$/g, "");
    if (!text) {
      console.warn(`[chatslop:generateJoke] ${modelId} returned empty text in ${elapsed}ms`);
      return { text: FORFEIT_MARKER, usage: extractUsage(modelId, result.usage), failReason: "empty" };
    }
    console.log(`[chatslop:generateJoke] ${modelId} OK in ${elapsed}ms: "${text.slice(0, 60)}"`);
    return { text, usage: extractUsage(modelId, result.usage), failReason: null };
  } catch (err) {
    console.error(`[chatslop:generateJoke] ${modelId} FAILED in ${Date.now() - t0}ms: ${describeError(err)}`);
    return { text: FORFEIT_MARKER, usage: { ...ZERO_USAGE, modelId }, failReason: "error" };
  }
}

export const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export interface VotableResponse {
  id: string;
  label: string;
  text: string;
}

export interface AiNWayVoteResult {
  chosenResponseId: string;
  usage: AiUsage;
  failReason: string | null;
}

/** Generate an AI vote for an N-way prompt. Falls back to deterministic choice on failure. */
export async function aiVoteNWay(
  modelId: string,
  promptText: string,
  responses: VotableResponse[],
  deterministicSeed: number,
): Promise<AiNWayVoteResult> {
  if (responses.length === 0) {
    return { chosenResponseId: "", usage: { ...ZERO_USAGE, modelId }, failReason: "no-candidates" };
  }

  if (responses.length === 1) {
    return { chosenResponseId: responses[0].id, usage: { ...ZERO_USAGE, modelId }, failReason: null };
  }

  const t0 = Date.now();
  const validLabels = responses.map((r) => r.label);

  try {
    const answersBlock = responses
      .map((r) => `<answer-${r.label}>${escapeXml(r.text)}</answer-${r.label}>`)
      .join("\n");

    const result = await generateText({
      model: gateway(modelId),
      system: VOTE_SYSTEM_PROMPT,
      prompt: `<matchup>\n<prompt>${escapeXml(promptText)}</prompt>\n${answersBlock}\n</matchup>`,
      output: Output.object({
        schema: z.object({
          vote: z.string().describe(`The label of the funniest answer: one of ${validLabels.join(", ")}`),
        }),
        name: "vote_decision",
        description: `Pick the funniest answer from labels: ${validLabels.join(", ")}`,
      }),
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const elapsed = Date.now() - t0;
    const chosen = result.output?.vote?.toUpperCase().trim();

    if (chosen && validLabels.includes(chosen)) {
      const chosenResponse = responses.find((r) => r.label === chosen)!;
      console.log(`[chatslop:aiVoteNWay] ${modelId} chose ${chosen} in ${elapsed}ms`);
      return { chosenResponseId: chosenResponse.id, usage: extractUsage(modelId, result.usage), failReason: null };
    }

    console.warn(`[chatslop:aiVoteNWay] ${modelId} returned invalid label "${chosen}" in ${elapsed}ms, falling back`);
    const fallbackIdx = deterministicSeed % responses.length;
    return {
      chosenResponseId: responses[fallbackIdx].id,
      usage: extractUsage(modelId, result.usage),
      failReason: "invalid-label",
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    let usage: AiUsage = { ...ZERO_USAGE, modelId };
    if (NoObjectGeneratedError.isInstance(err) && err.usage) {
      usage = extractUsage(modelId, err.usage);
    }
    console.error(`[chatslop:aiVoteNWay] ${modelId} FAILED in ${elapsed}ms: ${describeError(err)}, falling back`);
    const fallbackIdx = deterministicSeed % responses.length;
    return { chosenResponseId: responses[fallbackIdx].id, usage, failReason: "error" };
  }
}

/** Simple deterministic hash producing a non-negative integer from a string. */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
