import { getModelByModelId } from "../../../lib/models";

export const QUIZSLOP_AI_PROMPT_VERSION = "quizslop-fresh-pack-v1";
export const QUIZSLOP_AI_SCHEMA_VERSION = "quizslop-frozen-pack-v1";

/** Server-owned. Hosts choose only the generator. */
export const QUIZSLOP_FIXED_VERIFIER_MODEL_ID = "openai/gpt-5.6-luna";

export type QuizSlopContentConfig =
  | { mode: "CATALOG" }
  | {
      mode: "AI";
      generatorModelId: string;
      verifierModelId: typeof QUIZSLOP_FIXED_VERIFIER_MODEL_ID;
      promptVersion: typeof QUIZSLOP_AI_PROMPT_VERSION;
      schemaVersion: typeof QUIZSLOP_AI_SCHEMA_VERSION;
    };

type QuizSlopContentConfigInput = { mode: "CATALOG" } | { mode: "AI"; generatorModelId: string };

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
  if (!getModelByModelId(QUIZSLOP_FIXED_VERIFIER_MODEL_ID)) {
    throw new Error("QuizSlop's fixed verifier is missing from the server model catalog");
  }

  return {
    mode: "AI",
    generatorModelId,
    verifierModelId: QUIZSLOP_FIXED_VERIFIER_MODEL_ID,
    promptVersion: QUIZSLOP_AI_PROMPT_VERSION,
    schemaVersion: QUIZSLOP_AI_SCHEMA_VERSION,
  };
}
