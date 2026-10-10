import { APICallError, InvalidPromptError, Output, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { markCacheBreakpoint, type InstructionBlock } from "./prompt";
import { runStructured, runStructuredStream, runText, type AiRunOptions } from "./run";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type Finish = GenerateResult["finishReason"]["unified"];

const HAIKU = "anthropic/claude-haiku-5.5";
const GATEWAY_MODEL = "openai/gpt-6.1-sol";
const KEYS = { anthropic: "test-anthropic-key", gateway: "test-gateway-key" };

function reply(text: string, finish: Finish = "stop"): GenerateResult {
  return {
    content: text ? [{ type: "text", text }] : [],
    finishReason: { unified: finish, raw: finish },
    usage: {
      inputTokens: { total: 1_000, noCache: 200, cacheRead: 700, cacheWrite: 100 },
      outputTokens: { total: 60, text: 40, reasoning: 20 },
    },
    warnings: [],
  };
}

function mockModel(...results: GenerateResult[]) {
  return new MockLanguageModelV4({ doGenerate: results.length === 1 ? results[0] : results });
}

const jokeSchema = z.object({ joke: z.string() });

function options(model: MockLanguageModelV4, overrides: Partial<AiRunOptions> = {}): AiRunOptions {
  return {
    model: HAIKU,
    keys: KEYS,
    promptVersion: 3,
    instructions: "Write one joke.",
    prompt: "Prompt: the worst superpower",
    deadline: null,
    languageModel: model,
    ...overrides,
  } as AiRunOptions;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("runStructured", () => {
  it("returns the parsed output with usage, attempts and a call record", async () => {
    const model = mockModel(reply('{"joke":"Flying, but only downward"}'));
    const result = await runStructured("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: jokeSchema }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toEqual({ joke: "Flying, but only downward" });
    expect(result.finishReason).toBe("stop");
    expect(result.attempts).toBe(1);
    expect(result.usage).toMatchObject({
      inputTokens: 1_000,
      outputTokens: 60,
      cacheReadTokens: 700,
      cacheWriteTokens: 100,
      reasoningTokens: 20,
      cachePriceKnown: true,
    });
    expect(result.call).toMatchObject({
      task: "sloplash.jokes",
      promptVersion: 3,
      modelId: HAIKU,
      ok: true,
      failReason: null,
      finishReason: "stop",
      attempts: 1,
    });
    expect(result.call.error).toBeUndefined();
  });

  it("passes the task's reasoning, output cap and a timeout signal", async () => {
    const model = mockModel(reply('{"joke":"x"}'));
    await runStructured("sloplash.ballots", {
      ...options(model),
      output: Output.object({ schema: jokeSchema }),
    });
    const call = model.doGenerateCalls[0]!;
    expect(call.maxOutputTokens).toBe(4_000);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.reasoning).toBe("none");
  });

  it("salvages text and usage from a reply that fails the schema", async () => {
    const model = mockModel(reply('{"punchline":42}'));
    const result = await runStructured("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: jokeSchema }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failReason).toBe("invalid-output");
    expect(result.text).toBe('{"punchline":42}');
    expect(result.usage.inputTokens).toBe(1_000);
    expect(result.usage.costUsd).toBeGreaterThan(0);
    expect(result.call).toMatchObject({ ok: false, failReason: "invalid-output" });
    expect(result.call.error).toContain("NoObjectGeneratedError");
  });

  it("salvages a reply that is not JSON", async () => {
    const result = await runStructured("sloplash.jokes", {
      ...options(mockModel(reply("Sure! Here is a joke"))),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "invalid-output", text: "Sure! Here is a joke" });
  });

  it("reports a content-filter finish as refused", async () => {
    const result = await runStructured("matchslop.reply", {
      ...options(mockModel(reply("", "content-filter"))),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "refused", finishReason: "content-filter" });
    expect(result.usage.inputTokens).toBe(1_000);
  });

  it("reports a refusal with partial text as refused, not invalid", async () => {
    const result = await runStructured("matchslop.reply", {
      ...options(mockModel(reply('{"joke":"I can', "content-filter"))),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "refused" });
  });

  it("reports a truncated reply as length", async () => {
    const result = await runStructured("sloplash.jokes", {
      ...options(mockModel(reply('{"joke":"Flying, bu', "length"))),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "length", finishReason: "length" });
    if (!result.ok) expect(result.text).toBe('{"joke":"Flying, bu');
  });

  it("reports an empty truncated reply as length", async () => {
    const result = await runStructured("sloplash.jokes", {
      ...options(mockModel(reply("", "length"))),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "length" });
  });

  it("times out on its own budget", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise<GenerateResult>((_resolve, reject) => {
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }),
    });
    const result = await runStructured("sloplash.jokes", {
      ...options(model, { timeoutMs: 20 }),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "timeout", finishReason: null });
    expect(result.attempts).toBe(1);
    expect(result.usage.costUsd).toBe(0);
  });

  it("reports the caller's abort as aborted", async () => {
    const controller = new AbortController();
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise<GenerateResult>((_resolve, reject) => {
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
          setTimeout(() => controller.abort(), 5);
        }),
    });
    const result = await runStructured("sloplash.jokes", {
      ...options(model, { abortSignal: controller.signal, timeoutMs: 10_000 }),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "aborted" });
  });

  it("counts SDK retries as attempts", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) {
          throw new APICallError({
            message: "overloaded",
            url: "https://example.invalid",
            requestBodyValues: {},
            statusCode: 529,
            responseHeaders: { "retry-after-ms": "0" },
            isRetryable: true,
          });
        }
        return reply('{"joke":"x"}');
      },
    });
    const result = await runStructured("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("reports an API error that outlasts retries as provider-error", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "bad request",
          url: "https://example.invalid",
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const result = await runStructured("sloplash.ballots", {
      ...options(model),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "provider-error", attempts: 1 });
    if (!result.ok) expect(result.error).toContain("bad request");
  });

  it("fails at once as provider-error when Retry-After outlasts the budget", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "rate limited",
          url: "https://example.invalid",
          requestBodyValues: {},
          statusCode: 429,
          responseHeaders: { "retry-after": "30" },
          isRetryable: true,
        });
      },
    });
    const started = Date.now();
    const result = await runStructured("sloplash.ballots", {
      ...options(model),
      output: Output.object({ schema: jokeSchema }),
    });
    // The 20s ballot budget can't cover a 30s wait, so there is no sleep and no retry.
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result).toMatchObject({ ok: false, failReason: "provider-error", attempts: 1 });
    if (!result.ok) expect(result.error).toMatch(/retry in 30000 ms.*429: rate limited/u);
  });

  it("reports running out of budget while waiting to retry as provider-error", async () => {
    // A clock that jumps back after the start makes the guard allow a 5s wait
    // that the real 100ms timeout then cuts short.
    let reads = 0;
    const now = () => (reads++ === 0 ? 1_000_000 : 990_000);
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "overloaded",
          url: "https://example.invalid",
          requestBodyValues: {},
          statusCode: 529,
          responseHeaders: { "retry-after-ms": "5000" },
          isRetryable: true,
        });
      },
    });
    const result = await runStructured("sloplash.ballots", {
      ...options(model, { timeoutMs: 100, now }),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "provider-error", attempts: 1 });
    if (!result.ok) expect(result.error).toMatch(/waiting to retry.*529: overloaded/u);
  });

  it("skips the call when the deadline leaves less than the task's floor", async () => {
    const model = mockModel(reply('{"joke":"x"}'));
    const now = () => 1_000_000;
    const result = await runStructured("sloplash.jokes", {
      ...options(model, { deadline: 1_004_000, now }),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "timeout", attempts: 0 });
    if (!result.ok) expect(result.error).toMatch(/^skipped: 2500 ms left/u);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("lets a fallback share the first call's budget", async () => {
    const now = () => 1_000_000;
    const first = await runStructured("sloplash.ballots", {
      ...options(mockModel(reply('{"joke":"x"}')), { now }),
      output: Output.object({ schema: jokeSchema }),
    });
    expect(first.budgetEndsAt).toBe(1_020_000);

    const fallbackModel = mockModel(reply('{"joke":"x"}'));
    const fallback = await runStructured("sloplash.ballots", {
      ...options(fallbackModel, { now: () => 1_018_000, budgetEndsAt: first.budgetEndsAt }),
      output: Output.object({ schema: jokeSchema }),
    });
    // 2s left is under the 3s ballot floor, so the fallback is not sent.
    expect(fallback).toMatchObject({ ok: false, failReason: "timeout", attempts: 0 });
    expect(fallbackModel.doGenerateCalls).toHaveLength(0);
  });

  it("throws on a system message inside messages instead of reporting a provider error", async () => {
    const model = mockModel(reply("Sure."));
    await expect(
      runText("matchslop.reply", {
        ...options(model),
        prompt: undefined,
        messages: [
          { role: "user", content: "hi" },
          { role: "system", content: "mood: 40" },
        ],
      } as AiRunOptions),
    ).rejects.toSatisfy((error: unknown) => InvalidPromptError.isInstance(error));
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("fails fast as missing-key without calling a model", async () => {
    const result = await runStructured("sloplash.jokes", {
      model: HAIKU,
      keys: { gateway: "test-gateway-key" },
      promptVersion: 1,
      instructions: "Write one joke.",
      prompt: "x",
      deadline: null,
      output: Output.object({ schema: jokeSchema }),
    });
    expect(result).toMatchObject({ ok: false, failReason: "missing-key", attempts: 0 });
    expect(result.call.failReason).toBe("missing-key");
  });

  it("throws on a prompt layout mistake instead of calling the model", async () => {
    const model = mockModel(reply('{"joke":"x"}'));
    const blocks: InstructionBlock[] = [
      { text: "per-call", cache: false },
      { text: "rules", cache: "static" },
    ];
    await expect(
      runStructured("sloplash.jokes", {
        ...options(model, { instructions: blocks }),
        output: Output.object({ schema: jokeSchema }),
      }),
    ).rejects.toThrow(/static -> game -> call/u);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("picks one option with Output.choice", async () => {
    const result = await runStructured("matchslop.vote", {
      ...options(mockModel(reply('{"result":"B"}'))),
      output: Output.choice({ options: ["A", "B"] }),
    });
    expect(result).toMatchObject({ ok: true, output: "B" });
  });
});

describe("prompt caching", () => {
  const blocks: InstructionBlock[] = [
    { text: "Game rules", cache: "static" },
    { text: "Voice guide", cache: "static" },
    { text: "This room's prompts", cache: "game" },
    { text: "This round", cache: false },
  ];

  it("marks the last block of each cached tier for Anthropic models", async () => {
    const model = mockModel(reply("A fine line."));
    await runText("sloplash.tagline", { ...options(model), instructions: blocks });

    const call = model.doGenerateCalls[0]!;
    const system = call.prompt.filter((message) => message.role === "system");
    expect(system.map((message) => message.content)).toEqual([
      "Game rules",
      "Voice guide",
      "This room's prompts",
      "This round",
    ]);
    expect(system.map((message) => message.providerOptions?.anthropic?.cacheControl)).toEqual([
      undefined,
      { type: "ephemeral" },
      { type: "ephemeral" },
      undefined,
    ]);
    expect(call.providerOptions?.gateway).toBeUndefined();
  });

  it("keeps only the newest message breakpoints within the four-marker limit", async () => {
    const model = mockModel(reply("Sure."));
    const turn = (text: string, marked: boolean) => {
      const message = { role: "user" as const, content: text };
      return marked ? markCacheBreakpoint(message) : message;
    };
    await runText("matchslop.reply", {
      ...options(model),
      instructions: blocks,
      prompt: undefined,
      messages: [turn("one", true), turn("two", true), turn("three", true), turn("four", false)],
    } as AiRunOptions);

    const prompt = model.doGenerateCalls[0]!.prompt;
    const marked = prompt.filter(
      (message) => message.providerOptions?.anthropic?.cacheControl !== undefined,
    );
    // Two instruction tiers leave two breakpoints for the transcript: the newest two.
    expect(marked).toHaveLength(4);
    const users = prompt.filter((message) => message.role === "user");
    expect(users.map((message) => message.providerOptions?.anthropic?.cacheControl)).toEqual([
      undefined,
      { type: "ephemeral" },
      { type: "ephemeral" },
      undefined,
    ]);
  });

  it("asks the Gateway to cache automatically and adds no Anthropic markers", async () => {
    const model = mockModel(reply("A fine line."));
    await runText("sloplash.tagline", {
      ...options(model),
      model: GATEWAY_MODEL,
      instructions: blocks,
    });

    const call = model.doGenerateCalls[0]!;
    expect(call.providerOptions?.gateway).toEqual({ caching: "auto" });
    const system = call.prompt.filter((message) => message.role === "system");
    expect(system.every((message) => message.providerOptions?.anthropic === undefined)).toBe(true);
  });

  it("prices gateway cache reads at the input price and flags it", async () => {
    const result = await runText("sloplash.tagline", {
      ...options(mockModel(reply("A fine line."))),
      model: GATEWAY_MODEL,
    });
    expect(result.usage.cachePriceKnown).toBe(false);
    expect(result.usage.costUsd).toBeCloseTo((1_000 * 2 + 60 * 10) / 1_000_000, 10);
  });
});

describe("runText", () => {
  it("returns trimmed text when the model stopped on its own", async () => {
    const result = await runText("narrator.line", options(mockModel(reply("  Welcome back!  "))));
    expect(result).toMatchObject({ ok: true, text: "Welcome back!", output: "Welcome back!" });
  });

  it("rejects a line cut off by the output cap", async () => {
    const result = await runText("narrator.line", options(mockModel(reply("Welcome ba", "length"))));
    expect(result).toMatchObject({ ok: false, failReason: "length", text: "Welcome ba" });
  });

  it("rejects an empty reply", async () => {
    const result = await runText("narrator.line", options(mockModel(reply("   "))));
    expect(result).toMatchObject({ ok: false, failReason: "invalid-output" });
  });

  it("rejects a refusal", async () => {
    const result = await runText("narrator.line", options(mockModel(reply("", "content-filter"))));
    expect(result).toMatchObject({ ok: false, failReason: "refused" });
  });

  it("sends narrator lines with reasoning off and no retries", async () => {
    const model = mockModel(reply("Hi."));
    await runText("narrator.line", options(model));
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]!.reasoning).toBe("none");
    expect(model.doGenerateCalls[0]!.maxOutputTokens).toBe(1_000);
  });
});

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

const STREAM_USAGE = {
  inputTokens: { total: 1_000, noCache: 200, cacheRead: 700, cacheWrite: 100 },
  outputTokens: { total: 60, text: 40, reasoning: 20 },
};

function streamParts(deltas: string[], finish: Finish, extra: StreamPart[] = []): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    ...deltas.map((delta): StreamPart => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    ...extra,
    { type: "finish", usage: STREAM_USAGE, finishReason: { unified: finish, raw: finish } },
  ];
}

/** A streamed reply: `deltas` arrive one text chunk at a time, then the finish part. */
function streamed(deltas: string[], finish: Finish = "stop", extra: StreamPart[] = []) {
  return async (): Promise<StreamResult> => ({
    stream: simulateReadableStream({ chunks: streamParts(deltas, finish, extra), chunkDelayInMs: 1 }),
  });
}

const sheetSchema = z.object({ name: z.string(), legs: z.array(z.string()) });

describe("runStructuredStream", () => {
  it("delivers partials in order, then the parsed output with usage", async () => {
    const model = new MockLanguageModelV4({
      doStream: streamed(['{"name":"Sir', " Wobble", '","legs":["left"', ',"right"]}']),
    });
    const partials: unknown[] = [];
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: (partial) => {
        partials.push(partial);
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toEqual({ name: "Sir Wobble", legs: ["left", "right"] });
    expect(partials[0]).toEqual({ name: "Sir" });
    expect(partials).toContainEqual({ name: "Sir Wobble", legs: ["left"] });
    expect(partials.at(-1)).toEqual({ name: "Sir Wobble", legs: ["left", "right"] });
    const sizes = partials.map((partial) => JSON.stringify(partial).length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(result.attempts).toBe(1);
    expect(result.usage).toMatchObject({
      inputTokens: 1_000,
      outputTokens: 60,
      reasoningTokens: 20,
    });
    expect(result.call).toMatchObject({ ok: true, failReason: null, finishReason: "stop" });
    expect(model.doStreamCalls[0]!.reasoning).toBe("minimal");
    expect(model.doStreamCalls[0]!.maxOutputTokens).toBe(8_000);
  });

  it("keeps going when the partial listener throws", async () => {
    const model = new MockLanguageModelV4({ doStream: streamed(['{"name":"A","legs":[]}']) });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => {
        throw new Error("listener bug");
      },
    });
    expect(result).toMatchObject({ ok: true, output: { name: "A", legs: [] } });
  });

  it("salvages text when the final reply fails the schema", async () => {
    const model = new MockLanguageModelV4({ doStream: streamed(['{"name":', "7}"]) });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({ ok: false, failReason: "invalid-output", text: '{"name":7}' });
    expect(result.usage.inputTokens).toBe(1_000);
  });

  it("reports a refusal as refused before anything else", async () => {
    const model = new MockLanguageModelV4({
      doStream: streamed(['{"name":"Sir Wobble","legs":[]}'], "content-filter"),
    });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      failReason: "refused",
      finishReason: "content-filter",
    });
  });

  it("reports a truncated stream as length", async () => {
    const model = new MockLanguageModelV4({ doStream: streamed(['{"name":"Sir'], "length") });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({ ok: false, failReason: "length" });
  });

  it("reports an API error that opens no stream as provider-error, with the provider's message", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: "bad request",
          url: "https://example.invalid",
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({ ok: false, failReason: "provider-error", attempts: 1 });
    if (!result.ok) expect(result.error).toContain("bad request");
  });

  it("reports an error part mid-stream as provider-error", async () => {
    const model = new MockLanguageModelV4({
      doStream: streamed(['{"name":"Sir'], "error", [
        { type: "error", error: new Error("overloaded") },
      ]),
    });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({ ok: false, failReason: "provider-error", finishReason: "error" });
    if (!result.ok) expect(result.error).toContain("overloaded");
  });

  it("counts a retried stream request as an attempt", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        calls += 1;
        if (calls === 1) {
          throw new APICallError({
            message: "overloaded",
            url: "https://example.invalid",
            requestBodyValues: {},
            statusCode: 529,
            responseHeaders: { "retry-after-ms": "0" },
            isRetryable: true,
          });
        }
        return streamed(['{"name":"B","legs":[]}'])();
      },
    });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({ ok: true, attempts: 2 });
  });

  it("times out on its own budget while the stream is still arriving", async () => {
    const partials: unknown[] = [];
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: streamParts(['{"name":"Slow', '","legs":[]}'], "stop"),
          chunkDelayInMs: 200,
        }),
      }),
    });
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model, { timeoutMs: 300 }),
      output: Output.object({ schema: sheetSchema }),
      onPartial: (partial) => {
        partials.push(partial);
      },
    });
    expect(result).toMatchObject({ ok: false, failReason: "timeout", finishReason: null });
    expect(result.attempts).toBe(1);
    expect(partials.length).toBeLessThanOrEqual(1);
  });

  it("skips the call when the deadline leaves less than the task's floor", async () => {
    const model = new MockLanguageModelV4({ doStream: streamed(["{}"]) });
    const now = () => 1_000_000;
    const result = await runStructuredStream("sloplash.jokes", {
      ...options(model, { deadline: 1_004_000, now }),
      output: Output.object({ schema: sheetSchema }),
      onPartial: () => undefined,
    });
    expect(result).toMatchObject({ ok: false, failReason: "timeout", attempts: 0 });
    expect(model.doStreamCalls).toHaveLength(0);
  });
});
