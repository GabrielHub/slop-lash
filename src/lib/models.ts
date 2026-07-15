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
}

export const LEGACY_MODEL_NAME = "Legacy Model";
export const LEGACY_MODEL_SHORT_NAME = "Legacy";

export const AI_MODELS: AIModel[] = [
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    shortName: "Gemini",
    provider: "Google",
    icon: "/icons/gemini-color.svg",
    inputPer1M: 0.5,
    outputPer1M: 3.0,
  },
  {
    id: "zai/glm-5.1",
    name: "GLM-5.1",
    shortName: "GLM",
    provider: "Zhipu AI",
    icon: "/icons/zai-light.svg",
    iconDark: "/icons/zai-dark.svg",
    inputPer1M: 1.3,
    outputPer1M: 4.3,
  },
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax M2.7",
    shortName: "MiniMax",
    provider: "MiniMax",
    icon: "/icons/minimax-color.svg",
    inputPer1M: 0.3,
    outputPer1M: 1.2,
  },
  {
    id: "deepseek/deepseek-v3.2-thinking",
    name: "DeepSeek V3.2",
    shortName: "DeepSeek",
    provider: "DeepSeek",
    icon: "/icons/deepseek-color.svg",
    inputPer1M: 0.62,
    outputPer1M: 1.85,
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    shortName: "GPT",
    provider: "OpenAI",
    icon: "/icons/openai-light.svg",
    iconDark: "/icons/openai-dark.svg",
    inputPer1M: 0.75,
    outputPer1M: 4.5,
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
  },
  {
    id: "xiaomi/mimo-v2.5",
    name: "MiMo M2.5",
    shortName: "MiMo",
    provider: "Xiaomi",
    icon: "/icons/xiaomimimo-light.svg",
    iconDark: "/icons/xiaomimimo-dark.svg",
    inputPer1M: 0.14,
    outputPer1M: 0.28,
  },
  {
    id: "xai/grok-4.20-non-reasoning",
    name: "Grok 4.20",
    shortName: "Grok",
    provider: "xAI",
    icon: "/icons/grok-light.svg",
    iconDark: "/icons/grok-dark.svg",
    inputPer1M: 1.25,
    outputPer1M: 2.5,
  },
  {
    id: "perplexity/sonar",
    name: "Perplexity Sonar",
    shortName: "Sonar",
    provider: "Perplexity",
    icon: "/icons/perplexity-color.svg",
    inputPer1M: 1.0,
    outputPer1M: 1.0,
  },
  {
    id: "alibaba/qwen3.5-flash",
    name: "Qwen 3.5 Flash",
    shortName: "Qwen",
    provider: "Alibaba",
    icon: "/icons/qwen-color.svg",
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    shortName: "Claude",
    provider: "Anthropic",
    icon: "/icons/claude-color.svg",
    inputPer1M: 1.0,
    outputPer1M: 5.0,
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

export function getModelIconForTheme(model: AIModel, theme: "light" | "dark"): string {
  return theme === "light" && model.iconDark ? model.iconDark : model.icon;
}
