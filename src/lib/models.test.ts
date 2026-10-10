import { describe, expect, it } from "vite-plus/test";
import { getModelRoute, hasProviderKey } from "./ai-gateway";
import { estimateCostUsd } from "./ai/usage";
import {
  AI_MODELS,
  getModelByModelId,
  getModelInfo,
  getRoutableModel,
  INTERNAL_MODELS,
  selectUniqueModelsByProvider,
} from "./models";

const SONNET = "anthropic/claude-sonnet-5.5";

describe("internal models", () => {
  it("routes Claude Sonnet 5.5 to the Anthropic API and prices it", () => {
    expect(getRoutableModel(SONNET)?.anthropicModelId).toBe("claude-sonnet-5-5");
    expect(getModelRoute(SONNET)).toBe("anthropic");
    expect(hasProviderKey(SONNET, { anthropic: "k" })).toBe(true);
    expect(hasProviderKey(SONNET, { gateway: "k" })).toBe(false);
    expect(getModelInfo(SONNET)).toMatchObject({
      inputPer1M: 2,
      outputPer1M: 10,
      cacheReadPer1M: 0.2,
      cacheWritePer1M: 2.5,
    });
  });

  it("never offers Sonnet as a player, persona or leaderboard model", () => {
    expect(AI_MODELS.some((model) => model.id === SONNET)).toBe(false);
    expect(getModelByModelId(SONNET)).toBeUndefined();
    expect(selectUniqueModelsByProvider([SONNET]).map((model) => model.id)).toEqual([]);
    // Haiku still claims the Anthropic slot.
    expect(
      selectUniqueModelsByProvider([SONNET, "anthropic/claude-haiku-5.5"]).map((model) => model.id),
    ).toEqual(["anthropic/claude-haiku-5.5"]);
  });

  it("keeps internal ids distinct from player ids", () => {
    for (const internal of INTERNAL_MODELS) {
      expect(getModelByModelId(internal.id)).toBeUndefined();
      expect(getRoutableModel(internal.id)).toBe(internal);
    }
    for (const player of AI_MODELS) expect(getRoutableModel(player.id)).toBe(player);
  });

  it("prices Sonnet usage from the catalog", () => {
    const { costUsd, cachePriceKnown } = estimateCostUsd(SONNET, {
      noCacheInputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
      outputTokens: 100_000,
    });
    expect(costUsd).toBeCloseTo(2 + 0.2 + 1, 6);
    expect(cachePriceKnown).toBe(true);
  });
});
