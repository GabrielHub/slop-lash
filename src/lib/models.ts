/** Display and pricing metadata shared by player models and judge-only models. */
export interface ModelInfo {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  /** Provider icon under `public/icons`, the same one OpenRouter shows. */
  icon: string;
  /** Set for black monochrome icons, which are inverted on the dark theme. */
  invertOnDark?: true;
  /** Cost per 1M input tokens in USD */
  inputPer1M: number;
  /** Cost per 1M output tokens in USD */
  outputPer1M: number;
  /**
   * Cost per 1M input tokens read from the prompt cache, in USD. Set only
   * when the provider publishes it; without it cached reads are priced as
   * plain input and the estimate is flagged (`cachePriceKnown: false`).
   */
  cacheReadPer1M?: number;
  /** Cost per 1M input tokens written to a 5-minute prompt cache, in USD, when published. */
  cacheWritePer1M?: number;
  /** Decision models answer fixed-choice questions instead of writing text. */
  decision?: true;
}

export interface AIModel extends ModelInfo {
  /** Set when the model is served by the Anthropic API instead of the AI Gateway. */
  anthropicModelId?: string;
}

export const AI_MODELS: AIModel[] = [
  {
    id: "google/gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    shortName: "Gemini",
    provider: "Google",
    icon: "/icons/gemini.svg",
    inputPer1M: 0.3,
    outputPer1M: 2.5,
  },
  {
    id: "zai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    shortName: "GLM",
    provider: "Zhipu AI",
    icon: "/icons/zai.png",
    inputPer1M: 0.15,
    outputPer1M: 0.5,
  },
  {
    id: "deepseek/deepseek-v4.1-flash-1017",
    name: "DeepSeek V4.1 Flash",
    shortName: "DeepSeek",
    provider: "DeepSeek",
    icon: "/icons/deepseek.png",
    inputPer1M: 0.041,
    outputPer1M: 0.1,
  },
  {
    id: "openai/gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    shortName: "GPT",
    provider: "OpenAI",
    icon: "/icons/openai.svg",
    invertOnDark: true,
    inputPer1M: 2.0,
    outputPer1M: 10.0,
  },
  {
    id: "xiaomi/mimo-v2.6-flash",
    name: "MiMo V2.6 Flash",
    shortName: "MiMo",
    provider: "Xiaomi",
    icon: "/icons/xiaomi.png",
    inputPer1M: 0.14,
    outputPer1M: 0.28,
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Claude Haiku 5.5",
    shortName: "Claude",
    provider: "Anthropic",
    icon: "/icons/anthropic.svg",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    // Anthropic bills cache reads at 0.1x input and 5-minute writes at 1.25x,
    // and caches prefixes of 512+ tokens on Haiku 5.5 (docs/ai-calls.md).
    cacheReadPer1M: 0.01,
    cacheWritePer1M: 0.125,
    anthropicModelId: "claude-haiku-5-5",
  },
  {
    id: "meta/muse-spark-1.3-contributor",
    name: "Muse Spark 1.3 Contributor",
    shortName: "Muse",
    provider: "Meta",
    icon: "/icons/meta.png",
    inputPer1M: 0.1,
    outputPer1M: 0.2,
    // AI Gateway lists cache reads at $0.002/M and no cache-write price.
    cacheReadPer1M: 0.002,
  },
  {
    id: "minimax/minimax-m3.1-flash",
    name: "MiniMax M3.1 Flash",
    shortName: "MiniMax",
    provider: "MiniMax",
    icon: "/icons/minimax.png",
    // AI Gateway lists it as free at launch (2026-10-19).
    inputPer1M: 0,
    outputPer1M: 0,
  },
];

/**
 * Models the server calls for game work (SlopFight's fallback forge) but that
 * never play: not in any player or persona picker, the landing page, the
 * leaderboard, `getModelByModelId` or `selectUniqueModelsByProvider`. Model
 * routing (`getRoutableModel`) and pricing (`getModelInfo`) read them.
 */
export const INTERNAL_MODELS: AIModel[] = [
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    shortName: "Sonnet",
    provider: "Anthropic",
    icon: "/icons/anthropic.svg",
    // Claude API rates (claude-api skill, cached 2026-10-06): $2 / $10 per
    // MTok, cache reads 0.1x input, 5-minute cache writes 1.25x input.
    inputPer1M: 2,
    outputPer1M: 10,
    cacheReadPer1M: 0.2,
    cacheWritePer1M: 2.5,
    anthropicModelId: "claude-sonnet-5-5",
  },
];

/**
 * TypeSafe AI's decision model. It answers typed questions instead of writing
 * text, so it judges but never plays. Output tokens are free.
 */
export const JEV_MODEL = {
  id: "typesafe-ai/jev-1.14.0",
  name: "Jev",
  shortName: "Jev",
  provider: "TypeSafe AI",
  icon: "/icons/jev-color.svg",
  inputPer1M: 0.042,
  outputPer1M: 0,
  decision: true,
} as const satisfies ModelInfo;

const AI_MODELS_BY_ID = new Map(AI_MODELS.map((m) => [m.id, m]));
const ROUTABLE_MODELS_BY_ID = new Map([
  ...AI_MODELS_BY_ID,
  ...INTERNAL_MODELS.map((m) => [m.id, m] as const),
]);
const MODEL_INFO_BY_ID = new Map<string, ModelInfo>([
  ...ROUTABLE_MODELS_BY_ID,
  [JEV_MODEL.id, JEV_MODEL],
]);

/** A model that can play (a player or persona seat). Internal models are not players. */
export function getModelByModelId(modelId: string): AIModel | undefined {
  return AI_MODELS_BY_ID.get(modelId);
}

/** Any model the server may call for text: players plus internal models. Routing reads this. */
export function getRoutableModel(modelId: string): AIModel | undefined {
  return ROUTABLE_MODELS_BY_ID.get(modelId);
}

/** Looks up any priced model, including judge-only and internal models that cannot play. */
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

/** Rough per-game cost bucket ("$"/"$$"/"$$$") for a model, based on a typical
 * 3-round / 8-player game at ~100 input + ~50 output tokens per call. */
export function getCostTier(model: AIModel): string {
  const perGame =
    ((3 * 8 * 100) / 1_000_000) * model.inputPer1M + ((3 * 8 * 50) / 1_000_000) * model.outputPer1M;
  if (perGame < 0.001) return "$";
  if (perGame < 0.005) return "$$";
  return "$$$";
}
