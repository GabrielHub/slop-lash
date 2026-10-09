import { FREE_PLAY_JUDGE_MODEL_ID } from "../../../lib/free-play";
import { getModelByModelId, getModelInfo } from "../../../lib/models";

export const QUIZSLOP_AI_PROMPT_VERSION = "quizslop-fresh-pack-v2";
export const QUIZSLOP_AI_SCHEMA_VERSION = "quizslop-frozen-pack-v1";

/** Server-owned. Hosts choose only the generator. */
export const QUIZSLOP_FIXED_VERIFIER_MODEL_ID = "openai/gpt-6.1-sol";
/** Free Play rooms verify with the Jev decision model instead. */
export const QUIZSLOP_VERIFIER_MODEL_IDS = [
  QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
  FREE_PLAY_JUDGE_MODEL_ID,
] as const;
type QuizSlopVerifierModelId = (typeof QUIZSLOP_VERIFIER_MODEL_IDS)[number];

function isQuizSlopVerifierModelId(modelId: string): modelId is QuizSlopVerifierModelId {
  return (QUIZSLOP_VERIFIER_MODEL_IDS as readonly string[]).includes(modelId);
}

export type QuizSlopContentConfig =
  | { mode: "CATALOG" }
  | {
      mode: "AI";
      generatorModelId: string;
      verifierModelId: QuizSlopVerifierModelId;
      promptVersion: typeof QUIZSLOP_AI_PROMPT_VERSION;
      schemaVersion: typeof QUIZSLOP_AI_SCHEMA_VERSION;
    };

type QuizSlopContentConfigInput =
  | { mode: "CATALOG" }
  | { mode: "AI"; generatorModelId: string; verifierModelId?: string };

export function resolveQuizSlopContentConfig(
  input: Extract<QuizSlopContentConfigInput, { mode: "CATALOG" }>,
): Extract<QuizSlopContentConfig, { mode: "CATALOG" }>;
export function resolveQuizSlopContentConfig(
  input: Extract<QuizSlopContentConfigInput, { mode: "AI" }>,
): Extract<QuizSlopContentConfig, { mode: "AI" }>;

/**
 * Resolves an untrusted host selection into the server-owned content contract.
 * A caller cannot select the verifier or silently introduce an unpriced model.
 */
export function resolveQuizSlopContentConfig(
  input: QuizSlopContentConfigInput,
): QuizSlopContentConfig {
  if (input.mode === "CATALOG") return { mode: "CATALOG" };

  const generatorModelId = input.generatorModelId.trim();
  if (!getModelByModelId(generatorModelId)) {
    throw new Error(`Unsupported QuizSlop generator model: ${generatorModelId || "(empty)"}`);
  }
  const verifierModelId = input.verifierModelId ?? QUIZSLOP_FIXED_VERIFIER_MODEL_ID;
  if (!isQuizSlopVerifierModelId(verifierModelId)) {
    throw new Error(`Unsupported QuizSlop verifier model: ${verifierModelId}`);
  }
  if (!getModelInfo(verifierModelId)) {
    throw new Error("QuizSlop's verifier is missing from the server model catalog");
  }

  return {
    mode: "AI",
    generatorModelId,
    verifierModelId,
    promptVersion: QUIZSLOP_AI_PROMPT_VERSION,
    schemaVersion: QUIZSLOP_AI_SCHEMA_VERSION,
  };
}
