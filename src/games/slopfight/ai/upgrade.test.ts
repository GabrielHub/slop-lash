import { describe, expect, it } from "vite-plus/test";
import { balanceChampion, legCount, type Champion, type Part } from "../sheet";
import { planForLegs } from "./body-plan";
import { FINISH_INFO, FINISHES } from "../vocab";
import { namesMaterial, preserveUpgrade, preserveUpgradePartial } from "./upgrade";

type Spec = `${Part["role"]} ${Part["shape"]} ${Part["size"]} ${Part["elongation"]}`;

function part(id: string, spec: Spec, on: string | null, color: Part["color"], mirror = false): Part {
  const [role, shape, size, elongation] = spec.split(" ") as [Part["role"], Part["shape"], Part["size"], Part["elongation"]];
  const [parent, anchor] = on ? (on.split(".") as [string, Part["anchor"]]) : [null, null];
  return { id, role, shape, size, elongation, parent, anchor, color, mirror };
}

function sheet(overrides: Partial<Champion> & Pick<Champion, "palette" | "parts">): Champion {
  return balanceChampion({
    bodyPlan: "QUADRUPED",
    markings: [],
    face: { eyes: "round", mouth: "smile" },
    item: null,
    stats: { heft: 3, reach: 3, chaos: 3 },
    moves: [
      { name: "Swipe", type: "STRIKE", power: 3, delivery: "leg" },
      { name: "Pounce", type: "GRAPPLE", power: 3, delivery: "body" },
      { name: "Feint", type: "TRICK", power: 3, delivery: "body" },
    ],
    traits: ["sneaky", "nimble"],
    temperament: { aggression: 0.5, caution: 0.5, showboating: 0.5 },
    name: "Test Subject",
    bio: "A champion for tests.",
    narration: {
      walkOn: ["In it comes.", "Here again."],
      landHit: ["Hit!", "Got one!", "Ouch!"],
      takeHit: ["Oof.", "Ow."],
      win: ["It wins.", "Victory."],
      lose: ["It loses.", "Down."],
      ringOut: ["Gone!", "Out!"],
    },
    ...overrides,
  });
}

/** A masked, card-carrying bandit on all fours: every slot in use. */
const BANDIT = sheet({
  palette: { primary: "charcoal", secondary: "bone", accent: "moss" },
  parts: [
    part("torso", "torso capsule L normal", null, "primary"),
    part("head", "head sphere M normal", "torso.front", "primary"),
    part("ear", "ear cone M normal", "head.left", "primary", true),
    part("visor", "fin sphere L stubby", "head.top", "accent"),
    part("leg1", "leg capsule M normal", "torso.leg1", "primary"),
    part("leg2", "leg capsule M normal", "torso.leg2", "primary"),
    part("leg3", "leg capsule M normal", "torso.leg3", "primary"),
    part("leg4", "leg capsule M normal", "torso.leg4", "primary"),
    part("tail", "tail capsule M long", "torso.back", "secondary"),
    part("cards", "item box M normal", "head.bottom", "accent"),
  ],
  markings: [
    { part: "tail", kind: "stripes", color: "primary" },
    { part: "head", kind: "mask", color: "secondary" },
  ],
  face: { eyes: "beady", mouth: "smug" },
  item: "thing",
});

/** A pale line-drawn cat whose palette accent no part or marking uses. */
const LINE_CAT = sheet({
  palette: { primary: "bone", secondary: "charcoal", accent: "tomato" },
  parts: [
    part("torso", "torso capsule M long", null, "primary"),
    part("head", "head sphere M normal", "torso.front", "primary"),
    part("ear", "ear cone M normal", "head.top", "secondary", true),
    part("leg1", "leg capsule S long", "torso.leg1", "secondary"),
    part("leg2", "leg capsule S long", "torso.leg2", "secondary"),
    part("leg3", "leg capsule S long", "torso.leg3", "secondary"),
    part("leg4", "leg capsule S long", "torso.leg4", "secondary"),
    part("tail", "tail capsule S long", "torso.back", "secondary"),
  ],
});

/** What a model might send back: the base with edits, as the forge's raw champion. */
function edit(base: Champion, change: (champion: Champion) => Partial<Champion>): Champion {
  return { ...base, ...change(base) };
}

const withPack = (base: Champion, color: Part["color"] = "accent") => [
  ...base.parts,
  part("pack", "fin box L normal", "torso.top", color),
];

describe("material words", () => {
  it("open finishes for every material the forge prompt names", () => {
    // Things usually made of a finish, not words for one: they add a part, not a material.
    const objects = new Set(["puppets", "peg legs"]);
    for (const finish of FINISHES.filter((name) => name !== "vinyl")) {
      const named = FINISH_INFO[finish].prompt.replace(/^[^:]*:/u, "").replace(/\.$/u, "").split(",");
      for (const phrase of named.map((part) => part.trim()).filter((part) => !objects.has(part))) {
        expect([finish, phrase, namesMaterial(phrase)]).toEqual([finish, phrase, true]);
      }
    }
  });
});

describe("preserveUpgrade", () => {
  it("reverts palette drift when the addition names no colour", () => {
    const next = edit(BANDIT, (base) => ({
      palette: { primary: "cocoa", secondary: "bone", accent: "tangerine" },
      parts: withPack(base),
    }));
    const kept = preserveUpgrade(BANDIT, next, "a jetpack");
    expect(kept.palette).toEqual(BANDIT.palette);
    expect(kept.parts.find((p) => p.id === "pack")).toMatchObject({ color: "accent" });
  });

  it("lets a slot no part or marking uses be recoloured for the addition", () => {
    const next = edit(LINE_CAT, (base) => ({
      palette: { primary: "sand", secondary: "charcoal", accent: "grape" },
      parts: [
        ...base.parts,
        part("brim", "fin sphere L stubby", "head.top", "accent"),
        part("crown", "fin box M normal", "brim.top", "accent"),
      ],
    }));
    const kept = preserveUpgrade(LINE_CAT, next, "");
    expect(kept.palette).toEqual({ primary: "bone", secondary: "charcoal", accent: "grape" });
  });

  it("accepts the model's whole palette when the addition names a colour", () => {
    const next = edit(BANDIT, (base) => ({
      palette: { primary: "cobalt", secondary: "bone", accent: "butter" },
      parts: withPack(base),
    }));
    expect(preserveUpgrade(BANDIT, next, "paint it blue").palette).toEqual(next.palette);
    expect(preserveUpgrade(BANDIT, next, "a golden crown").palette).toEqual(next.palette);
    expect(preserveUpgrade(BANDIT, next, "a crown").palette).toEqual(BANDIT.palette);
  });

  it("restores every base part unless the addition names its role or id", () => {
    const next = edit(BANDIT, (base) => ({
      parts: base.parts.map((p) =>
        p.role === "leg"
          ? { ...p, elongation: "long" as const, color: "secondary" as const }
          : p.id === "ear"
            ? { ...p, size: "L" as const, anchor: "top" as const }
            : p.id === "visor"
              ? { ...p, color: "secondary" as const }
              : p,
      ),
    }));
    const plain = preserveUpgrade(BANDIT, next, "a jetpack");
    expect(plain.parts).toEqual(BANDIT.parts);
    const legs = preserveUpgrade(BANDIT, next, "much longer legs");
    expect(legs.parts.filter((p) => p.role === "leg").every((p) => p.elongation === "long")).toBe(true);
    expect(legs.parts.find((p) => p.id === "ear")).toEqual(BANDIT.parts.find((p) => p.id === "ear"));
    const visor = preserveUpgrade(BANDIT, next, "a shinier visor");
    expect(visor.parts.find((p) => p.id === "visor")!.color).toBe("secondary");
  });

  it("brings back dropped parts under their parent unless something is removed", () => {
    const next = edit(BANDIT, (base) => ({
      parts: withPack(base).filter((p) => p.id !== "tail" && p.id !== "ear"),
    }));
    const kept = preserveUpgrade(BANDIT, next, "a jetpack");
    expect(kept.parts.map((p) => p.id)).toEqual([
      "torso",
      "head",
      "visor",
      "leg1",
      "leg2",
      "leg3",
      "leg4",
      "cards",
      "ear",
      "pack",
      "tail",
    ]);
    expect(kept.markings).toEqual(BANDIT.markings);
    const lost = preserveUpgrade(BANDIT, next, "it lost its tail in a card game");
    expect(lost.parts.some((p) => p.id === "tail")).toBe(false);
  });

  it("restores the markings and keeps new ones on new parts", () => {
    const next = edit(BANDIT, (base) => ({
      parts: withPack(base, "secondary"),
      markings: [
        { part: "tail", kind: "spots", color: "secondary" },
        { part: "pack", kind: "panel", color: "accent" },
        { part: "torso", kind: "streak", color: "secondary" },
      ],
    }));
    const kept = preserveUpgrade(BANDIT, next, "a jetpack");
    expect(kept.markings).toEqual([
      ...BANDIT.markings!,
      { part: "pack", kind: "panel", color: "accent" },
      { part: "torso", kind: "streak", color: "secondary" },
    ]);
  });

  it("restores the face unless the addition mentions it", () => {
    const next = edit(BANDIT, () => ({ face: { eyes: "visor", mouth: "fangs" } }));
    expect(preserveUpgrade(BANDIT, next, "a jetpack").face).toEqual(BANDIT.face);
    expect(preserveUpgrade(BANDIT, next, "laser goggles").face).toEqual({ eyes: "visor", mouth: "smug" });
    expect(preserveUpgrade(BANDIT, next, "vampire teeth").face).toEqual({ eyes: "beady", mouth: "fangs" });
  });

  it("is idempotent and returns a balanced sheet with the plan its legs imply", () => {
    const cases: [Champion, Champion, string][] = [
      [BANDIT, edit(BANDIT, (base) => ({ palette: { ...base.palette, primary: "rust" }, parts: withPack(base) })), "a jetpack"],
      [LINE_CAT, edit(LINE_CAT, (base) => ({ palette: { ...base.palette, accent: "grape" }, parts: base.parts.slice(0, 4) })), ""],
      [BANDIT, edit(BANDIT, (base) => ({ bodyPlan: "FLIER", parts: [...base.parts, part("wing", "wing capsule L long", "torso.left", "accent", true)] })), "giant wings"],
      [BANDIT, edit(BANDIT, (base) => ({ parts: base.parts.filter((p) => p.role !== "leg"), stats: { heft: 5, reach: 5, chaos: 5 } })), "lost all its legs"],
    ];
    for (const [previous, next, text] of cases) {
      const kept = preserveUpgrade(previous, next, text);
      expect(preserveUpgrade(previous, kept, text)).toEqual(kept);
      expect(balanceChampion(kept)).toEqual(kept);
      expect(kept.bodyPlan).toBe(planForLegs(kept.bodyPlan, legCount(kept)));
    }
    const legless = preserveUpgrade(cases[3]![0], cases[3]![1], cases[3]![2]);
    expect(legless.bodyPlan).toBe("HOPPER");
    expect(legless.stats).toEqual({ heft: 3, reach: 3, chaos: 3 });
  });

  it("changes finishes only where the addition says what something is made of", () => {
    const finishOf = (champion: Champion, id: string) => champion.parts.find((p) => p.id === id)!.finish ?? "vinyl";
    const metalArms = edit(LINE_CAT, (base) => ({
      parts: [
        ...base.parts.map((p) => (p.role === "leg" ? { ...p, finish: "metal" as const } : p)),
        part("jet", "fin box L normal", "torso.top", "secondary"),
      ].map((p) => (p.id === "torso" ? { ...p, finish: "crystal" as const } : p)),
    }));
    // A material word with a part named: only that part changes.
    const legs = preserveUpgrade(LINE_CAT, metalArms, "make its legs metal");
    expect(legs.parts.filter((p) => p.role === "leg").every((p) => p.finish === "metal")).toBe(true);
    expect(finishOf(legs, "torso")).toBe("vinyl");
    // No material word: drift on existing parts reverts, the new part keeps its finish.
    const jet = preserveUpgrade(LINE_CAT, { ...metalArms, parts: metalArms.parts.map((p) => (p.id === "jet" ? { ...p, finish: "glow" as const } : p)) }, "a jetpack");
    expect(jet.parts.filter((p) => p.id !== "jet").every((p) => p.finish === undefined)).toBe(true);
    expect(finishOf(jet, "jet")).toBe("glow");
    // A material word and no part named: every part may change.
    const gold = edit(LINE_CAT, (base) => ({ parts: base.parts.map((p) => ({ ...p, finish: "gold" as const })) }));
    expect(preserveUpgrade(LINE_CAT, gold, "turn it to solid gold").parts.every((p) => p.finish === "gold")).toBe(true);
    // A part named without a material word keeps its finish even when the model drops it.
    const plated = preserveUpgrade(LINE_CAT, metalArms, "make its legs metal");
    const longer = edit(plated, (base) => ({
      parts: base.parts.map((p) => (p.role === "leg" ? { ...p, elongation: "normal" as const, finish: undefined } : p)),
    }));
    const kept = preserveUpgrade(plated, longer, "shorter legs");
    expect(kept.parts.filter((p) => p.role === "leg").every((p) => p.finish === "metal" && p.elongation === "normal")).toBe(true);
    expect(preserveUpgrade(plated, plated, "shorter legs")).toEqual(plated);
  });

  it("lets a drawing's material ink give existing parts that finish, and only that one", () => {
    const next = edit(LINE_CAT, (base) => ({
      parts: base.parts.map((p) => ({ ...p, finish: p.role === "leg" ? ("gold" as const) : ("lava" as const) })),
    }));
    const painted = preserveUpgrade(LINE_CAT, next, "", ["gold"]);
    expect(painted.parts.map((p) => [p.id, p.finish ?? "vinyl"])).toEqual(
      LINE_CAT.parts.map((p) => [p.id, p.role === "leg" ? "gold" : "vinyl"]),
    );
    // Without the ink the drawing changes no finish.
    expect(preserveUpgrade(LINE_CAT, next, "").parts.every((p) => p.finish === undefined)).toBe(true);
    const partial = { verdict: "FORGE", champion: { bodyPlan: "QUADRUPED", palette: next.palette, parts: next.parts } };
    const shown = preserveUpgradePartial(LINE_CAT, partial, "", ["gold"]) as {
      champion: { parts: { id: string; finish?: string }[] };
    };
    expect(shown.champion.parts.map((p) => [p.id, p.finish])).toEqual(
      LINE_CAT.parts.map((p) => [p.id, p.role === "leg" ? "gold" : "vinyl"]),
    );
  });

  it("gives streamed partials the base parts' finishes unless the addition changes them", () => {
    const plated = edit(LINE_CAT, (base) => ({
      parts: base.parts.map((p) => (p.id === "tail" ? { ...p, finish: "metal" as const } : p)),
    }));
    const next = edit(plated, (base) => ({
      parts: base.parts.map((p) => ({ ...p, finish: p.id === "tail" ? ("vinyl" as const) : ("crystal" as const) })),
    }));
    const partial = { verdict: "FORGE", champion: { bodyPlan: "QUADRUPED", palette: next.palette, parts: next.parts } };
    const shown = (text: string) =>
      (preserveUpgradePartial(plated, partial, text) as { champion: { parts: { id: string; finish?: string }[] } }).champion.parts;
    expect(shown("a jetpack").map((p) => [p.id, p.finish])).toEqual(
      plated.parts.map((p) => [p.id, p.finish ?? "vinyl"]),
    );
    expect(shown("a crystal head").find((p) => p.id === "head")!.finish).toBe("crystal");
    expect(shown("a crystal head").find((p) => p.id === "tail")!.finish).toBe("metal");
    expect(shown("make it all crystal").find((p) => p.id === "torso")!.finish).toBe("crystal");
  });

  it("gives streamed partials the palette and base-part colours of the final sheet", () => {
    const next = edit(BANDIT, (base) => ({
      palette: { primary: "cocoa", secondary: "sand", accent: "tangerine" },
      parts: withPack(base).map((p) => (p.id === "tail" ? { ...p, color: "primary" as const } : p)),
    }));
    const final = preserveUpgrade(BANDIT, next, "a jetpack");
    const stream = [
      { verdict: "FORGE" },
      { verdict: "FORGE", champion: { bodyPlan: "QUADRUPED", palette: { primary: "cocoa" } } },
      { verdict: "FORGE", champion: { bodyPlan: "QUADRUPED", palette: next.palette, parts: next.parts.slice(0, 3) } },
      {
        verdict: "FORGE",
        champion: {
          bodyPlan: "QUADRUPED",
          palette: next.palette,
          parts: [...next.parts.slice(0, 9), { id: "tail", role: "tail", color: "primary" }],
        },
      },
      { verdict: "FORGE", champion: { bodyPlan: "QUADRUPED", palette: next.palette, parts: next.parts } },
    ];
    for (const partial of stream) {
      const shown = preserveUpgradePartial(BANDIT, partial, "a jetpack") as {
        champion?: { palette?: Record<string, string>; parts?: { id?: string; color?: string; mirror?: boolean }[] };
      };
      for (const [slot, color] of Object.entries(shown.champion?.palette ?? {})) {
        expect([slot, color]).toEqual([slot, final.palette[slot as keyof typeof final.palette]]);
      }
      for (const streamed of shown.champion?.parts ?? []) {
        if (typeof streamed.mirror !== "boolean") continue;
        expect([streamed.id, streamed.color]).toEqual([streamed.id, final.parts.find((p) => p.id === streamed.id)!.color]);
      }
    }
    expect(preserveUpgradePartial(BANDIT, null, "")).toBeNull();
    expect(preserveUpgradePartial(BANDIT, { verdict: "REJECT", champion: null }, "")).toEqual({
      verdict: "REJECT",
      champion: null,
    });
  });
});
