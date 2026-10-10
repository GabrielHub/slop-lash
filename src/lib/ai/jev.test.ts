import { APICallError } from "ai";
import { Experimental_DecisionMockModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { JEV_MODEL } from "../models";
import { canUseJev, decideChoices } from "./jev";

type DecideResult = Awaited<ReturnType<Experimental_DecisionMockModelV4["doDecide"]>>;

const QUESTIONS = {
  m1: {
    instructions: "Which answer is funnier?",
    options: { A: "First answer", B: "Second answer" },
  },
  m2: {
    instructions: "Which answer is funnier?",
    options: { A: null, B: null },
  },
} as const;

const STATE = [{ type: "text" as const, text: "<answer-A>cats</answer-A>" }];

function mockJev(doDecide: () => Promise<DecideResult>) {
  return new Experimental_DecisionMockModelV4({
    provider: "test",
    modelId: JEV_MODEL.id,
    supportedQuestionTypes: ["choice"],
    doDecide,
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("canUseJev", () => {
  it("needs the Gateway key", () => {
    expect(canUseJev({ gateway: "test-gateway-key" })).toBe(true);
    expect(canUseJev({ gateway: "  " })).toBe(false);
    expect(canUseJev({ anthropic: "test-anthropic-key" })).toBe(false);
  });
});

describe("decideChoices", () => {
  it("returns every pick, its probabilities and the call record", async () => {
    const model = mockJev(async () => ({
      answers: {
        m1: { type: "choice", choice: "B", probabilities: { A: 0.2, B: 0.8 } },
        m2: { type: "choice", choice: "A" },
      },
      usage: { inputTokens: 1_000_000 },
      warnings: [],
    }));
    const result = await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 2,
      deadline: null,
      decisionModel: model,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toEqual({ m1: "B", m2: "A" });
    expect(result.probabilities).toEqual({ m1: { A: 0.2, B: 0.8 } });
    expect(result.usage.inputTokens).toBe(1_000_000);
    expect(result.usage.costUsd).toBeCloseTo(JEV_MODEL.inputPer1M, 10);
    expect(result.call).toMatchObject({
      task: "sloplash.ballots",
      promptVersion: 2,
      modelId: JEV_MODEL.id,
      ok: true,
      failReason: null,
      finishReason: null,
      attempts: 1,
    });
  });

  it("sends one choice question per id over the shared state", async () => {
    const doDecide = vi.fn(async () => ({
      answers: { m1: { type: "choice" as const, choice: "A" }, m2: { type: "choice" as const, choice: "B" } },
      warnings: [],
    }));
    await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 1,
      deadline: null,
      decisionModel: mockJev(doDecide),
    });
    const [callOptions] = doDecide.mock.calls[0] as unknown as [
      { state: unknown; questions: Record<string, unknown> },
    ];
    expect(callOptions.state).toEqual(STATE);
    expect(callOptions.questions.m1).toEqual({
      type: "choice",
      instructions: "Which answer is funnier?",
      criteria: { A: "First answer", B: "Second answer" },
    });
  });

  it("reports a refusal with the refused ids and the billed usage", async () => {
    const model = mockJev(async () => ({
      answers: { m1: { type: "choice", choice: "A" }, m2: { type: "refusal" } },
      usage: { inputTokens: 500 },
      warnings: [],
    }));
    const result = await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 1,
      deadline: null,
      decisionModel: model,
    });

    expect(result).toMatchObject({ ok: false, failReason: "refused", refusedQuestionIds: ["m2"] });
    expect(result.usage.inputTokens).toBe(500);
    expect(result.call.failReason).toBe("refused");
  });

  it("reports a pick outside the options as invalid-output", async () => {
    const model = mockJev(async () => ({
      answers: { m1: { type: "choice", choice: "C" }, m2: { type: "choice", choice: "A" } },
      warnings: [],
    }));
    const result = await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 1,
      deadline: null,
      decisionModel: model,
    });
    expect(result).toMatchObject({ ok: false, failReason: "invalid-output" });
  });

  it("times out on its own budget", async () => {
    const model = new Experimental_DecisionMockModelV4({
      supportedQuestionTypes: ["choice"],
      doDecide: ({ abortSignal }) =>
        new Promise<DecideResult>((_resolve, reject) => {
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }),
    });
    const result = await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 1,
      deadline: null,
      timeoutMs: 20,
      decisionModel: model,
    });
    expect(result).toMatchObject({ ok: false, failReason: "timeout" });
  });

  it("fails at once as provider-error when a rate limit outlasts the budget", async () => {
    const doDecide = vi.fn(async (): Promise<DecideResult> => {
      throw new APICallError({
        message: "rate limited",
        url: "https://example.invalid",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "retry-after": "45" },
        isRetryable: true,
      });
    });
    const result = await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 1,
      deadline: null,
      decisionModel: mockJev(doDecide),
    });
    expect(result).toMatchObject({ ok: false, failReason: "provider-error", attempts: 1 });
    expect(doDecide).toHaveBeenCalledTimes(1);
  });

  it("shares a budget with a later fallback", async () => {
    const model = mockJev(async () => ({
      answers: { m1: { type: "choice", choice: "A" }, m2: { type: "choice", choice: "B" } },
      warnings: [],
    }));
    const result = await decideChoices(QUESTIONS, STATE, {}, {
      promptVersion: 1,
      deadline: null,
      decisionModel: model,
      now: () => 5_000,
    });
    expect(result.budgetEndsAt).toBe(25_000);
  });

  it("throws on an empty question map instead of calling the model", async () => {
    const doDecide = vi.fn();
    await expect(
      decideChoices({}, STATE, {}, {
        promptVersion: 1,
        deadline: null,
        decisionModel: mockJev(doDecide),
      }),
    ).rejects.toThrow(/at least one question/u);
    expect(doDecide).not.toHaveBeenCalled();
  });

  it("fails as missing-key without the Gateway key", async () => {
    const result = await decideChoices(QUESTIONS, STATE, { anthropic: "test-anthropic-key" }, {
      promptVersion: 1,
      deadline: null,
    });
    expect(result).toMatchObject({ ok: false, failReason: "missing-key", attempts: 0 });
  });
});
