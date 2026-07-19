export interface AIModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  icon: string;
  iconDark?: string;
  /** Cost per 1M input tokens in USD */
  inputPer1M: number;
  /** Cost per 1M output tokens in USD */
  outputPer1M: number;
  /** Gameplay reasoning policy. Enforced when the provider exposes a control. */
  reasoningLevel: ReasoningLevel;
  /** Exact native budget when this gateway provider lacks portable AI SDK reasoning. */
  nativeReasoningBudgetTokens?: number;
}

export type ReasoningLevel = "minimal" | "low" | "medium" | "high" | "max";

export const LEGACY_MODEL_NAME = "Legacy Model";
export const LEGACY_MODEL_SHORT_NAME = "Legacy";

export const AI_MODELS: AIModel[] = [
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    shortName: "Gemini",
    provider: "Google",
    icon: "/icons/gemini-color.svg",
    inputPer1M: 0.25,
    outputPer1M: 1.5,
    reasoningLevel: "high",
  },
  {
    id: "zai/glm-5.2",
    name: "GLM-5.2",
    shortName: "GLM",
    provider: "Zhipu AI",
    icon: "/icons/zai-light.svg",
    iconDark: "/icons/zai-dark.svg",
    inputPer1M: 1.4,
    outputPer1M: 4.4,
    reasoningLevel: "minimal",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    shortName: "DeepSeek",
    provider: "DeepSeek",
    icon: "/icons/deepseek-color.svg",
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    reasoningLevel: "max",
  },
  {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    shortName: "GPT",
    provider: "OpenAI",
    icon: "/icons/openai-light.svg",
    iconDark: "/icons/openai-dark.svg",
    inputPer1M: 1.0,
    outputPer1M: 6.0,
    reasoningLevel: "minimal",
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    shortName: "Kimi",
    provider: "Moonshot AI",
    icon: "/icons/moonshot-light.svg",
    iconDark: "/icons/moonshot-dark.svg",
    inputPer1M: 0.6,
    outputPer1M: 3.0,
    reasoningLevel: "medium",
    nativeReasoningBudgetTokens: 2_048,
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    name: "MiMo V2.5 Pro",
    shortName: "MiMo",
    provider: "Xiaomi",
    icon: "/icons/xiaomimimo-light.svg",
    iconDark: "/icons/xiaomimimo-dark.svg",
    inputPer1M: 0.435,
    outputPer1M: 0.87,
    reasoningLevel: "high",
  },
  {
    id: "xai/grok-4.5",
    name: "Grok 4.5",
    shortName: "Grok",
    provider: "xAI",
    icon: "/icons/grok-light.svg",
    iconDark: "/icons/grok-dark.svg",
    inputPer1M: 2.0,
    outputPer1M: 6.0,
    reasoningLevel: "low",
  },
  {
    id: "alibaba/qwen3.5-flash",
    name: "Qwen 3.5 Flash",
    shortName: "Qwen",
    provider: "Alibaba",
    icon: "/icons/qwen-color.svg",
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    reasoningLevel: "high",
    nativeReasoningBudgetTokens: 4_096,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    shortName: "Claude",
    provider: "Anthropic",
    icon: "/icons/claude-color.svg",
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    reasoningLevel: "low",
  },
];

const AI_MODELS_BY_ID = new Map(AI_MODELS.map((m) => [m.id, m]));

export function getModelByModelId(modelId: string): AIModel | undefined {
  return AI_MODELS_BY_ID.get(modelId);
}

export function selectUniqueModelsByProvider(modelIds: readonly string[]): AIModel[] {
  const seenIds = new Set<string>();
  const seenProviders = new Set<string>();
  const selected: AIModel[] = [];

  for (const modelId of modelIds) {
    if (seenIds.has(modelId)) continue;
    seenIds.add(modelId);

    const model = getModelByModelId(modelId);
    if (!model) continue;
    if (seenProviders.has(model.provider)) continue;

    seenProviders.add(model.provider);
    selected.push(model);
  }

  return selected;
}

export function getLeaderboardModelNames(modelId: string): {
  name: string;
  shortName: string;
  isLegacy: boolean;
} {
  const model = getModelByModelId(modelId);
  if (model) {
    return { name: model.name, shortName: model.shortName, isLegacy: false };
  }
  return {
    name: LEGACY_MODEL_NAME,
    shortName: LEGACY_MODEL_SHORT_NAME,
    isLegacy: true,
  };
}

/** Calculate USD cost from token counts for a given model. */
export function calculateCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = getModelByModelId(modelId);
  if (!model) return 0;
  return (
    (inputTokens / 1_000_000) * model.inputPer1M + (outputTokens / 1_000_000) * model.outputPer1M
  );
}

/** Rough per-game cost bucket ("$"/"$$"/"$$$") for a model, based on a typical
 * 3-round / 8-player game at ~100 input + ~50 output tokens per call. */
export function getCostTier(model: AIModel): string {
  const perGame =
    ((3 * 8 * 100) / 1_000_000) * model.inputPer1M + ((3 * 8 * 50) / 1_000_000) * model.outputPer1M;
  if (perGame < 0.001) return "$";
  if (perGame < 0.005) return "$$";
  return "$$$";
}

export function getModelIconForTheme(model: AIModel, theme: "light" | "dark"): string {
  return theme === "light" && model.iconDark ? model.iconDark : model.icon;
}
