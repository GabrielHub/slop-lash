import type { LanguageModelCallOptions } from "ai";
import { getModelByModelId, type ReasoningLevel } from "./models";

type PortableReasoning = NonNullable<LanguageModelCallOptions["reasoning"]>;

export interface GameplayReasoningSettings {
  reasoning?: PortableReasoning;
}

/** All current catalog models support Gateway's portable reasoning setting. */
export function getReasoningSettings(
  modelId: string,
  level: ReasoningLevel,
): GameplayReasoningSettings {
  const model = getModelByModelId(modelId);
  if (!model) return {};

  // Gateway's wire schema currently stops at xhigh; DeepSeek maps it to native max.
  return { reasoning: level === "max" ? "xhigh" : level };
}

/** Applies the catalog's per-model gameplay reasoning policy. */
export function getGameplayReasoningSettings(modelId: string): GameplayReasoningSettings {
  const model = getModelByModelId(modelId);
  if (!model) return {};
  return getReasoningSettings(modelId, model.reasoningLevel);
}
