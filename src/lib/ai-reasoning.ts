import type { LanguageModelCallOptions } from "ai";
import { getModelByModelId, type AIModel, type ReasoningLevel } from "./models";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ReasoningProviderOptions = Record<string, Record<string, JsonValue>>;
type PortableReasoning = NonNullable<LanguageModelCallOptions["reasoning"]>;

export interface GameplayReasoningSettings {
  reasoning?: PortableReasoning;
  providerOptions?: ReasoningProviderOptions;
}

function toPortableReasoning(level: ReasoningLevel): PortableReasoning {
  return level === "max" ? "xhigh" : level;
}

function requireNativeReasoningBudget(model: AIModel): number {
  if (model.nativeReasoningBudgetTokens === undefined) {
    throw new Error(`${model.id} must define nativeReasoningBudgetTokens`);
  }
  return model.nativeReasoningBudgetTokens;
}

/**
 * Converts an explicit reasoning level into AI SDK call settings.
 * Providers without portable reasoning support keep their small native adapter here.
 */
export function getReasoningSettings(
  modelId: string,
  level: ReasoningLevel,
): GameplayReasoningSettings {
  const model = getModelByModelId(modelId);
  if (!model) return {};

  const providerId = model.id.split("/", 1)[0];

  switch (providerId) {
    case "zai":
      return {
        providerOptions: {
          zai: { thinking: { type: level === "minimal" ? "disabled" : "enabled" } },
        },
      };
    case "moonshotai":
      return {
        providerOptions: {
          moonshotai: {
            thinking: {
              type: "enabled",
              budgetTokens: requireNativeReasoningBudget(model),
            },
          },
        },
      };
    case "xiaomi":
      return {
        providerOptions: {
          xiaomi: { thinking: { type: level === "minimal" ? "disabled" : "enabled" } },
        },
      };
    case "alibaba":
      return {
        providerOptions: {
          alibaba: {
            enableThinking: level !== "minimal",
            thinkingBudget: requireNativeReasoningBudget(model),
          },
        },
      };
    default:
      return { reasoning: toPortableReasoning(level) };
  }
}

/** Applies the catalog's per-model gameplay reasoning policy. */
export function getGameplayReasoningSettings(modelId: string): GameplayReasoningSettings {
  const model = getModelByModelId(modelId);
  if (!model) return {};
  return getReasoningSettings(modelId, model.reasoningLevel);
}
