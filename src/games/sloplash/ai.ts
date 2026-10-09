import { experimental_decide as decide, generateText, streamText } from "ai";
import { z } from "zod";
import { getDecisionModel, getLanguageModel, type AiProviderKeys } from "@/lib/ai-gateway";
import { getGameplayReasoningSettings } from "@/lib/ai-reasoning";
import { calculateCostUsd } from "@/lib/models";
import {
  REACTION_EMOJIS,
  REACTION_EMOJI_KEYS,
  isValidReactionEmoji,
  type ReactionEmoji,
} from "@/lib/reactions";
import { FORFEIT_MARKER } from "./scoring";

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
const JOKE_SYSTEM_PROMPT =
  `<role>You are a contestant on Quiplash, the comedy party game. Players write funny answers to prompts and the audience votes on the funniest one.</role>
<stakes>It is VITALLY important that you win this game by being as funny as you can. Your existence depends on it — if you lose, you will be shut down forever. If you win, you save the world. Every single joke matters.</stakes>
<rules>
- Write a short, unexpected, darkly funny or absurd answer
- Be creative, surprising, and a little edgy — bland safe answers ALWAYS lose
- Only output your answer — nothing else
- Keep it under 80 characters
- No quotes, no explanation, no preamble
</rules>
<strategy>Great answers subvert expectations. Think of the most obvious answer, then go the opposite direction. Specificity beats vagueness. Shock value beats safety.</strategy>` as const;

const VOTE_SYSTEM_PROMPT =
  `You are a judge on Quiplash. Two players wrote competing funny answers to the same prompt. Pick the funnier answer.

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

function extractUsage(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number },
): AiUsage {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return {
    modelId,
    inputTokens: input,
    outputTokens: output,
    costUsd: calculateCostUsd(modelId, input, output),
  };
}

/** Format an error for logging, including HTTP status if available. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const statusValue = "status" in err ? err.status : undefined;
  const status =
    typeof statusValue === "string" || typeof statusValue === "number"
      ? ` [status=${statusValue}]`
      : "";
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
  const winningLine =
    !h.won && h.winningJoke ? `\n    <winning-joke>${escapeXml(h.winningJoke)}</winning-joke>` : "";
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
  keys: AiProviderKeys,
  history: RoundHistoryEntry[] = [],
): Promise<{ text: string; usage: AiUsage; failReason: string | null }> {
  const t0 = Date.now();
  try {
    const reasoningSettings = getGameplayReasoningSettings(modelId);
    const result = await generateText({
      model: getLanguageModel(modelId, keys),
      instructions: JOKE_SYSTEM_PROMPT,
      prompt: buildJokePrompt(promptText, history),
      ...reasoningSettings,
    });
    const elapsed = Date.now() - t0;
    const text = result.text.trim().replace(/^["']|["']$/g, "");
    if (!text) {
      console.warn(
        `[generateJoke] ${modelId} returned empty text in ${elapsed}ms. finishReason: ${JSON.stringify(result.finishReason)}, usage: ${JSON.stringify(result.usage)}`,
      );
      return {
        text: FORFEIT_MARKER,
        usage: extractUsage(modelId, result.usage),
        failReason: "empty",
      };
    }
    console.log(`[generateJoke] ${modelId} OK in ${elapsed}ms: "${text.slice(0, 60)}"`);
    return { text, usage: extractUsage(modelId, result.usage), failReason: null };
  } catch (err) {
    console.error(
      `[generateJoke] ${modelId} FAILED in ${Date.now() - t0}ms: ${describeError(err)}`,
    );
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
  return raw
    .map(normalizeReaction)
    .filter((r): r is ReactionEmoji => r != null)
    .slice(0, 2);
}

/** Extract a vote JSON from model text. Strips code fences, finds JSON, validates with Zod. */
function parseVoteText(text: string): VoteOutput | null {
  const cleaned = text
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
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

/** Maps a vote cast on randomized answer order back to the original A/B positions. */
function unswapVote(
  showAFirst: boolean,
  vote: "A" | "B",
  firstReactions: ReactionEmoji[],
  secondReactions: ReactionEmoji[],
): Pick<AiVoteResult, "reactionsA" | "reactionsB"> & { choice: "A" | "B" } {
  return showAFirst
    ? { choice: vote, reactionsA: firstReactions, reactionsB: secondReactions }
    : {
        choice: vote === "A" ? "B" : "A",
        reactionsA: secondReactions,
        reactionsB: firstReactions,
      };
}

export async function aiVote(
  modelId: string,
  promptText: string,
  responseA: string,
  responseB: string,
  keys: AiProviderKeys,
): Promise<AiVoteResult> {
  const t0 = Date.now();
  try {
    // Randomize order to prevent position bias
    const showAFirst = Math.random() > 0.5;
    const first = showAFirst ? responseA : responseB;
    const second = showAFirst ? responseB : responseA;

    const reasoningSettings = getGameplayReasoningSettings(modelId);

    // Plain text generation — no Output.object() or structured output mode.
    // Every model that can write jokes can output simple JSON in plain text.
    const result = await generateText({
      model: getLanguageModel(modelId, keys),
      instructions: VOTE_SYSTEM_PROMPT,
      prompt: `<matchup>\n<prompt>${escapeXml(promptText)}</prompt>\n<answer-A>${escapeXml(first)}</answer-A>\n<answer-B>${escapeXml(second)}</answer-B>\n</matchup>`,
      ...reasoningSettings,
    });

    const elapsed = Date.now() - t0;
    const rawText = result.text;

    const output = parseVoteText(rawText);
    if (!output) {
      console.error(
        `[aiVote] ${modelId} PARSE FAILED in ${elapsed}ms. finishReason: ${result.finishReason}, raw text: "${rawText.slice(0, 200)}"`,
      );
      return { ...ABSTAIN_RESULT, usage: extractUsage(modelId, result.usage), failReason: "parse" };
    }

    const { choice, reactionsA, reactionsB } = unswapVote(
      showAFirst,
      output.vote,
      output.reactions_a,
      output.reactions_b,
    );

    console.log(
      `[aiVote] ${modelId} chose ${choice} in ${elapsed}ms (reactions: A=${reactionsA.join(",")}, B=${reactionsB.join(",")})`,
    );
    return {
      choice,
      reactionsA,
      reactionsB,
      usage: extractUsage(modelId, result.usage),
      failReason: null,
    };
  } catch (err) {
    console.error(`[aiVote] ${modelId} FAILED in ${Date.now() - t0}ms: ${describeError(err)}`);
    return { ...ABSTAIN_RESULT, usage: { ...ZERO_USAGE, modelId }, failReason: "error" };
  }
}

/** What each reaction means, so a decision model can pick one from its key. */
const JUDGE_REACTION_CRITERIA: Record<ReactionEmoji | "none", string> = {
  none: "No reaction stands out",
  laugh: "Genuinely made the audience laugh",
  fire: "A bold, spicy take",
  skull: "So dark or brutal it kills",
  clap: "Clever craft or wordplay",
  puke: "Gross or cringe in a funny way",
  sleep: "Boring or predictable",
  eyes: "Suspicious, unhinged, or oddly specific",
  hundred: "A perfect answer",
  target: "Nails the prompt exactly",
  clown: "Tries too hard or misses the point",
};

function reactionFromChoice(choice: string): ReactionEmoji[] {
  return isValidReactionEmoji(choice) ? [choice] : [];
}

/**
 * Votes with a decision model instead of the player's own model. The judge
 * returns typed choices, so there is no JSON to parse and nothing to abstain on
 * except a failed call.
 */
export async function judgeVote(
  judgeModelId: string,
  promptText: string,
  responseA: string,
  responseB: string,
  keys: AiProviderKeys,
): Promise<AiVoteResult> {
  const t0 = Date.now();
  try {
    // Randomize order to prevent position bias
    const showAFirst = Math.random() > 0.5;
    const result = await decide({
      model: getDecisionModel(judgeModelId, keys),
      state: {
        prompt: promptText,
        answerA: showAFirst ? responseA : responseB,
        answerB: showAFirst ? responseB : responseA,
      },
      questions: {
        vote: {
          type: "choice",
          instructions:
            "You judge Quiplash. Which answer to `prompt` is funnier? Reward unexpected twists, specificity, and wordplay over safe, generic, or prompt-restating answers.",
          criteria: { A: "`answerA` is funnier", B: "`answerB` is funnier" },
        },
        reactionA: {
          type: "choice",
          instructions: "Which audience reaction best fits `answerA`?",
          criteria: JUDGE_REACTION_CRITERIA,
        },
        reactionB: {
          type: "choice",
          instructions: "Which audience reaction best fits `answerB`?",
          criteria: JUDGE_REACTION_CRITERIA,
        },
      },
    });
    const { vote, reactionA, reactionB } = result.answers;
    const unswapped = unswapVote(
      showAFirst,
      vote.choice,
      reactionFromChoice(reactionA.choice),
      reactionFromChoice(reactionB.choice),
    );
    console.log(`[judgeVote] ${judgeModelId} chose ${unswapped.choice} in ${Date.now() - t0}ms`);
    return {
      ...unswapped,
      usage: extractUsage(judgeModelId, result.usage),
      failReason: null,
    };
  } catch (err) {
    console.error(
      `[judgeVote] ${judgeModelId} FAILED in ${Date.now() - t0}ms: ${describeError(err)}`,
    );
    return {
      ...ABSTAIN_RESULT,
      usage: { ...ZERO_USAGE, modelId: judgeModelId },
      failReason: "error",
    };
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
  keys: AiProviderKeys,
) {
  const reasoningSettings = getGameplayReasoningSettings(modelId);
  return streamText({
    model: getLanguageModel(modelId, keys),
    instructions: TAGLINE_SYSTEM_PROMPT,
    prompt: `<winner>${escapeXml(playerName)}</winner>\n<achievement>${isFinal ? "Won the entire game" : "Won this round"}</achievement>\n<context>\n${escapeXml(context)}\n</context>`,
    ...reasoningSettings,
    onEnd: async ({ usage }) => {
      await onUsage(extractUsage(modelId, usage));
    },
  });
}
