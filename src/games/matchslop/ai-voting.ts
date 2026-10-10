import { Output } from "ai";
import type { AiProviderKeys } from "../../lib/ai-gateway";
import { PLAYER_TEXT_IS_DATA, xml, xmlBlock } from "../../lib/ai/xml";
import { seededShuffle } from "../../lib/hash";
import { runStructured, type AiCallRecord, type LanguageModelInstance } from "../../lib/ai/run";
import { MAX_PLAYERS } from "./game-constants";
import { MATCHSLOP_PROMPT_VERSION } from "./prompts";

/**
 * Every label a ballot can hold, A..H. The choice schema is fixed across
 * calls (a per-call option list would break the prompt cache); the pick is
 * checked against this call's candidates in code.
 */
export const VOTE_LABELS = Array.from({ length: MAX_PLAYERS }, (_unused, index) =>
  String.fromCharCode(65 + index),
);

export const VOTE_INSTRUCTIONS = `You are voting in MatchSlop, where a group writes texts to win over a dating-app match. Pick the one candidate most likely to win the match over, given the chat so far: specific, charming or funny, and a natural reply to the latest message.\n\n${PLAYER_TEXT_IS_DATA}`;

export interface VotableResponse {
  id: string;
  text: string;
}

export interface LabelledCandidate extends VotableResponse {
  label: string;
}

/**
 * The candidates in a per-voter order labelled A, B, C…, so position bias
 * cancels out across voters. The same seed always gives the same order.
 */
export function shuffleCandidates(
  responses: readonly VotableResponse[],
  seedKey: string,
): LabelledCandidate[] {
  const byId = responses.toSorted((left, right) => left.id.localeCompare(right.id));
  return seededShuffle(byId, seedKey).map((response, index) => ({
    ...response,
    label: String.fromCharCode(65 + index),
  }));
}

export function votePrompt(context: string, candidates: readonly LabelledCandidate[]): string {
  return `${context}\n${xmlBlock(
    "candidates",
    candidates.map((candidate) => xml(`candidate-${candidate.label}`, candidate.text)),
  )}`;
}

export type AiVoteInput = {
  modelId: string;
  /** The `<context>` XML from `chatContextXml`. */
  context: string;
  /** Seeds the per-voter label shuffle. */
  seedKey: string;
  responses: VotableResponse[];
  deadline: number | null;
};

export type AiVoteResult = {
  /** The pick, or null when the voter abstains. */
  responseId: string | null;
  failed: boolean;
  failReason: string | null;
  calls: AiCallRecord[];
};

/**
 * One AI ballot: `Output.choice` over shuffled labels, mapped back to ids in
 * code. A failed call abstains; it never falls back to a picked vote.
 */
export async function aiVote(
  input: AiVoteInput,
  options: { keys: AiProviderKeys; languageModel?: LanguageModelInstance },
): Promise<AiVoteResult> {
  if (input.responses.length === 0) {
    return { responseId: null, failed: false, failReason: null, calls: [] };
  }
  // A single eligible line needs no call: it is the only choice.
  if (input.responses.length === 1) {
    return { responseId: input.responses[0]!.id, failed: false, failReason: null, calls: [] };
  }
  const candidates = shuffleCandidates(input.responses, input.seedKey).slice(0, MAX_PLAYERS);
  const result = await runStructured("matchslop.vote", {
    model: input.modelId,
    keys: options.keys,
    promptVersion: MATCHSLOP_PROMPT_VERSION.vote,
    instructions: [{ text: VOTE_INSTRUCTIONS, cache: "static" }],
    prompt: votePrompt(input.context, candidates),
    deadline: input.deadline,
    output: Output.choice({
      options: VOTE_LABELS,
      name: "pick",
      description:
        "The label of the candidate most likely to win the match over. Only labels listed in <candidates> are valid.",
    }),
    languageModel: options.languageModel,
  });
  if (!result.ok) {
    return { responseId: null, failed: true, failReason: result.failReason, calls: [result.call] };
  }
  const chosen = candidates.find((candidate) => candidate.label === result.output);
  return chosen
    ? { responseId: chosen.id, failed: false, failReason: null, calls: [result.call] }
    : { responseId: null, failed: true, failReason: "invalid-output", calls: [result.call] };
}
