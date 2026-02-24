export interface AIModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  icon: string;
  iconDark?: string;
}

export const AI_MODELS: AIModel[] = [
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash", shortName: "Gemini", provider: "Google", icon: "/icons/gemini-color.svg" },
  { id: "zai/glm-5", name: "GLM-5", shortName: "GLM", provider: "Zhipu AI", icon: "/icons/zai-light.svg", iconDark: "/icons/zai-dark.svg" },
  { id: "minimax/minimax-m2.5", name: "MiniMax M2.5", shortName: "MiniMax", provider: "MiniMax", icon: "/icons/minimax-color.svg" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", shortName: "DeepSeek", provider: "DeepSeek", icon: "/icons/deepseek-color.svg" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", shortName: "GPT", provider: "OpenAI", icon: "/icons/openai-light.svg", iconDark: "/icons/openai-dark.svg" },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", shortName: "Kimi", provider: "Moonshot AI", icon: "/icons/moonshot-light.svg", iconDark: "/icons/moonshot-dark.svg" },
  { id: "xiaomi/mimo-v2-flash", name: "MiMo V2 Flash", shortName: "MiMo", provider: "Xiaomi", icon: "/icons/xiaomimimo-light.svg", iconDark: "/icons/xiaomimimo-dark.svg" },
  { id: "xai/grok-4.1-fast-reasoning", name: "Grok 4.1 Fast", shortName: "Grok", provider: "xAI", icon: "/icons/grok-light.svg", iconDark: "/icons/grok-dark.svg" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", shortName: "Claude", provider: "Anthropic", icon: "/icons/claude-color.svg" },
];

export function getModelByModelId(modelId: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

export function getModelIconForTheme(
  model: AIModel,
  theme: "light" | "dark"
): string {
  // In light mode, use dark icon variant (dark-colored, visible on light bg)
  // In dark mode, use default icon (light-colored, visible on dark bg)
  if (theme === "light" && model.iconDark) {
    return model.iconDark;
  }
  return model.icon;
}
