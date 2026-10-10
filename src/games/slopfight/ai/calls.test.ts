import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { resolveModifiers, type MatchupNote } from "../modifiers";
import { parsePartialParts, type Champion, type ForgeResult } from "../sheet";
import { FORGE_EXAMPLES } from "./examples";
import { REJECTION_TEXT_MAX } from "../constants";
import {
  finishForgeResult,
  forgeChampion,
  planForLegs,
  REFUSAL_REJECTION,
  replyProblems,
  seatItem,
  type ForgeStreamInfo,
} from "./forge";
import { inventHouseChampions } from "./house";
import { settleNotes, writeMatchup } from "./matchup";
import { writeRecapLine } from "./recap";
import { FORGE_PROMPT_VERSION } from "./forge-prompt";
import { SLOPFIGHT_FALLBACK_MODEL_ID, SLOPFIGHT_MODEL_ID } from "./shared";

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type Finish = GenerateResult["finishReason"]["unified"];

const USAGE = {
  inputTokens: { total: 8_000, noCache: 1_000, cacheRead: 7_000, cacheWrite: 0 },
  outputTokens: { total: 2_500, text: 1_500, reasoning: 1_000 },
};
const KEYS = { anthropic: "test-anthropic-key" };
const ARENAS = ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as const;

const GERALD = FORGE_EXAMPLES[0]!.result;
const STEVE = FORGE_EXAMPLES[1]!.result.champion!;
const SMUDGE = FORGE_EXAMPLES[4]!.result;

/** A streamed reply in three text chunks. */
function streamOf(text: string, finish: Finish = "stop"): () => Promise<StreamResult> {
  const third = Math.ceil(text.length / 3);
  const deltas = [text.slice(0, third), text.slice(third, 2 * third), text.slice(2 * third)];
  const chunks: StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    ...deltas.filter(Boolean).map((delta): StreamPart => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    { type: "finish", usage: USAGE, finishReason: { unified: finish, raw: finish } },
  ];
  return async () => ({ stream: simulateReadableStream({ chunks }) });
}

function providerError(): never {
  throw new APICallError({
    message: "overloaded",
    url: "https://example.invalid",
    requestBodyValues: {},
    statusCode: 400,
    isRetryable: false,
  });
}

/** Streams the given replies in order, one per call. */
function streamingModel(...replies: (ForgeResult | "refuse" | "error" | (() => Promise<StreamResult>))[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const reply = replies[Math.min(index, replies.length - 1)]!;
      index += 1;
      if (reply === "error") providerError();
      if (reply === "refuse") return streamOf("", "content-filter")();
      if (typeof reply === "function") return reply();
      void options;
      return streamOf(JSON.stringify(reply))();
    },
  });
}

function generatingModel(...replies: (object | "refuse" | "error")[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const reply = replies[Math.min(index, replies.length - 1)]!;
      index += 1;
      if (reply === "error") providerError();
      const refused = reply === "refuse";
      return {
        content: refused ? [] : [{ type: "text", text: JSON.stringify(reply) }],
        finishReason: { unified: refused ? "content-filter" : "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      } satisfies GenerateResult;
    },
  });
}

function models(haiku: MockLanguageModelV4, sonnet: MockLanguageModelV4) {
  return (modelId: string) => (modelId === SLOPFIGHT_MODEL_ID ? haiku : sonnet);
}

/** A sheet whose parts lost their torso: a structural problem that earns a repair. */
function withoutTorso(result: ForgeResult): ForgeResult {
  const champion = result.champion!;
  return { ...result, champion: { ...champion, parts: champion.parts.slice(1) } };
}

const forgeBase = { arenas: ARENAS, keys: KEYS, deadline: null } as const;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("forgeChampion", () => {
  it("streams partials on Haiku and returns a balanced champion", async () => {
    const haiku = streamingModel(GERALD);
    const sonnet = streamingModel("error");
    const seen: { parts: number; info: ForgeStreamInfo }[] = [];
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "this is Gerald, a frog in a suit",
      languageModel: models(haiku, sonnet),
      onPartial: (partial, info) => seen.push({ parts: parsePartialParts(partial).length, info }),
    });

    expect(forged.ok).toBe(true);
    if (!forged.ok) return;
    expect(forged.result).toEqual(GERALD);
    expect(forged.calls).toHaveLength(1);
    expect(forged.calls[0]).toMatchObject({
      task: "slopfight.forge",
      modelId: SLOPFIGHT_MODEL_ID,
      promptVersion: FORGE_PROMPT_VERSION,
      ok: true,
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((entry) => entry.info.attempt === 0 && entry.info.stage === "forge")).toBe(true);
    const counts = seen.map((entry) => entry.parts);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(sonnet.doStreamCalls).toHaveLength(0);
    const call = haiku.doStreamCalls[0]!;
    expect(call.reasoning).toBe("high");
    expect(call.maxOutputTokens).toBe(16_000);
    expect(call.prompt.filter((message) => message.role === "system")).toHaveLength(3);
  });

  it("sends the drawing as an image part before the text", async () => {
    const haiku = streamingModel(GERALD);
    await forgeChampion({
      ...forgeBase,
      mode: "submit",
      png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      languageModel: models(haiku, streamingModel("error")),
    });
    const user = haiku.doStreamCalls[0]!.prompt.find((message) => message.role === "user")!;
    expect(Array.isArray(user.content)).toBe(true);
    const content = user.content as { type: string; mediaType?: string }[];
    expect(content[0]).toMatchObject({ type: "file", mediaType: "image/png" });
    expect(content[1]!.type).toBe("text");
  });

  it("repairs a structural problem once on Haiku", async () => {
    const haiku = streamingModel(withoutTorso(GERALD), GERALD);
    const sonnet = streamingModel("error");
    const stages: string[] = [];
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "a frog",
      languageModel: models(haiku, sonnet),
      onPartial: (_partial, info) => {
        if (stages.at(-1) !== info.stage) stages.push(info.stage);
      },
    });
    expect(forged).toMatchObject({ ok: true, result: GERALD });
    expect(forged.calls.map((call) => call.task)).toEqual(["slopfight.forge", "slopfight.forge"]);
    expect(stages).toEqual(["forge", "repair"]);
    const repairPrompt = haiku.doStreamCalls[1]!.prompt;
    expect(repairPrompt.map((message) => message.role)).toEqual([
      "system",
      "system",
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(JSON.stringify(repairPrompt.at(-1))).toContain("exactly one torso");
    expect(sonnet.doStreamCalls).toHaveLength(0);
  });

  it("repairs a body plan its legs contradict, such as a one-legged BIPED", async () => {
    const champion = GERALD.champion!;
    const oneLeg: ForgeResult = {
      ...GERALD,
      champion: {
        ...champion,
        parts: champion.parts.filter((part) => part.id !== "leg2" && part.parent !== "leg2"),
      },
    };
    expect(replyProblems("submit", oneLeg).map((problem) => problem.code)).toEqual(["body_plan_legs"]);
    const haiku = streamingModel(oneLeg, GERALD);
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "a frog",
      languageModel: models(haiku, streamingModel("error")),
    });
    expect(forged).toMatchObject({ ok: true, result: GERALD });
    expect(JSON.stringify(haiku.doStreamCalls[1]!.prompt.at(-1))).toContain("BIPED, which has exactly 2 legs");
  });

  it("gives an unrepaired Sonnet reply the body plan its legs imply", async () => {
    const champion = GERALD.champion!;
    const oneLeg: ForgeResult = {
      ...GERALD,
      champion: {
        ...champion,
        parts: champion.parts.filter((part) => part.id !== "leg2" && part.parent !== "leg2"),
      },
    };
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "a frog",
      languageModel: models(streamingModel("error"), streamingModel(oneLeg)),
    });
    expect(forged.ok).toBe(true);
    if (!forged.ok) return;
    expect(forged.calls.map((call) => call.task)).toEqual(["slopfight.forge", "slopfight.forgeFallback"]);
    expect(forged.result.champion!.bodyPlan).toBe("HOPPER");
    expect(replyProblems("submit", forged.result)).toEqual([]);
  });

  it("derives a body plan from the leg count only when the two disagree", () => {
    expect(planForLegs("BIPED", 2)).toBe("BIPED");
    expect(planForLegs("FLIER", 6)).toBe("FLIER");
    expect(planForLegs("SLITHER", 0)).toBe("SLITHER");
    expect(planForLegs("BIPED", 0)).toBe("HOPPER");
    expect(planForLegs("MULTIPED", 2)).toBe("BIPED");
    expect(planForLegs("SLITHER", 4)).toBe("QUADRUPED");
    expect(planForLegs("QUADRUPED", 7)).toBe("MULTIPED");
  });

  it("accepts every example reply as it is", () => {
    for (const example of FORGE_EXAMPLES) expect(replyProblems(example.mode, example.result)).toEqual([]);
  });

  it("falls back to Sonnet at medium when the repair is still broken", async () => {
    const broken = withoutTorso(GERALD);
    const haiku = streamingModel(broken, broken);
    const sonnet = streamingModel(GERALD);
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "a frog",
      languageModel: models(haiku, sonnet),
    });
    expect(forged).toMatchObject({ ok: true, result: GERALD });
    expect(forged.calls.map((call) => [call.task, call.modelId])).toEqual([
      ["slopfight.forge", SLOPFIGHT_MODEL_ID],
      ["slopfight.forge", SLOPFIGHT_MODEL_ID],
      ["slopfight.forgeFallback", SLOPFIGHT_FALLBACK_MODEL_ID],
    ]);
    expect(sonnet.doStreamCalls[0]!.reasoning).toBe("medium");
  });

  it("falls back to Sonnet when the Haiku call fails outright", async () => {
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "upgrade",
      previous: GERALD.champion!,
      addition: "a jetpack",
      languageModel: models(streamingModel("error"), streamingModel(GERALD)),
    });
    expect(forged).toMatchObject({ ok: true, result: GERALD });
    expect(forged.calls.map((call) => call.failReason)).toEqual(["provider-error", null]);
  });

  it("turns a Haiku refusal on a player's submit into a kind REJECT without Sonnet", async () => {
    const sonnet = streamingModel(GERALD);
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "something the safeguards decline",
      languageModel: models(streamingModel("refuse"), sonnet),
    });
    expect(forged).toMatchObject({
      ok: true,
      result: { verdict: "REJECT", rejection: REFUSAL_REJECTION, champion: null },
    });
    expect(forged.calls).toHaveLength(1);
    expect(forged.calls[0]!.failReason).toBe("refused");
    expect(sonnet.doStreamCalls).toHaveLength(0);
  });

  it("passes a model's own REJECT through, cleaned", async () => {
    const reject = FORGE_EXAMPLES[3]!.result;
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "my landlord",
      languageModel: models(streamingModel(reject), streamingModel("error")),
    });
    expect(forged).toMatchObject({ ok: true, result: reject });
  });

  it("sends a refused lenient forge to Sonnet", async () => {
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "lenient",
      languageModel: models(streamingModel("refuse"), streamingModel(SMUDGE)),
    });
    expect(forged).toMatchObject({ ok: true, result: SMUDGE });
    expect(forged.calls.map((call) => call.modelId)).toEqual([
      SLOPFIGHT_MODEL_ID,
      SLOPFIGHT_FALLBACK_MODEL_ID,
    ]);
  });

  it("never returns a REJECT from a lenient forge", async () => {
    const reject = FORGE_EXAMPLES[3]!.result;
    const haiku = streamingModel(reject, reject);
    const repaired = await forgeChampion({
      ...forgeBase,
      mode: "lenient",
      text: "my landlord",
      languageModel: models(haiku, streamingModel(SMUDGE)),
    });
    expect(repaired).toMatchObject({ ok: true, result: { verdict: "FORGE" } });
    expect(JSON.stringify(haiku.doStreamCalls[1]!.prompt.at(-1))).toContain("never REJECT");

    const stubborn = await forgeChampion({
      ...forgeBase,
      mode: "lenient",
      text: "my landlord",
      languageModel: models(streamingModel(reject, reject), streamingModel(reject)),
    });
    expect(stubborn).toMatchObject({ ok: false, failReason: "invalid-output" });
    expect(stubborn.calls).toHaveLength(3);
  });

  it("reports failure when both models fail", async () => {
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "house",
      text: "a wheel of brie with six legs",
      languageModel: models(streamingModel("error"), streamingModel("error")),
    });
    expect(forged).toMatchObject({ ok: false, failReason: "provider-error" });
    expect(forged.calls).toHaveLength(2);
  });

  it("uses the same schema object on every forge call", async () => {
    const broken = withoutTorso(GERALD);
    const haiku = streamingModel(broken, broken);
    const sonnet = streamingModel(GERALD);
    await forgeChampion({ ...forgeBase, mode: "submit", text: "a frog", languageModel: models(haiku, sonnet) });
    await forgeChampion({ ...forgeBase, mode: "house", text: "a goose", languageModel: models(haiku, sonnet) });
    const formats = [...haiku.doStreamCalls, ...sonnet.doStreamCalls].map((call) => call.responseFormat);
    expect(formats.length).toBeGreaterThanOrEqual(4);
    for (const format of formats) expect(format).toEqual(formats[0]);
    expect(formats[0]).toMatchObject({ type: "json" });
  });

  it("balances an over-budget champion before returning it", async () => {
    const greedy: ForgeResult = {
      ...GERALD,
      champion: {
        ...GERALD.champion!,
        stats: { heft: 5, reach: 5, chaos: 5 },
        name: "Gerald the Unstoppable Destroyer of Worlds",
      },
    };
    const forged = await forgeChampion({
      ...forgeBase,
      mode: "submit",
      text: "Gerald, power 5 on everything",
      languageModel: models(streamingModel(greedy), streamingModel("error")),
    });
    expect(forged.ok).toBe(true);
    if (!forged.ok) return;
    const stats = forged.result.champion!.stats;
    expect(stats.heft + stats.reach + stats.chaos).toBe(9);
    expect(forged.result.champion!.name.length).toBeLessThanOrEqual(24);
  });
});

describe("finishForgeResult", () => {
  const rejection = (reason: string, suggestion: string): ForgeResult => ({
    verdict: "REJECT",
    rejection: { reason, suggestion },
    champion: null,
  });

  it("shortens an overlong rejection to whole sentences or clauses, never mid-thought", () => {
    const reason =
      "We can't forge real people, even famous singers with iconic microphones, a stadium tour and a perfume line of their own.";
    const suggestion =
      "Try an invented pop star: a sequined hedgehog with a microphone and a sold-out crowd of adoring garden snails waiting.";
    expect(reason.length).toBeGreaterThanOrEqual(120);
    expect(suggestion.length).toBeGreaterThanOrEqual(110);
    const finished = finishForgeResult(rejection(reason, suggestion)).rejection!;
    expect(finished.reason).toBe("We can't forge real people, even famous singers with iconic microphones.");
    expect(finished.suggestion).toBe("Try an invented pop star.");
    expect(finished.reason.length).toBeLessThanOrEqual(REJECTION_TEXT_MAX);
  });

  it("cuts a rejection with no sentence or clause break at a whole word", () => {
    const suggestion =
      "Try drawing a hedgehog holding a giant microphone in front of a huge crowd of cheering snails in tiny hats tonight";
    expect(suggestion.length).toBeGreaterThanOrEqual(110);
    const finished = finishForgeResult(rejection("Nothing to forge yet.", suggestion)).rejection!;
    expect(finished.suggestion.length).toBeLessThanOrEqual(REJECTION_TEXT_MAX);
    expect(suggestion.startsWith(finished.suggestion)).toBe(true);
    expect(suggestion[finished.suggestion.length]).toBe(" ");
    expect(finished.suggestion).not.toMatch(/\b(?:a|of|in|the|and)$/u);
  });
});

describe("seatItem", () => {
  type Part = Champion["parts"][number];
  const part = (id: string, role: Part["role"], parent: string | null, anchor: Part["anchor"]): Part => ({
    id,
    role,
    shape: "capsule",
    size: "M",
    elongation: "normal",
    parent,
    anchor,
    color: "primary",
    mirror: false,
  });
  const body = (...parts: Part[]): Champion => ({ ...STEVE, item: "thing", parts: [part("torso", "torso", null, null), ...parts] });
  const legs = [1, 2, 3, 4].map((n) => part(`leg${n}`, "leg", "torso", `leg${n}` as Part["anchor"]));
  const where = (champion: Champion) => {
    const item = champion.parts.find((p) => p.role === "item")!;
    return `${item.parent}.${item.anchor}`;
  };

  it("moves an item off the torso into arm2's hand, a claw on it, or the mouth", () => {
    const head = part("head", "head", "torso", "front");
    const cards = part("cards", "item", "torso", "front");
    const armed = body(head, cards, part("arm1", "arm", "torso", "arm1"), part("arm2", "arm", "torso", "arm2"));
    expect(where(seatItem(armed))).toBe("arm2.bottom");
    expect(seatItem(armed).parts.at(-1)!.id).toBe("cards");
    const clawed = body(head, part("arm2", "arm", "torso", "arm2"), part("claw", "arm", "arm2", "bottom"), cards);
    expect(where(seatItem(clawed))).toBe("claw.bottom");
    const necked = body(part("neck", "head", "torso", "front"), part("muzzle", "head", "neck", "top"), ...legs, cards);
    expect(where(seatItem(necked))).toBe("muzzle.bottom");
  });

  it("leaves held items, items with parts of their own and headless armless bodies alone", () => {
    const held = body(part("arm2", "arm", "torso", "arm2"), part("cards", "item", "arm2", "bottom"));
    expect(seatItem(held)).toBe(held);
    const mouthed = body(part("head", "head", "torso", "front"), part("cards", "item", "head", "bottom"));
    expect(seatItem(mouthed)).toBe(mouthed);
    const nested = body(part("head", "head", "torso", "front"), part("case", "item", "torso", "top"), part("lid", "fin", "case", "top"));
    expect(seatItem(nested)).toBe(nested);
    const cone = body(part("broom", "item", "torso", "right"));
    expect(seatItem(cone)).toBe(cone);
  });

  it("runs in finishForgeResult and is idempotent", () => {
    const head = part("head", "head", "torso", "top");
    const loose = body(head, ...legs, part("case", "item", "torso", "top"));
    const finished = finishForgeResult({ verdict: "FORGE", rejection: null, champion: { ...loose, markings: [] } }).champion!;
    expect(where(finished)).toBe("head.bottom");
    expect(seatItem(finished)).toBe(finished);
  });
});

describe("inventHouseChampions", () => {
  const output = {
    champions: [
      { description: "A sourdough starter on four crusty legs." },
      { description: "A goose in a hi-vis vest." },
      { description: "A haunted gnome." },
    ],
  };

  it("returns the asked-for number of descriptions from Haiku", async () => {
    const haiku = generatingModel(output);
    const result = await inventHouseChampions({
      arenas: ARENAS,
      count: 2,
      seed: 42,
      keys: KEYS,
      deadline: null,
      languageModel: models(haiku, generatingModel("error")),
    });
    expect(result).toMatchObject({
      ok: true,
      descriptions: ["A sourdough starter on four crusty legs.", "A goose in a hi-vis vest."],
    });
    expect(haiku.doGenerateCalls[0]!.reasoning).toBe("high");
    expect(JSON.stringify(haiku.doGenerateCalls[0]!.prompt)).toContain("exactly 2 house champion");
  });

  it("falls back to Sonnet on a refusal or a short list", async () => {
    const refused = await inventHouseChampions({
      arenas: ARENAS,
      count: 2,
      seed: 1,
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel("refuse"), generatingModel(output)),
    });
    expect(refused).toMatchObject({ ok: true });
    expect(refused.calls.map((call) => call.task)).toEqual(["slopfight.house", "slopfight.houseFallback"]);

    const short = await inventHouseChampions({
      arenas: ARENAS,
      count: 3,
      seed: 1,
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel({ champions: [output.champions[0]] }), generatingModel("error")),
    });
    expect(short).toMatchObject({ ok: false, failReason: "provider-error" });
    expect(short.calls).toHaveLength(2);
  });
});

describe("writeMatchup", () => {
  const a: Champion = GERALD.champion!;
  const b: Champion = STEVE;

  it("clamps notes through the modifier caps and keeps two walk-ons", async () => {
    const reply = {
      notes: [
        { side: "A", modifies: "speed", value: 80, reason: "Frogs love a puddle" },
        { side: "B", modifies: "grappleImmune", value: 7, reason: "Too many legs to grab" },
        { side: "A", modifies: "strikePower", value: 0, reason: "Nothing at all" },
        { side: "B", modifies: "reach", value: -3, reason: "Short little legs" },
        { side: "A", modifies: "damageDealt", value: 10, reason: "Over the limit of four notes" },
      ],
      walkOnA: "Gerald has a complaint about the water.",
      walkOnB: "Steve brought all six legs.",
    };
    const result = await writeMatchup({
      a,
      b,
      arena: "FLOODED_GARAGE",
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel(reply), generatingModel("error")),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes).toEqual([
      { side: "A", modifies: "speed", value: 30, reason: "Frogs love a puddle" },
      { side: "B", modifies: "grappleImmune", value: 1, reason: "Too many legs to grab" },
      { side: "B", modifies: "reach", value: -1, reason: "Short little legs" },
    ]);
    expect(result.walkOn).toEqual(["Gerald has a complaint about the water.", "Steve brought all six legs."]);
    // The kept notes resolve with nothing dropped.
    expect(resolveModifiers(a, b, "FLOODED_GARAGE", result.notes).notes.some((note) => note.dropped)).toBe(
      false,
    );
  });

  it("drops a flag note that the favour cap rejects", () => {
    const notes: MatchupNote[] = [
      { side: "A", modifies: "grappleImmune", value: 1, reason: "Slippery suit" },
      { side: "A", modifies: "strikeKnockbackImmune", value: 1, reason: "Heavy briefcase" },
    ];
    const kept = settleNotes(a, b, "KITCHEN_COUNTER", notes);
    expect(kept).toEqual([notes[0]]);
  });

  it("falls back to Sonnet when Haiku fails or no note survives", async () => {
    const empty = { notes: [], walkOnA: "x", walkOnB: "y" };
    const good = {
      notes: [{ side: "A", modifies: "speed", value: 10, reason: "Wet feet" }],
      walkOnA: "",
      walkOnB: "Steve is here.",
    };
    const result = await writeMatchup({
      a,
      b,
      arena: "ROOFTOP",
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel(empty), generatingModel(good)),
    });
    expect(result).toMatchObject({ ok: true, walkOn: [a.narration.walkOn[0], "Steve is here."] });
    expect(result.calls.map((call) => call.task)).toEqual(["slopfight.matchup", "slopfight.matchupFallback"]);

    const refused = await writeMatchup({
      a,
      b,
      arena: "ROOFTOP",
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel("refuse"), generatingModel(good)),
    });
    expect(refused).toMatchObject({ ok: true });
  });
});

describe("writeRecapLine", () => {
  const outcome = {
    winner: "A",
    method: "KO",
    endMs: 12_000,
    health: { A: 20, B: 0 },
    maxHealth: { A: 110, B: 100 },
  } as const;

  it("returns one line of at most 100 characters", async () => {
    const result = await writeRecapLine({
      a: GERALD.champion!,
      b: STEVE,
      outcome,
      events: [{ t: 11_000, kind: "hit", side: "A", move: 0, damage: 25, big: true }],
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel({ line: "Gerald ".repeat(30) }), generatingModel("error")),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line.length).toBeLessThanOrEqual(100);
    expect(result.calls).toHaveLength(1);
  });

  it("falls back to Sonnet on a refusal", async () => {
    const result = await writeRecapLine({
      a: GERALD.champion!,
      b: STEVE,
      outcome,
      events: [],
      keys: KEYS,
      deadline: null,
      languageModel: models(generatingModel("refuse"), generatingModel({ line: "Gerald won." })),
    });
    expect(result).toMatchObject({ ok: true, line: "Gerald won." });
    expect(result.calls.map((call) => call.task)).toEqual(["slopfight.recap", "slopfight.recapFallback"]);
  });
});
