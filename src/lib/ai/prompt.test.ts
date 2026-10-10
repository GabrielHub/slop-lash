import type { ModelMessage } from "ai";
import { describe, expect, it } from "vite-plus/test";
import {
  assertPromptLayout,
  buildInstructions,
  cachingProviderOptions,
  countCacheBreakpoints,
  limitMessageBreakpoints,
  markCacheBreakpoint,
  type InstructionBlock,
} from "./prompt";

describe("prompt layout", () => {
  it("accepts static -> game -> call and any tier left out", () => {
    expect(() =>
      assertPromptLayout([
        { text: "a", cache: "static" },
        { text: "b", cache: "game" },
        { text: "c", cache: false },
      ]),
    ).not.toThrow();
    expect(() =>
      assertPromptLayout([
        { text: "a", cache: "static" },
        { text: "c", cache: false },
      ]),
    ).not.toThrow();
  });

  it("rejects a more stable block after a less stable one", () => {
    expect(() =>
      assertPromptLayout([
        { text: "b", cache: "game" },
        { text: "a", cache: "static" },
      ]),
    ).toThrow(/order blocks static -> game -> call/u);
    expect(() =>
      assertPromptLayout([
        { text: "c", cache: false },
        { text: "b", cache: "game" },
      ]),
    ).toThrow();
  });
});

describe("buildInstructions", () => {
  const blocks: InstructionBlock[] = [
    { text: "rules", cache: "static" },
    { text: "room", cache: "game" },
    { text: "round", cache: false },
  ];

  it("turns a plain string into one uncached system message", () => {
    expect(buildInstructions("Be brief.", "anthropic")).toEqual([
      { role: "system", content: "Be brief." },
    ]);
  });

  it("marks each cached tier once on the Anthropic route", () => {
    const messages = buildInstructions(blocks, "anthropic");
    expect(countCacheBreakpoints(messages)).toBe(2);
    expect(messages[2]!.providerOptions).toBeUndefined();
  });

  it("adds no markers on the Gateway route", () => {
    expect(countCacheBreakpoints(buildInstructions(blocks, "gateway"))).toBe(0);
  });
});

describe("message breakpoints", () => {
  it("adds a cache marker without dropping other provider options", () => {
    const message: ModelMessage = {
      role: "user",
      content: "hi",
      providerOptions: { anthropic: { other: true }, gateway: { order: ["x"] } },
    };
    expect(markCacheBreakpoint(message).providerOptions).toEqual({
      anthropic: { other: true, cacheControl: { type: "ephemeral" } },
      gateway: { order: ["x"] },
    });
    expect(message.providerOptions?.anthropic).toEqual({ other: true });
  });

  it("keeps only the newest markers within the budget", () => {
    const messages: ModelMessage[] = [
      markCacheBreakpoint({ role: "user", content: "1" }),
      markCacheBreakpoint({ role: "assistant", content: "2" }),
      markCacheBreakpoint({ role: "user", content: "3" }),
    ];
    const limited = limitMessageBreakpoints(messages, 1);
    expect(limited.map((message) => countCacheBreakpoints([message]))).toEqual([0, 0, 1]);
    expect(
      limitMessageBreakpoints(messages, -2).every((m) => countCacheBreakpoints([m]) === 0),
    ).toBe(true);
  });
});

describe("caching options", () => {
  it("asks only the Gateway for automatic caching", () => {
    expect(cachingProviderOptions("gateway")).toEqual({ gateway: { caching: "auto" } });
    expect(cachingProviderOptions("anthropic")).toBeUndefined();
  });
});
