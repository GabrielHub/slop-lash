import { describe, expect, test } from "vite-plus/test";
import { AI_MODELS } from "./models";
import { getGameplayReasoningSettings } from "./ai-reasoning";

describe("gameplay reasoning policy", () => {
  test("uses the catalog as the policy source for every selectable model", () => {
    expect(
      AI_MODELS.every((model) => Object.keys(getGameplayReasoningSettings(model.id)).length > 0),
    ).toBe(true);
  });

  test("uses portable AI SDK reasoning for supported providers", () => {
    expect(getGameplayReasoningSettings("google/gemini-3.5-flash-lite")).toEqual({
      reasoning: "high",
    });
    expect(getGameplayReasoningSettings("deepseek/deepseek-v4-flash")).toEqual({
      reasoning: "xhigh",
    });
    expect(getGameplayReasoningSettings("openai/gpt-5.6-luna")).toEqual({
      reasoning: "minimal",
    });
    expect(getGameplayReasoningSettings("xai/grok-4.5")).toEqual({
      reasoning: "low",
    });
    expect(getGameplayReasoningSettings("anthropic/claude-haiku-4.5")).toEqual({
      reasoning: "low",
    });
  });

  test("adapts providers that do not expose portable reasoning", () => {
    expect(getGameplayReasoningSettings("zai/glm-5.2")).toEqual({
      providerOptions: { zai: { thinking: { type: "disabled" } } },
    });
    expect(getGameplayReasoningSettings("moonshotai/kimi-k2.5")).toEqual({
      providerOptions: {
        moonshotai: { thinking: { type: "enabled", budgetTokens: 2_048 } },
      },
    });
    expect(getGameplayReasoningSettings("xiaomi/mimo-v2.5-pro")).toEqual({
      providerOptions: { xiaomi: { thinking: { type: "enabled" } } },
    });
    expect(getGameplayReasoningSettings("alibaba/qwen3.5-flash")).toEqual({
      providerOptions: {
        alibaba: { enableThinking: true, thinkingBudget: 4_096 },
      },
    });
  });

  test("does not invent settings for an unknown model", () => {
    expect(getGameplayReasoningSettings("unknown/model")).toEqual({});
  });
});
