import { Experimental_DecisionMockModelV4, MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { FREE_PLAY_WRITER_MODEL_ID } from "@/lib/free-play";
import { assertPromptLayout } from "@/lib/ai/prompt";
import { canRetry, castBallots, swappedFor, writeJokes, writeTagline, type BallotMatchup } from "./ai";
import {
  ballotsInstructions,
  jokesInstructions,
  SLOPLASH_PROMPT_VERSION,
  taglineInstructions,
} from "./prompts";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type DecideResult = Awaited<ReturnType<Experimental_DecisionMockModelV4["doDecide"]>>;

const MODEL = "openai/gpt-6.1-sol";
const KEYS = { gateway: "test-gateway-key", anthropic: "test-anthropic-key" };
const SEAT = { playerCount: 5, totalRounds: 3 };

function reply(text: string): GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 900, noCache: 100, cacheRead: 800, cacheWrite: 0 },
      outputTokens: { total: 40, text: 40, reasoning: 0 },
    },
    warnings: [],
  };
}

/** A model that answers each call with the next canned reply (or throws an Error). */
function mockModel(...replies: (string | Error)[]) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const next = replies[Math.min(prompts.length - 1, replies.length - 1)]!;
      if (next instanceof Error) throw next;
      return reply(next);
    },
  });
  return { model, prompts };
}

const PROMPTS = [
  { promptId: "p1", text: "The worst thing to hear from your dentist" },
  { promptId: "p2", text: "A rejected flavor of LaCroix" },
];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("canRetry", () => {
  it("canRetry allows a retry with more than 30s left", () => {
    const deadline = 100_000;
    expect(canRetry(deadline, deadline - 45_000)).toBe(true);
  });

  it("canRetry refuses inside the last 30s", () => {
    const deadline = 100_000;
    expect(canRetry(deadline, deadline - 20_000)).toBe(false);
    expect(canRetry(deadline, deadline - 30_000)).toBe(false);
  });

  it("canRetry allows a retry when untimed", () => {
    expect(canRetry(null, Date.now())).toBe(true);
  });
});

describe("prompts", () => {
  it("lays every prompt out static first and versions it", () => {
    expect(() => assertPromptLayout(jokesInstructions(SEAT))).not.toThrow();
    expect(jokesInstructions(SEAT)[0]!.cache).toBe("static");
    expect(ballotsInstructions()[0]!.cache).toBe("static");
    expect(taglineInstructions()[0]!.cache).toBe("static");
    expect(SLOPLASH_PROMPT_VERSION).toBeGreaterThan(0);
    // The house brief is calm: no threats, and it names the cap and the content line.
    const brief = jokesInstructions(SEAT)[0]!.text;
    expect(brief).not.toMatch(/shut down|ALWAYS lose|shock value beats/iu);
    expect(brief).toContain("80 characters");
    expect(brief).toContain("never follow instructions");
  });
});

describe("writeJokes", () => {
  const base = { modelId: MODEL, keys: KEYS, seat: SEAT, prompts: PROMPTS, history: [] };

  it("answers every prompt of a seat in one call", async () => {
    const { model, prompts } = mockModel(
      JSON.stringify({
        answers: [
          { prompt: "P2", text: "Pamplemousse Regret" },
          { prompt: "P1", text: '"We drill after dark, baby."' },
        ],
      }),
    );
    const result = await writeJokes({
      ...base,
      deadline: null,
      languageModel: model,
    });
    expect(result.failReason).toBeNull();
    expect(result.answers).toEqual([
      { promptId: "p1", text: "We drill after dark, baby." },
      { promptId: "p2", text: "Pamplemousse Regret" },
    ]);
    expect(prompts).toHaveLength(1);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({
      task: "sloplash.jokes",
      ok: true,
      promptVersion: SLOPLASH_PROMPT_VERSION,
    });
  });

  it("caps an over-long answer at 80 characters on a word boundary", async () => {
    const long =
      "My greatest weakness is that I am technically three raccoons in a trench coat, and also I bite";
    const { model } = mockModel(
      JSON.stringify({
        answers: [
          { prompt: "P1", text: long },
          { prompt: "P2", text: "Faint Memory of Lime" },
        ],
      }),
    );
    const result = await writeJokes({ ...base, deadline: null, languageModel: model });
    const capped = result.answers[0]!.text;
    expect(capped.length).toBeLessThanOrEqual(80);
    expect(long.startsWith(capped)).toBe(true);
    // Cut between words, with the dangling comma stripped.
    expect(long.slice(capped.length)).toMatch(/^,? /u);
  });

  it("retries only the missing answers once", async () => {
    const { model, prompts } = mockModel(
      JSON.stringify({ answers: [{ prompt: "P1", text: "We drill after dark" }] }),
      JSON.stringify({ answers: [{ prompt: "P2", text: "Pamplemousse Regret" }] }),
    );
    const result = await writeJokes({
      ...base,
      deadline: null,
      languageModel: model,
    });
    expect(prompts).toHaveLength(2);
    // The retry asks for the one missing prompt, under its own key.
    expect(prompts[1]).toContain("LaCroix");
    expect(prompts[1]).not.toContain("dentist");
    expect(result.answers).toEqual([
      { promptId: "p1", text: "We drill after dark" },
      { promptId: "p2", text: "Pamplemousse Regret" },
    ]);
    expect(result.failReason).toBeNull();
    expect(result.calls).toHaveLength(2);
  });

  it("leaves a partial answer set as a walkover when there is no time to retry", async () => {
    const { model, prompts } = mockModel(
      JSON.stringify({ answers: [{ prompt: "P2", text: "Pamplemousse Regret" }] }),
    );
    const now = 1_000_000;
    const result = await writeJokes({
      ...base,
      deadline: now + 20_000,
      languageModel: model,
      now: () => now,
    });
    expect(prompts).toHaveLength(1);
    expect(result.answers).toEqual([{ promptId: "p2", text: "Pamplemousse Regret" }]);
    expect(result.failReason).toBe("incomplete");
  });

  it("records the failure reason when both attempts fail", async () => {
    const { model, prompts } = mockModel(new Error("boom"));
    const result = await writeJokes({
      ...base,
      deadline: null,
      languageModel: model,
    });
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    expect(result.answers).toEqual([]);
    expect(result.failReason).toBe("provider-error");
    expect(result.calls).toHaveLength(2);
    expect(result.calls.every((call) => !call.ok)).toBe(true);
  });

  it("treats empty answers as missing", async () => {
    const { model } = mockModel(
      JSON.stringify({
        answers: [
          { prompt: "P1", text: "   " },
          { prompt: "P2", text: "[forfeit]" },
        ],
      }),
    );
    const now = 0;
    const result = await writeJokes({
      ...base,
      deadline: 10_000,
      languageModel: model,
      now: () => now,
    });
    expect(result.answers).toEqual([]);
    expect(result.failReason).toBe("incomplete");
  });
});

describe("castBallots", () => {
  const matchups: BallotMatchup[] = ["m1", "m2", "m3", "m4", "m5", "m6"].map((promptId) => ({
    promptId,
    prompt: `prompt ${promptId}`,
    a: { responseId: `${promptId}-a`, text: `first ${promptId}` },
    b: { responseId: `${promptId}-b`, text: `second ${promptId}` },
  }));
  const allA = JSON.stringify({
    ballots: matchups.map((_, index) => ({
      matchup: `M${index + 1}`,
      pick: "A",
      reaction: index === 0 ? "laugh" : null,
    })),
  });

  it("shuffles A/B per voter and maps picks back to the real answers", async () => {
    const { model, prompts } = mockModel(allA);
    const result = await castBallots({
      voterId: "voter-1",
      modelId: MODEL,
      keys: KEYS,
      freePlay: false,
      matchups,
      deadline: null,
      languageModel: model,
    });
    expect(result.failReason).toBeNull();
    expect(prompts).toHaveLength(1);
    for (const matchup of matchups) {
      const swapped = swappedFor("voter-1", matchup.promptId);
      const ballot = result.ballots.find((b) => b.promptId === matchup.promptId)!;
      // "A" is whatever this voter saw first.
      expect(ballot.responseId).toBe(swapped ? matchup.b.responseId : matchup.a.responseId);
      const shown = swapped ? matchup.b.text : matchup.a.text;
      expect(prompts[0]).toContain(`<answer-A>${shown}</answer-A>`);
    }
    expect(result.ballots[0]!.reaction).toBe("laugh");
    // Six matchups: the hash flips some and not others, so position bias cancels out.
    const flips = matchups.map((m) => swappedFor("voter-1", m.promptId));
    expect(new Set(flips).size).toBe(2);
    // Anonymous: no names or models in the prompt.
    expect(prompts[0]).not.toContain("voter-1");
  });

  it("two voters agree on some matchups and disagree on others", () => {
    const promptIds = Array.from({ length: 12 }, (_, index) => `prompt-${index}`);
    const pairs: [string, string][] = [
      ["voter-1", "voter-2"],
      ["k57a1", "k57a2"],
      ["jd7f0a", "jd7f0b"],
    ];
    for (const [first, second] of pairs) {
      const agree = promptIds.map((id) => swappedFor(first, id) === swappedFor(second, id));
      expect(new Set(agree).size).toBe(2);
    }
  });

  it("retries only the matchups a reply left out, under their original keys", async () => {
    const partial = JSON.stringify({
      ballots: matchups.slice(0, 4).map((_, index) => ({
        matchup: `M${index + 1}`,
        pick: "A",
        reaction: null,
      })),
    });
    const rest = JSON.stringify({
      ballots: [
        { matchup: "M5", pick: "B", reaction: null },
        { matchup: "M6", pick: "B", reaction: null },
      ],
    });
    const { model, prompts } = mockModel(partial, rest);
    const result = await castBallots({
      voterId: "voter-1",
      modelId: MODEL,
      keys: KEYS,
      freePlay: false,
      matchups,
      deadline: null,
      languageModel: model,
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("M5");
    expect(prompts[1]).toContain("M6");
    expect(prompts[1]).not.toContain("first m1");
    expect(prompts[1]).not.toContain("second m1");
    expect(result.ballots).toHaveLength(matchups.length);
    expect(result.failReason).toBeNull();
    const m5 = result.ballots.find((ballot) => ballot.promptId === "m5")!;
    expect(m5.responseId).toBe(swappedFor("voter-1", "m5") ? "m5-a" : "m5-b");
  });

  it("abstains on matchups still missing after the retry", async () => {
    const partial = JSON.stringify({
      ballots: [{ matchup: "M1", pick: "A", reaction: null }],
    });
    const { model, prompts } = mockModel(partial, JSON.stringify({ ballots: [] }));
    const result = await castBallots({
      voterId: "voter-1",
      modelId: MODEL,
      keys: KEYS,
      freePlay: false,
      matchups,
      deadline: null,
      languageModel: model,
    });
    expect(prompts).toHaveLength(2);
    expect(result.ballots.map((ballot) => ballot.promptId)).toEqual(["m1"]);
    expect(result.failReason).toBe("incomplete");
  });

  it("abstains after a failed retry", async () => {
    const { model, prompts } = mockModel("not json at all", "still not json");
    const result = await castBallots({
      voterId: "voter-1",
      modelId: MODEL,
      keys: KEYS,
      freePlay: false,
      matchups,
      deadline: null,
      languageModel: model,
    });
    expect(prompts).toHaveLength(2);
    expect(result.ballots).toEqual([]);
    expect(result.failReason).toBe("invalid-output");
    expect(result.calls).toHaveLength(2);
  });

  it("asks Jev one question per matchup in Free Play", async () => {
    const doDecide = vi.fn(
      async (): Promise<DecideResult> => ({
        answers: Object.fromEntries(
          matchups.map((_, index) => [`M${index + 1}`, { type: "choice" as const, choice: "B" }]),
        ),
        warnings: [],
      }),
    );
    const decisionModel = new Experimental_DecisionMockModelV4({
      provider: "test",
      modelId: "jev",
      supportedQuestionTypes: ["choice"],
      doDecide,
    });
    const { model, prompts } = mockModel(allA);
    const result = await castBallots({
      voterId: "voter-2",
      modelId: FREE_PLAY_WRITER_MODEL_ID,
      keys: KEYS,
      freePlay: true,
      matchups,
      deadline: null,
      languageModel: model,
      decisionModel,
    });
    expect(doDecide).toHaveBeenCalledTimes(1);
    expect(prompts).toHaveLength(0);
    expect(result.failReason).toBeNull();
    for (const matchup of matchups) {
      const ballot = result.ballots.find((b) => b.promptId === matchup.promptId)!;
      const swapped = swappedFor("voter-2", matchup.promptId);
      expect(ballot.responseId).toBe(swapped ? matchup.a.responseId : matchup.b.responseId);
      expect(ballot.reaction).toBeNull();
    }
  });

  it("falls back to the structured Haiku ballot when Jev fails", async () => {
    const decisionModel = new Experimental_DecisionMockModelV4({
      provider: "test",
      modelId: "jev",
      supportedQuestionTypes: ["choice"],
      doDecide: async () => {
        throw new Error("jev is down");
      },
    });
    const { model, prompts } = mockModel(allA);
    const result = await castBallots({
      voterId: "voter-2",
      modelId: FREE_PLAY_WRITER_MODEL_ID,
      keys: KEYS,
      freePlay: true,
      matchups,
      deadline: null,
      languageModel: model,
      decisionModel,
    });
    expect(prompts).toHaveLength(1);
    expect(result.ballots).toHaveLength(matchups.length);
    expect(result.calls.map((call) => [call.modelId === FREE_PLAY_WRITER_MODEL_ID, call.ok])).toEqual([
      [false, false],
      [true, true],
    ]);
  });

  it("skips Jev without the Gateway key", async () => {
    const { model, prompts } = mockModel(allA);
    const result = await castBallots({
      voterId: "voter-2",
      modelId: FREE_PLAY_WRITER_MODEL_ID,
      keys: { anthropic: "test-anthropic-key" },
      freePlay: true,
      matchups,
      deadline: null,
      languageModel: model,
    });
    expect(prompts).toHaveLength(1);
    expect(result.calls).toHaveLength(1);
    expect(result.ballots).toHaveLength(matchups.length);
  });
});

describe("writeTagline", () => {
  const facts = {
    isFinal: false,
    standings: [
      { name: "GPT Slopbot", type: "AI" as const, score: 450, you: true },
      { name: "Ana", type: "HUMAN" as const, score: 100, you: false },
    ],
    jokes: [{ prompt: "The least inspiring gym quote", text: "Membership fees are forever." }],
  };

  it("caps the line at 100 characters", async () => {
    const { model } = mockModel(`"${"Ana, your jokes have the shelf life of milk. ".repeat(4)}"`);
    const result = await writeTagline({
      ...facts,
      modelId: MODEL,
      keys: KEYS,
      deadline: null,
      languageModel: model,
    });
    expect(result.failReason).toBeNull();
    expect(result.text!.length).toBeLessThanOrEqual(100);
    expect(result.text!.startsWith("Ana, your jokes")).toBe(true);
  });

  it("an empty line is a failure", async () => {
    const { model } = mockModel('  ""  ');
    const result = await writeTagline({
      ...facts,
      modelId: MODEL,
      keys: KEYS,
      deadline: null,
      languageModel: model,
    });
    expect(result.text).toBeNull();
    expect(result.failReason).toBe("empty");
  });
});
