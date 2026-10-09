/** Display and pricing metadata shared by player models and judge-only models. */
export interface ModelInfo {
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
  /** Decision models answer fixed-choice questions instead of writing text. */
  decision?: true;
}

export interface AIModel extends ModelInfo {
  /** Gameplay reasoning policy. Enforced when the provider exposes a control. */
  reasoningLevel: ReasoningLevel;
  /** Set when the model is served by the Anthropic API instead of the AI Gateway. */
  anthropicModelId?: string;
}

export type ReasoningLevel = "minimal" | "low" | "medium" | "high" | "max";

export const AI_MODELS: AIModel[] = [
  {
    id: "google/gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    shortName: "Gemini",
    provider: "Google",
    icon: "/icons/gemini-color.svg",
    inputPer1M: 0.3,
    outputPer1M: 2.5,
    reasoningLevel: "high",
  },
  {
    id: "zai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    shortName: "GLM",
    provider: "Zhipu AI",
    icon: "/icons/zai-light.svg",
    iconDark: "/icons/zai-dark.svg",
    inputPer1M: 0.15,
    outputPer1M: 0.5,
    reasoningLevel: "low",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    shortName: "DeepSeek",
    provider: "DeepSeek",
    icon: "/icons/deepseek-color.svg",
    inputPer1M: 0.3,
    outputPer1M: 1.2,
    reasoningLevel: "max",
  },
  {
    id: "openai/gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    shortName: "GPT",
    provider: "OpenAI",
    icon: "/icons/openai-light.svg",
    iconDark: "/icons/openai-dark.svg",
    inputPer1M: 2.0,
    outputPer1M: 10.0,
    reasoningLevel: "low",
  },
  {
    id: "xiaomi/mimo-v2.6-flash",
    name: "MiMo V2.6 Flash",
    shortName: "MiMo",
    provider: "Xiaomi",
    icon: "/icons/xiaomimimo-light.svg",
    iconDark: "/icons/xiaomimimo-dark.svg",
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    reasoningLevel: "high",
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Claude Haiku 5.5",
    shortName: "Claude",
    provider: "Anthropic",
    icon: "/icons/claude-color.svg",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    reasoningLevel: "low",
    anthropicModelId: "claude-haiku-5-5",
  },
];

/**
 * TypeSafe AI's decision model. It answers typed questions instead of writing
 * text, so it judges but never plays. Output tokens are free.
 */
export const JEV_MODEL = {
  id: "typesafe-ai/jev",
  name: "Jev",
  shortName: "Jev",
  provider: "TypeSafe AI",
  icon: "/icons/jev-color.svg",
  inputPer1M: 0.042,
  outputPer1M: 0,
  decision: true,
} as const satisfies ModelInfo;

const AI_MODELS_BY_ID = new Map(AI_MODELS.map((m) => [m.id, m]));
const MODEL_INFO_BY_ID = new Map<string, ModelInfo>([
  ...AI_MODELS_BY_ID,
  [JEV_MODEL.id, JEV_MODEL],
]);

export function getModelByModelId(modelId: string): AIModel | undefined {
  return AI_MODELS_BY_ID.get(modelId);
}

/** Looks up any priced model, including judge-only models that cannot play. */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_INFO_BY_ID.get(modelId);
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

/** Calculate USD cost from token counts for a given model. */
export function calculateCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = getModelInfo(modelId);
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

export function getModelIconForTheme(model: ModelInfo, theme: "light" | "dark"): string {
  return theme === "light" && model.iconDark ? model.iconDark : model.icon;
}
