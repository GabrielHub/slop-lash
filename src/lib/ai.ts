import { generateText, streamText, createGateway } from "ai";
import { z } from "zod";
import { calculateCostUsd } from "./models";
import { REACTION_EMOJIS, REACTION_EMOJI_KEYS, type ReactionEmoji } from "./reactions";
import { FORFEIT_MARKER } from "./scoring";

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

const VOTE_SYSTEM_PROMPT = `You are a judge on Quiplash. Two players wrote competing funny answers to the same prompt. Pick the funnier answer.

Strong answers: unexpected twists, clever wordplay, specific and vivid, darkly funny.
Weak answers: boring/predictable, restating the prompt, generic, try-hard.

You may also react to each answer with emoji keys: laugh, fire, skull, clap, puke, sleep, eyes, hundred, target, clown.

Respond with ONLY this JSON (no other text):
{"vote":"A or B","reactions_a":[],"reactions_b":[]}` as const;

export { FORFEIT_MARKER as FORFEIT_TEXT } from "./scoring";

const ABSTAIN_RESULT: Omit<AiVoteResult, "usage" | "failReason"> = {
  choice: "ABSTAIN",
  reactionsA: [],
  reactionsB: [],
};

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
  // xai: using non-reasoning model, no reasoning options needed
  // openai/gpt-5.2 is not a reasoning model (o3/o4-mini are)
  // deepseek: only enable/disable, no effort levels — leave default
  // moonshotai, minimax, zai, xiaomi: no documented reasoning options
  return undefined;
}

/** Format an error for logging, including HTTP status if available. */
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
): Promise<{ text: string; usage: AiUsage; failReason: string | null }> {
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
      return { text: FORFEIT_MARKER, usage: extractUsage(modelId, result.usage), failReason: "empty" };
    }
    console.log(`[generateJoke] ${modelId} OK in ${elapsed}ms: "${text.slice(0, 60)}"`);
    return { text, usage: extractUsage(modelId, result.usage), failReason: null };
  } catch (err) {
    console.error(`[generateJoke] ${modelId} FAILED in ${Date.now() - t0}ms: ${describeError(err)}`);
    return { text: FORFEIT_MARKER, usage: { ...ZERO_USAGE, modelId }, failReason: "error" };
  }
}

const voteSchema = z.object({
  vote: z.enum(["A", "B"]),
  reactions_a: z.array(z.string()).default([]),
  reactions_b: z.array(z.string()).default([]),
});

interface VoteOutput {
  vote: "A" | "B";
  reactions_a: ReactionEmoji[];
  reactions_b: ReactionEmoji[];
}

/** Map emoji characters back to their key names (e.g. "🔥" → "fire"). */
const emojiToKey = new Map<string, ReactionEmoji>(
  Object.entries(REACTION_EMOJIS).map(([k, v]) => [v, k as ReactionEmoji]),
);

/** Normalize a reaction value to a valid key, or null if unrecognized. */
function normalizeReaction(raw: string): ReactionEmoji | null {
  if (REACTION_EMOJI_KEYS.includes(raw as ReactionEmoji)) return raw as ReactionEmoji;
  return emojiToKey.get(raw) ?? null;
}

/** Normalize a raw reactions array into at most 2 valid emoji keys. */
function normalizeReactions(raw: string[]): ReactionEmoji[] {
  return raw.map(normalizeReaction).filter((r): r is ReactionEmoji => r != null).slice(0, 2);
}

/** Extract a vote JSON from model text. Strips code fences, finds JSON, validates with Zod. */
function parseVoteText(text: string): VoteOutput | null {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result = voteSchema.safeParse(parsed);
    if (!result.success) return null;
    return {
      vote: result.data.vote,
      reactions_a: normalizeReactions(result.data.reactions_a),
      reactions_b: normalizeReactions(result.data.reactions_b),
    };
  } catch {
    return null;
  }
}

export interface AiVoteResult {
  choice: "A" | "B" | "ABSTAIN";
  reactionsA: ReactionEmoji[];
  reactionsB: ReactionEmoji[];
  usage: AiUsage;
  failReason: string | null;
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

    // Plain text generation — no Output.object() or structured output mode.
    // Every model that can write jokes can output simple JSON in plain text.
    const result = await generateText({
      model: gateway(modelId),
      system: VOTE_SYSTEM_PROMPT,
      prompt: `<matchup>\n<prompt>${escapeXml(promptText)}</prompt>\n<answer-A>${escapeXml(first)}</answer-A>\n<answer-B>${escapeXml(second)}</answer-B>\n</matchup>`,
      providerOptions,
    });

    const elapsed = Date.now() - t0;
    const rawText = result.text;

    const output = parseVoteText(rawText);
    if (!output) {
      console.error(`[aiVote] ${modelId} PARSE FAILED in ${elapsed}ms. finishReason: ${result.finishReason}, raw text: "${rawText.slice(0, 200)}"`);
      return { ...ABSTAIN_RESULT, usage: extractUsage(modelId, result.usage), failReason: "parse" };
    }

    // Map vote and reactions back to original A/B positions when order was swapped
    const flipped = output.vote === "A" ? "B" : "A";
    const choice: "A" | "B" = showAFirst ? output.vote : flipped;
    const reactionsA = showAFirst ? output.reactions_a : output.reactions_b;
    const reactionsB = showAFirst ? output.reactions_b : output.reactions_a;

    console.log(`[aiVote] ${modelId} chose ${choice} in ${elapsed}ms (reactions: A=${reactionsA.join(",")}, B=${reactionsB.join(",")})`);
    return { choice, reactionsA, reactionsB, usage: extractUsage(modelId, result.usage), failReason: null };
  } catch (err) {
    console.error(`[aiVote] ${modelId} FAILED in ${Date.now() - t0}ms: ${describeError(err)}`);
    return { ...ABSTAIN_RESULT, usage: { ...ZERO_USAGE, modelId }, failReason: "error" };
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
