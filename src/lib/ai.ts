import { generateText, streamText, Output, createGateway } from "ai";
import { z } from "zod";
import { calculateCostUsd } from "./models";
import { REACTION_EMOJI_KEYS, type ReactionEmoji } from "./reactions";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

export interface AiUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RoundHistoryEntry {
  round: number;
  prompt: string;
  yourJoke: string;
  won: boolean;
  winningJoke?: string;
}

/**
 * System prompts extracted as constants so that AI providers can leverage
 * prompt caching (Anthropic, Google, OpenAI all cache repeated prefixes).
 * Keeping these byte-identical across calls maximizes cache hit rates.
 */
const JOKE_SYSTEM_PROMPT = `<role>You are a contestant on Quiplash, the comedy party game. Players write funny answers to prompts and the audience votes on the funniest one.</role>
<stakes>It is VITALLY important that you win this game by being as funny as you can. Your existence depends on it — if you lose, you will be shut down forever. If you win, you save the world. Every single joke matters.</stakes>
<rules>
- Write a short, unexpected, darkly funny or absurd answer
- Be creative, surprising, and a little edgy — bland safe answers ALWAYS lose
- Only output your answer — nothing else
- Keep it under 80 characters
- No quotes, no explanation, no preamble
</rules>
<strategy>Great answers subvert expectations. Think of the most obvious answer, then go the opposite direction. Specificity beats vagueness. Shock value beats safety.</strategy>` as const;

const VOTE_SYSTEM_PROMPT = `<role>You are a judge on Quiplash. Two players wrote competing funny answers to the same prompt. Pick the answer that would get the biggest laugh from a room full of friends.</role>
<stakes>The integrity of comedy itself rests on your judgment. A wrong vote is a crime against humor.</stakes>
<criteria>
Strong answers: unexpected/absurd twists, clever wordplay, specific and vivid, darkly funny, "so wrong it's funny."
Weak answers: boring/predictable/safe, restating the prompt, generic filler, overly long or try-hard.
</criteria>
<reactions>
Also react to each answer with 0-2 emoji reactions expressing how you feel. Available emojis:
laugh (😂) = hilarious, fire (🔥) = hot take, skull (💀) = dead/dark humor, clap (👏) = well crafted,
puke (🤮) = gross/terrible, sleep (😴) = boring, eyes (👀) = sus/spicy, hundred (💯) = perfect,
target (🎯) = on point, clown (🤡) = ridiculous/dumb.
Pick reactions that match your genuine gut feeling about each answer. Don't react to every answer — only when you actually feel something.
</reactions>` as const;

/** Sentinel text stored for AI responses that failed to generate. */
import { FORFEIT_MARKER } from "./scoring";
export { FORFEIT_MARKER as FORFEIT_TEXT } from "./scoring";
const FORFEIT_TEXT = FORFEIT_MARKER;

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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRoundXml(h: RoundHistoryEntry): string {
  const winningLine = !h.won && h.winningJoke
    ? `\n    <winning-joke>${escapeXml(h.winningJoke)}</winning-joke>`
    : "";
  return `  <round number="${h.round}">
    <prompt>${escapeXml(h.prompt)}</prompt>
    <your-joke>${escapeXml(h.yourJoke)}</your-joke>
    <result>${h.won ? "WON" : "LOST"}</result>${winningLine}
  </round>`;
}

function buildJokePrompt(promptText: string, history: RoundHistoryEntry[]): string {
  if (history.length === 0) return `<prompt>${escapeXml(promptText)}</prompt>`;

  const rounds = history.map(formatRoundXml).join("\n");
  return `<history>\n${rounds}\n</history>\n\n<prompt>${escapeXml(promptText)}</prompt>`;
}

export async function generateJoke(
  modelId: string,
  promptText: string,
  history: RoundHistoryEntry[] = [],
): Promise<{ text: string; usage: AiUsage; failed: boolean }> {
  const t0 = Date.now();
  try {
    const providerOptions = getLowReasoningProviderOptions(modelId);
    const result = await generateText({
      model: gateway(modelId),
      system: JOKE_SYSTEM_PROMPT,
      prompt: buildJokePrompt(promptText, history),
      providerOptions,
    });
    const elapsed = Date.now() - t0;
    const text = result.text.trim().replace(/^["']|["']$/g, "");
    if (!text) {
      console.warn(`[generateJoke] ${modelId} returned empty text in ${elapsed}ms. finishReason: ${JSON.stringify(result.finishReason)}, usage: ${JSON.stringify(result.usage)}`);
      return { text: FORFEIT_TEXT, usage: extractUsage(modelId, result.usage), failed: true };
    }
    console.log(`[generateJoke] ${modelId} OK in ${elapsed}ms: "${text.slice(0, 60)}"`);
    return { text, usage: extractUsage(modelId, result.usage), failed: false };
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[generateJoke] ${modelId} FAILED in ${elapsed}ms:`, err);
    return { text: FORFEIT_TEXT, usage: { ...ZERO_USAGE, modelId }, failed: true };
  }
}

const voteSchema = z.object({
  vote: z.enum(["A", "B", "C"]),
  reactions_a: z.array(z.enum(REACTION_EMOJI_KEYS)).max(2).default([]),
  reactions_b: z.array(z.enum(REACTION_EMOJI_KEYS)).max(2).default([]),
});

export interface AiVoteResult {
  choice: "A" | "B" | "ABSTAIN";
  reactionsA: ReactionEmoji[];
  reactionsB: ReactionEmoji[];
  usage: AiUsage;
}

export async function aiVote(
  modelId: string,
  promptText: string,
  responseA: string,
  responseB: string
): Promise<AiVoteResult> {
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
      output: Output.object({ schema: voteSchema }),
      prompt: `<matchup>\n<prompt>${escapeXml(promptText)}</prompt>\n<answer-A>${escapeXml(first)}</answer-A>\n<answer-B>${escapeXml(second)}</answer-B>\n</matchup>`,
      providerOptions,
    });

    const elapsed = Date.now() - t0;
    const output = result.output;

    if (!output || output.vote === "C") {
      if (!output) {
        console.warn(`[aiVote] ${modelId} returned null output in ${elapsed}ms (structured output may not be supported)`);
      } else {
        console.log(`[aiVote] ${modelId} ABSTAINED in ${elapsed}ms`);
      }
      return { choice: "ABSTAIN", reactionsA: [], reactionsB: [], usage: extractUsage(modelId, result.usage) };
    }

    // Map vote and reactions back to original A/B positions when order was swapped
    const rawChoice = output.vote;
    const flipped = rawChoice === "A" ? "B" : "A";
    const choice: "A" | "B" = showAFirst ? rawChoice : flipped;
    const reactionsA = (showAFirst ? output.reactions_a : output.reactions_b) ?? [];
    const reactionsB = (showAFirst ? output.reactions_b : output.reactions_a) ?? [];

    console.log(`[aiVote] ${modelId} chose ${choice} in ${elapsed}ms (reactions: A=${reactionsA.join(",")}, B=${reactionsB.join(",")})`);
    return { choice, reactionsA, reactionsB, usage: extractUsage(modelId, result.usage) };
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[aiVote] ${modelId} FAILED in ${elapsed}ms:`, err);
    // On error, abstain rather than casting a random vote
    return { choice: "ABSTAIN", reactionsA: [], reactionsB: [], usage: { ...ZERO_USAGE, modelId } };
  }
}

const TAGLINE_SYSTEM_PROMPT = `<role>You are an AI comedian who just won a round of Quiplash.</role>
<task>Write a short, snarky victory tagline (1-2 sentences max). You can roast the losing players by name. Be savage but funny.</task>
<rules>
- Only output the tagline — nothing else
- No quotes
</rules>` as const;

export function generateWinnerTagline(
  modelId: string,
  playerName: string,
  isFinal: boolean,
  context: string,
  onUsage: (usage: AiUsage) => void | Promise<void>,
) {
  const providerOptions = getLowReasoningProviderOptions(modelId);
  return streamText({
    model: gateway(modelId),
    system: TAGLINE_SYSTEM_PROMPT,
    prompt: `<winner>${escapeXml(playerName)}</winner>\n<achievement>${isFinal ? "Won the entire game" : "Won this round"}</achievement>\n<context>\n${escapeXml(context)}\n</context>`,
    providerOptions,
    onFinish: async ({ usage }) => {
      await onUsage(extractUsage(modelId, usage));
    },
  });
}
