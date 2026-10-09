/// <reference types="vite/client" />
// @vitest-environment node

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { internal } from "./_generated/api";
import schema from "./schema";

const { generateTextMock, falRunMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  falRunMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: generateTextMock };
});
vi.mock("@fal-ai/client", () => ({ fal: { config: vi.fn(), run: falRunMock } }));

const modules = import.meta.glob("./**/*.ts");
const context = {
  kind: "ready" as const,
  modelId: "openai/gpt-6.1-sol",
  personaIdentity: "WOMAN" as const,
  profile: {
    displayName: "Sam",
    backstory: null,
    appearance: "Short brown hair",
    age: 25,
    location: "Seattle",
    bio: "Weekend hiker",
    tagline: null,
    prompts: [1, 2, 3].map((id) => ({ id: String(id), prompt: "My hobby", answer: "Hiking" })),
    details: null,
  },
  personaExamples: [],
};

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-api-key");
  vi.stubEnv("FAL_KEY", "test-fal-key");
  generateTextMock.mockResolvedValue({
    output: { prompt: "A candid portrait of an adult hiker." },
    usage: { inputTokens: 10, outputTokens: 10 },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("MatchSlop Recraft image generation", () => {
  test("uses Recraft's request contract and accepts its image response", async () => {
    falRunMock.mockResolvedValue({ data: { images: [{ url: "https://example.com/portrait.webp" }] } });
    const backend = convexTest(schema, modules);
    const result = await backend.action(internal.matchslopAi.generateImage, { context });
    expect(result.imageUrl).toBe("https://example.com/portrait.webp");
    expect(falRunMock).toHaveBeenCalledWith("recraft/v4.1/flash/text-to-image", {
      input: {
        prompt: "A candid portrait of an adult hiker.",
        image_size: "landscape_4_3",
        enable_safety_checker: true,
      },
    });
  });

  test("rejects a provider response without an image", async () => {
    falRunMock.mockResolvedValue({ data: { images: [] } });
    const backend = convexTest(schema, modules);
    await expect(backend.action(internal.matchslopAi.generateImage, { context })).rejects.toThrow();
  });
});
