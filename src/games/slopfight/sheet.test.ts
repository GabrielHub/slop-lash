import { describe, expect, test } from "vite-plus/test";
import { MOVE_TYPES, NEUTRAL_TRAITS } from "./vocab";
import {
  ChampionSchema,
  ForgeResultSchema,
  armCount,
  balanceChampion,
  bodyPlanLabel,
  championHash,
  championScale,
  cleanText,
  forgeResultProblems,
  legCount,
  maxHealth,
  parsePartialParts,
  rescaleToSum,
  stableStringify,
  validateChampion,
  type Champion,
  type Part,
} from "./sheet";

/** A complete, balanced example: what a good forge of "a raccoon lawyer with a briefcase" looks like. */
const LARRY: Champion = {
  bodyPlan: "BIPED",
  palette: { primary: "charcoal", secondary: "bone", accent: "cocoa" },
  parts: [
    { id: "torso", role: "torso", shape: "capsule", size: "M", elongation: "normal", parent: null, anchor: null, color: "primary", mirror: false },
    { id: "head", role: "head", shape: "sphere", size: "M", elongation: "normal", parent: "torso", anchor: "top", color: "primary", mirror: false },
    { id: "ear", role: "ear", shape: "cone", size: "S", elongation: "stubby", parent: "head", anchor: "left", color: "secondary", mirror: true },
    { id: "leg1", role: "leg", shape: "capsule", size: "M", elongation: "stubby", parent: "torso", anchor: "leg1", color: "primary", mirror: false },
    { id: "leg2", role: "leg", shape: "capsule", size: "M", elongation: "stubby", parent: "torso", anchor: "leg2", color: "primary", mirror: false },
    { id: "arm1", role: "arm", shape: "capsule", size: "S", elongation: "normal", parent: "torso", anchor: "arm1", color: "primary", mirror: false },
    { id: "arm2", role: "arm", shape: "capsule", size: "S", elongation: "normal", parent: "torso", anchor: "arm2", color: "primary", mirror: false },
    { id: "briefcase", role: "item", shape: "box", size: "M", elongation: "normal", parent: "arm2", anchor: "bottom", color: "accent", mirror: false },
    { id: "tail", role: "tail", shape: "capsule", size: "M", elongation: "long", parent: "torso", anchor: "back", color: "primary", mirror: false },
    { id: "tailTip", role: "tail", shape: "sphere", size: "S", elongation: "stubby", parent: "tail", anchor: "back", color: "secondary", mirror: false },
  ],
  face: { eyes: "beady", mouth: "smug" },
  item: "briefcase",
  stats: { heft: 3, reach: 2, chaos: 4 },
  moves: [
    { name: "Briefcase Bonk", type: "STRIKE", power: 4, delivery: "item" },
    { name: "Binding Arbitration", type: "GRAPPLE", power: 3, delivery: "arm" },
    { name: "Objection!", type: "TRICK", power: 2, delivery: "body" },
  ],
  traits: ["sneaky", "smug", "armed"],
  temperament: { aggression: 0.45, caution: 0.6, showboating: 0.8 },
  name: "Litigious Larry",
  bio: "A raccoon in a clip-on tie who sues everyone who beats him. He has never won a case.",
  narration: {
    walkOn: ["Larry is here, and he has paperwork.", "Larry has read the terms and conditions. All of them."],
    landHit: ["Sustained!", "That bonk was billable.", "Precedent has been set."],
    takeHit: ["Larry is writing that down.", "That's assault, technically."],
    win: ["Case closed. Invoice to follow.", "The court rules in favor of Larry."],
    lose: ["Larry will be appealing this.", "Mistrial! Mistrial!"],
    ringOut: ["Larry has left the jurisdiction.", "He's filing a complaint on the way down."],
  },
};

const clone = (champion: Champion): Champion => structuredClone(champion);
const part = (id: string, extra: Partial<Part> = {}): Part => ({
  id,
  role: "spike",
  shape: "cone",
  size: "S",
  elongation: "normal",
  parent: "torso",
  anchor: "back",
  color: "accent",
  mirror: false,
  ...extra,
});
const codes = (champion: Champion) => validateChampion(champion).map((problem) => problem.code);

describe("the example champion", () => {
  test("parses, validates and balances to itself", () => {
    expect(ChampionSchema.parse(LARRY)).toEqual(LARRY);
    expect(
      ForgeResultSchema.parse({ verdict: "FORGE", rejection: null, champion: LARRY }).champion,
    ).toEqual(LARRY);
    expect(validateChampion(LARRY)).toEqual([]);
    expect(balanceChampion(LARRY)).toEqual(LARRY);
  });

  test("derives arms, legs, health, scale and label", () => {
    expect(armCount(LARRY)).toBe(2);
    expect(legCount(LARRY)).toBe(2);
    expect(maxHealth(LARRY)).toBe(110);
    expect(championScale(LARRY)).toBe(1);
    expect(bodyPlanLabel(LARRY)).toBe("Biped");
  });

  test("keeps the parts before the name card (streaming order)", () => {
    const keys = Object.keys(ChampionSchema.shape);
    expect(keys.indexOf("parts")).toBeLessThan(keys.indexOf("name"));
    expect(keys).toEqual([
      "bodyPlan",
      "palette",
      "parts",
      "face",
      "item",
      "stats",
      "moves",
      "traits",
      "temperament",
      "name",
      "bio",
      "narration",
    ]);
  });
});

describe("rescaleToSum", () => {
  const triples: number[][] = [];
  for (let a = 1; a <= 5; a += 1)
    for (let b = 1; b <= 5; b += 1) for (let c = 1; c <= 5; c += 1) triples.push([a, b, c]);

  test("always lands on the sum within 1-5, keeping the inputs' order", () => {
    for (const triple of triples) {
      const out = rescaleToSum(triple, 9, 1, 5);
      expect(out.reduce((sum, value) => sum + value, 0)).toBe(9);
      for (const value of out) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
      }
      for (let i = 0; i < 3; i += 1)
        for (let j = 0; j < 3; j += 1)
          if (triple[i]! > triple[j]!) expect(out[i]).toBeGreaterThanOrEqual(out[j]!);
    }
  });

  test("leaves inputs that already fit alone, and is deterministic", () => {
    for (const triple of triples.filter((t) => t[0]! + t[1]! + t[2]! === 9)) {
      expect(rescaleToSum(triple, 9, 1, 5)).toEqual(triple);
    }
    for (const triple of triples) {
      expect(rescaleToSum(triple, 9, 1, 5)).toEqual(rescaleToSum(triple, 9, 1, 5));
    }
  });

  test("handles flat, lopsided and junk input", () => {
    expect(rescaleToSum([5, 5, 5], 9, 1, 5)).toEqual([3, 3, 3]);
    expect(rescaleToSum([1, 1, 1], 9, 1, 5)).toEqual([3, 3, 3]);
    expect(rescaleToSum([5, 1, 1], 9, 1, 5)).toEqual([5, 2, 2]);
    expect(rescaleToSum([5, 5, 1], 9, 1, 5)).toEqual([4, 4, 1]);
    expect(rescaleToSum([Number.NaN, 9, -3], 9, 1, 5)).toEqual([2, 5, 2]);
    expect(() => rescaleToSum([1, 1], 11, 1, 5)).toThrow();
  });
});

describe("balanceChampion", () => {
  test("rescales stats and move powers to their budgets", () => {
    const raw = clone(LARRY);
    raw.stats = { heft: 5, reach: 5, chaos: 5 };
    raw.moves = raw.moves.map((move) => ({ ...move, power: 5 as const }));
    const balanced = balanceChampion(raw);
    expect(balanced.stats).toEqual({ heft: 3, reach: 3, chaos: 3 });
    expect(balanced.moves.map((move) => move.power)).toEqual([3, 3, 3]);
  });

  test("forces at least two move types, switching the weakest move by its delivery", () => {
    const raw = clone(LARRY);
    raw.moves = [
      { name: "Jab", type: "STRIKE", power: 4, delivery: "arm" },
      { name: "Kick", type: "STRIKE", power: 3, delivery: "leg" },
      { name: "Headbutt", type: "STRIKE", power: 2, delivery: "head" },
    ];
    const moves = balanceChampion(raw).moves;
    expect(new Set(moves.map((move) => move.type)).size).toBeGreaterThanOrEqual(2);
    expect(moves[2]).toEqual({ name: "Headbutt", type: "TRICK", power: 2, delivery: "head" });

    raw.moves = raw.moves.map((move) => ({ ...move, type: "GRAPPLE" as const, power: 3 as const }));
    const tied = balanceChampion(raw).moves;
    expect(tied.map((move) => move.type)).toEqual(["GRAPPLE", "GRAPPLE", "STRIKE"]);
  });

  test("trims extra moves and pads missing ones with the missing types", () => {
    const raw = clone(LARRY);
    raw.moves = [...raw.moves, { name: "Fourth", type: "STRIKE", power: 5, delivery: "leg" }];
    expect(balanceChampion(raw).moves.map((move) => move.name)).toEqual([
      "Briefcase Bonk",
      "Binding Arbitration",
      "Objection!",
    ]);

    raw.moves = [{ name: "Only Move", type: "STRIKE", power: 5, delivery: "arm" }];
    const padded = balanceChampion(raw).moves;
    expect(padded).toHaveLength(3);
    expect(padded.map((move) => move.type)).toEqual(["STRIKE", ...MOVE_TYPES.slice(1)]);
    expect(padded.reduce((sum, move) => sum + move.power, 0)).toBe(9);
  });

  test("dedupes traits, drops conflicts, trims to four and pads to two", () => {
    const raw = clone(LARRY);
    raw.traits = ["tiny", "tiny", "huge", "smug", "loud", "heavy", "spiky"];
    expect(balanceChampion(raw).traits).toEqual(["tiny", "smug", "loud", "heavy"]);

    raw.traits = ["heavy"];
    const padded = balanceChampion(raw).traits;
    expect(padded).toHaveLength(2);
    expect(padded[0]).toBe("heavy");
    expect(NEUTRAL_TRAITS).toContain(padded[1]);

    raw.traits = [];
    expect(balanceChampion(raw).traits).toHaveLength(2);
  });

  test("clamps temperament and trims every string", () => {
    const raw = clone(LARRY);
    raw.temperament = { aggression: -0.5, caution: 1.7, showboating: 0.333333 };
    raw.name = "Sir Reginald Fluffington the Third of Upper Puddleby";
    raw.bio = "word ".repeat(60);
    raw.moves[0]!.name = "An Extremely Long Move Name That Goes On";
    raw.narration.landHit = ["x".repeat(90)];
    raw.narration.win = [];
    const balanced = balanceChampion(raw);
    expect(balanced.temperament).toEqual({ aggression: 0, caution: 1, showboating: 0.33 });
    expect(balanced.name.length).toBeLessThanOrEqual(24);
    expect(balanced.name).toBe("Sir Reginald Fluffington");
    expect(balanced.bio.length).toBeLessThanOrEqual(120);
    expect(balanced.moves[0]!.name.length).toBeLessThanOrEqual(28);
    expect(balanced.narration.landHit).toHaveLength(3);
    expect(balanced.narration.landHit.every((line) => line.length <= 60)).toBe(true);
    expect(balanced.narration.win).toHaveLength(2);
    expect(balanced.narration.win.every((line) => line.length > 0)).toBe(true);
  });

  test("is deterministic and idempotent on a messy sheet", () => {
    const raw = clone(LARRY);
    raw.stats = { heft: 5, reach: 1, chaos: 5 };
    raw.traits = ["cowardly", "relentless"];
    raw.parts = [part("spine", { parent: null }), ...raw.parts.slice(1), part("ghost", { parent: "nobody" })];
    const once = balanceChampion(raw);
    expect(balanceChampion(raw)).toEqual(once);
    expect(balanceChampion(once)).toEqual(once);
    expect(validateChampion(once)).toEqual([]);
  });

  test("always yields a valid, idempotent sheet within budget (property test)", () => {
    let state = 99;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const ids = ["torso", "body", "head", "leg1", "leg2", "arm", "tail", "x", "", " y "];
    const roles = ["torso", "torso", "head", "leg", "arm", "tail", "spike", "item"] as const;
    const anchors = [null, "top", "back", "leg1", "leg5", "arm2", "left"] as const;
    for (let round = 0; round < 400; round += 1) {
      const raw = clone(LARRY);
      raw.parts = Array.from({ length: Math.floor(random() * 50) }, () =>
        part(pick(ids), {
          role: pick(roles),
          parent: random() < 0.2 ? null : pick(ids),
          anchor: pick(anchors),
          mirror: random() < 0.5,
        }),
      );
      raw.stats = { heft: pick([1, 2, 3, 4, 5] as const), reach: pick([1, 5] as const), chaos: pick([1, 3, 5] as const) };
      raw.moves = Array.from({ length: Math.floor(random() * 6) }, () => ({
        name: pick(["Zap", "", "A Move With A Name Far Too Long To Fit"]),
        type: pick(MOVE_TYPES),
        power: pick([1, 2, 3, 4, 5] as const),
        delivery: pick(["arm", "leg", "head", "tail", "item", "body"] as const),
      }));
      raw.traits = Array.from({ length: Math.floor(random() * 7) }, () =>
        pick(["tiny", "huge", "smug", "smug", "heavy", "cowardly", "relentless", "loud"] as const),
      );

      const balanced = balanceChampion(raw);
      expect(validateChampion(balanced)).toEqual([]);
      expect(balanceChampion(balanced)).toEqual(balanced);
      expect(ChampionSchema.parse(balanced)).toEqual(balanced);
      expect(balanced.parts.length).toBeLessThanOrEqual(40);
      const { heft, reach, chaos } = balanced.stats;
      expect(heft + reach + chaos).toBe(9);
      expect(balanced.moves).toHaveLength(3);
      expect(balanced.moves.reduce((sum, move) => sum + move.power, 0)).toBe(9);
      expect(new Set(balanced.moves.map((move) => move.type)).size).toBeGreaterThanOrEqual(2);
      expect(balanced.moves.every((move) => move.name.length > 0 && move.name.length <= 28)).toBe(true);
      expect(new Set(balanced.traits).size).toBe(balanced.traits.length);
      expect(balanced.traits.length).toBeGreaterThanOrEqual(2);
      expect(balanced.traits.length).toBeLessThanOrEqual(4);
      expect(balanced.traits.includes("tiny") && balanced.traits.includes("huge")).toBe(false);
    }
  });

  test("sets a generic item when an item part has no tag", () => {
    const raw = clone(LARRY);
    raw.item = null;
    expect(balanceChampion(raw).item).toBe("thing");
  });
});

describe("balanceChampion parts", () => {
  const partsOf = (parts: Part[]) => balanceChampion({ ...clone(LARRY), parts }).parts;

  test("invents a torso when there is none and hangs orphans on it", () => {
    const parts = partsOf([
      part("head", { role: "head", parent: null, anchor: null }),
      part("leg", { role: "leg", parent: null, anchor: null }),
    ]);
    expect(parts.map((p) => [p.id, p.role, p.parent, p.anchor])).toEqual([
      ["torso", "torso", null, null],
      ["head", "head", "torso", "top"],
      ["leg", "leg", "torso", "leg1"],
    ]);
  });

  test("drops duplicate ids, unknown parents and cycles, and orders parents first", () => {
    const parts = partsOf([
      part("tip", { parent: "tail" }),
      part("torso", { role: "torso", parent: null, anchor: null }),
      part("tail", { role: "tail" }),
      part("tail", { role: "head" }),
      part("lost", { parent: "nowhere" }),
      part("a", { parent: "b" }),
      part("b", { parent: "a" }),
    ]);
    expect(parts.map((p) => p.id)).toEqual(["torso", "tail", "tip"]);
  });

  test("keeps one root torso and turns extra torsos into tail segments", () => {
    const parts = partsOf([
      part("body", { role: "torso", parent: null, anchor: null }),
      part("body2", { role: "torso", parent: "body", anchor: "back" }),
      part("body3", { role: "torso", parent: null, anchor: null }),
    ]);
    expect(parts.map((p) => [p.id, p.role, p.parent, p.anchor])).toEqual([
      ["body", "torso", null, null],
      ["body2", "tail", "body", "back"],
      ["body3", "tail", "body", "back"],
    ]);
  });

  test("fills missing anchors, unmirrors paired limbs, and caps at 40 parts", () => {
    const many = [
      part("torso", { role: "torso", parent: null, anchor: null, mirror: true }),
      part("arm", { role: "arm", anchor: null, mirror: true }),
      part("leg", { role: "leg", anchor: "leg3", mirror: true }),
      ...Array.from({ length: 50 }, (_, index) => part(`spike${index}`)),
    ];
    const parts = partsOf(many);
    expect(parts).toHaveLength(40);
    expect(parts[0]!.mirror).toBe(false);
    expect(parts[1]).toMatchObject({ id: "arm", anchor: "arm1", mirror: false });
    expect(parts[2]).toMatchObject({ id: "leg", anchor: "leg3", mirror: false });
  });

  test("cleans and clips ids, and parents follow the clipped id", () => {
    const parts = partsOf([
      part("torso", { role: "torso", parent: null, anchor: null }),
      part("  <b>left-front-leg-upper</b> ", { role: "leg", anchor: "leg1" }),
      part("foot", { parent: "left-front-leg-upper" }),
    ]);
    expect(parts.map((p) => p.id)).toEqual(["torso", "left-front-leg-u", "foot"]);
    expect(parts[2]!.parent).toBe("left-front-leg-u");
  });
});

describe("validateChampion", () => {
  const withParts = (parts: Part[]) => ({ ...clone(LARRY), parts });

  test("reports each structural problem", () => {
    expect(codes(withParts([part("head", { role: "head" })]))).toContain("no_torso");
    expect(
      codes(withParts([part("a", { role: "torso", parent: null, anchor: null }), part("b", { role: "torso", parent: null, anchor: null })])),
    ).toContain("multiple_torsos");
    expect(
      codes(withParts([part("torso", { role: "torso", parent: null, anchor: null }), ...Array.from({ length: 40 }, (_, i) => part(`s${i}`))])),
    ).toContain("too_many_parts");
    const root = part("torso", { role: "torso", parent: null, anchor: null });
    expect(codes(withParts([root, part("x"), part("x")]))).toContain("duplicate_id");
    expect(codes(withParts([root, part("  ")]))).toContain("empty_id");
    expect(codes(withParts([root, part("x", { parent: "ghost" })]))).toContain("unknown_parent");
    expect(codes(withParts([root, part("x", { parent: null })]))).toContain("missing_parent");
    expect(codes(withParts([root, part("x", { anchor: null })]))).toContain("missing_anchor");
    expect(codes(withParts([part("torso", { role: "torso", parent: "head", anchor: "top" }), part("head", { role: "head" })]))).toContain(
      "torso_has_parent",
    );
    expect(codes(withParts([root, part("a", { parent: "b" }), part("b", { parent: "a" })]))).toEqual(["cycle"]);
    expect(codes(withParts([root, part("a", { parent: "a" })]))).toEqual(["cycle"]);
    expect(codes({ ...clone(LARRY), moves: LARRY.moves.slice(0, 2) })).toEqual(["too_few_moves"]);
  });

  test("messages name the part so a repair prompt can quote them", () => {
    const [problem] = validateChampion(withParts([part("torso", { role: "torso", parent: null, anchor: null }), part("arm3", { parent: "torsoo" })]));
    expect(problem!.message).toBe('Part "arm3" names parent "torsoo", which is not a part id.');
  });

  test("checks verdict consistency on a forge result", () => {
    expect(forgeResultProblems({ verdict: "FORGE", rejection: null, champion: null })[0]!.code).toBe("missing_champion");
    expect(forgeResultProblems({ verdict: "REJECT", rejection: null, champion: null })[0]!.code).toBe("missing_rejection");
    expect(
      forgeResultProblems({ verdict: "REJECT", rejection: { reason: "A blank page.", suggestion: "Draw a creature." }, champion: null }),
    ).toEqual([]);
    expect(forgeResultProblems({ verdict: "FORGE", rejection: null, champion: LARRY })).toEqual([]);
  });
});

describe("parsePartialParts", () => {
  test("returns the longest complete prefix and grows as the stream does", () => {
    const [torso, head, ear] = LARRY.parts;
    const { mirror: _mirror, ...earWithoutMirror } = ear!;
    expect(parsePartialParts({ verdict: "FORGE", champion: { bodyPlan: "BIPED", parts: [torso, head, earWithoutMirror] } })).toEqual([
      torso,
      head,
    ]);
    expect(parsePartialParts({ champion: { parts: [torso, head, ear] } })).toEqual([torso, head, ear]);
    expect(parsePartialParts(LARRY)).toEqual(LARRY.parts);
    expect(parsePartialParts(LARRY.parts.slice(0, 4))).toEqual(LARRY.parts.slice(0, 4));
  });

  test("stops at a part whose parent has not arrived, and needs a torso first", () => {
    const [torso, head] = LARRY.parts;
    expect(parsePartialParts([torso, part("tip", { parent: "tail" }), head])).toEqual([torso]);
    expect(parsePartialParts([head, torso])).toEqual([]);
    expect(parsePartialParts([torso, part("x", { anchor: null })])).toEqual([torso]);
    expect(parsePartialParts([torso, torso])).toEqual([torso]);
  });

  test("tolerates garbage", () => {
    expect(parsePartialParts(undefined)).toEqual([]);
    expect(parsePartialParts(null)).toEqual([]);
    expect(parsePartialParts("parts")).toEqual([]);
    expect(parsePartialParts({ champion: null })).toEqual([]);
    expect(parsePartialParts({ champion: { parts: "nope" } })).toEqual([]);
    expect(parsePartialParts([{ id: "torso", role: "torso" }])).toEqual([]);
  });

  test("normalizes parts the same way the final sheet will", () => {
    const parts = parsePartialParts([
      { ...LARRY.parts[0]!, mirror: true },
      { ...LARRY.parts[3]!, mirror: true },
    ]);
    expect(parts.map((p) => p.mirror)).toEqual([false, false]);
    expect(balanceChampion({ ...clone(LARRY), parts: parts }).parts).toEqual(parts);
  });
});

describe("championHash", () => {
  test("is stable under key order and changes with content", () => {
    const reordered = Object.fromEntries(Object.entries(clone(LARRY)).reverse()) as Champion;
    reordered.stats = { chaos: 4, heft: 3, reach: 2 };
    expect(stableStringify(reordered)).toBe(stableStringify(LARRY));
    expect(championHash(reordered)).toBe(championHash(LARRY));
    expect(championHash(LARRY)).toMatch(/^[0-9a-f]{8}$/u);
    expect(championHash({ ...clone(LARRY), name: "Litigious Barry" })).not.toBe(championHash(LARRY));
  });

  test("stableStringify sorts nested keys and keeps array order", () => {
    expect(stableStringify({ b: [{ z: 1, a: 2 }], a: null, c: undefined })).toBe('{"a":null,"b":[{"a":2,"z":1}]}');
  });
});

describe("derived values", () => {
  test("arm counts snap to 0, 2 or 4 and count mirrors twice", () => {
    const torso = part("torso", { role: "torso", parent: null, anchor: null });
    const arms = (...extra: Part[]) => armCount({ ...clone(LARRY), parts: [torso, ...extra] });
    expect(arms()).toBe(0);
    expect(arms(part("a", { role: "arm", anchor: "arm1" }))).toBe(2);
    expect(arms(part("a", { role: "arm", anchor: "left", mirror: true }))).toBe(2);
    expect(arms(part("a", { role: "arm", anchor: "left", mirror: true }), part("b", { role: "arm", anchor: "arm3" }))).toBe(4);
    expect(arms(part("a", { role: "arm", anchor: "arm1" }), part("fore", { role: "arm", parent: "a" }))).toBe(2);
  });

  test("six- and eight-legged multipeds get their own label", () => {
    const torso = part("torso", { role: "torso", parent: null, anchor: null });
    const legs = (count: number) => Array.from({ length: count }, (_, i) => part(`leg${i + 1}`, { role: "leg", anchor: `leg${i + 1}` as Part["anchor"] }));
    expect(bodyPlanLabel({ ...clone(LARRY), bodyPlan: "MULTIPED", parts: [torso, ...legs(6)] })).toBe("Hexapod");
    expect(bodyPlanLabel({ ...clone(LARRY), bodyPlan: "MULTIPED", parts: [torso, ...legs(8)] })).toBe("Octopod");
    expect(bodyPlanLabel({ ...clone(LARRY), bodyPlan: "HOPPER" })).toBe("Hopper");
  });

  test("health and scale follow heft and the size traits", () => {
    const heavy = { ...clone(LARRY), stats: { heft: 5 as const, reach: 2 as const, chaos: 2 as const } };
    expect(maxHealth(heavy)).toBe(130);
    expect(championScale(heavy)).toBe(1.16);
    expect(championScale({ ...heavy, traits: ["huge", "loud"] })).toBe(1.508);
    expect(championScale({ ...clone(LARRY), traits: ["tiny", "loud"] })).toBe(0.72);
  });
});

describe("cleanText", () => {
  test("strips tags and line breaks, cuts at a word, never leaves half an emoji", () => {
    expect(cleanText("  <i>Big</i>\nGuy  ", 24)).toBe("Big Guy");
    expect(cleanText("Sir Reginald Fluffington III", 24)).toBe("Sir Reginald Fluffington");
    expect(cleanText(`${"a".repeat(23)}😀`, 24)).toBe("a".repeat(23));
  });
});
