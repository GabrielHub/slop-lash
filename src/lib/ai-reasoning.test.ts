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
    expect(getGameplayReasoningSettings("deepseek/deepseek-v4.1-flash")).toEqual({
      reasoning: "xhigh",
    });
    expect(getGameplayReasoningSettings("openai/gpt-6.1-sol")).toEqual({
      reasoning: "low",
    });
    expect(getGameplayReasoningSettings("anthropic/claude-haiku-5.5")).toEqual({
      reasoning: "low",
    });
  });

  test("uses effort controls for the new GLM and MiMo models", () => {
    expect(getGameplayReasoningSettings("zai/glm-5.3-flash")).toEqual({
      reasoning: "low",
    });
    expect(getGameplayReasoningSettings("xiaomi/mimo-v2.6-flash")).toEqual({
      reasoning: "high",
    });
  });

  test("does not invent settings for an unknown model", () => {
    expect(getGameplayReasoningSettings("unknown/model")).toEqual({});
  });
});
