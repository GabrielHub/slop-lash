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

export const AI_MODELS: AIModel[] = [
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash", shortName: "Gemini", provider: "Google", icon: "/icons/gemini-color.svg", inputPer1M: 0.50, outputPer1M: 3.00 },
  { id: "zai/glm-5", name: "GLM-5", shortName: "GLM", provider: "Zhipu AI", icon: "/icons/zai-light.svg", iconDark: "/icons/zai-dark.svg", inputPer1M: 3.00, outputPer1M: 15.00 },
  { id: "minimax/minimax-m2.5", name: "MiniMax M2.5", shortName: "MiniMax", provider: "MiniMax", icon: "/icons/minimax-color.svg", inputPer1M: 2.00, outputPer1M: 12.00 },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", shortName: "DeepSeek", provider: "DeepSeek", icon: "/icons/deepseek-color.svg", inputPer1M: 0.20, outputPer1M: 1.50 },
  { id: "openai/gpt-5.2-chat", name: "GPT-5.2 Chat", shortName: "GPT", provider: "OpenAI", icon: "/icons/openai-light.svg", iconDark: "/icons/openai-dark.svg", inputPer1M: 1.75, outputPer1M: 14.00 },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", shortName: "Kimi", provider: "Moonshot AI", icon: "/icons/moonshot-light.svg", iconDark: "/icons/moonshot-dark.svg", inputPer1M: 1.00, outputPer1M: 3.20 },
  { id: "xiaomi/mimo-v2-flash", name: "MiMo V2 Flash", shortName: "MiMo", provider: "Xiaomi", icon: "/icons/xiaomimimo-light.svg", iconDark: "/icons/xiaomimimo-dark.svg", inputPer1M: 0.10, outputPer1M: 0.30 },
  { id: "xai/grok-4.1-fast-reasoning", name: "Grok 4.1 Fast", shortName: "Grok", provider: "xAI", icon: "/icons/grok-light.svg", iconDark: "/icons/grok-dark.svg", inputPer1M: 1.25, outputPer1M: 10.00 },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", shortName: "Claude", provider: "Anthropic", icon: "/icons/claude-color.svg", inputPer1M: 3.00, outputPer1M: 15.00 },
];

export function getModelByModelId(modelId: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
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
    (inputTokens / 1_000_000) * model.inputPer1M +
    (outputTokens / 1_000_000) * model.outputPer1M
  );
}

export function getModelIconForTheme(
  model: AIModel,
  theme: "light" | "dark"
): string {
  return theme === "light" && model.iconDark ? model.iconDark : model.icon;
}
