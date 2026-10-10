import { describe, expect, test } from "vite-plus/test";
import { SAMPLES, sampleById } from "./samples";
import { BODY_PLANS } from "./vocab";
import { ChampionSchema, balanceChampion, legCount, validateChampion } from "./sheet";

describe("sample champions", () => {
  test("there are about thirty, with unique ids and inputs", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(28);
    expect(new Set(SAMPLES.map((entry) => entry.id)).size).toBe(SAMPLES.length);
    for (const entry of SAMPLES) expect(entry.input.length).toBeGreaterThan(0);
  });

  test.each(SAMPLES.map((entry) => [entry.id, entry] as const))(
    "%s parses, validates and is already balanced",
    (_id, entry) => {
      expect(ChampionSchema.parse(entry.champion)).toEqual(entry.champion);
      expect(validateChampion(entry.champion)).toEqual([]);
      expect(balanceChampion(entry.champion)).toEqual(entry.champion);
    },
  );

  test("covers every body plan and the odd anatomy the resolver must handle", () => {
    const plans = new Set(SAMPLES.map((entry) => entry.champion.bodyPlan));
    for (const plan of BODY_PLANS) expect(plans.has(plan)).toBe(true);
    const legs = (id: string) => legCount(sampleById(id)!.champion);
    expect(legs("stool-creature")).toBe(3);
    expect(legs("spider")).toBe(8);
    expect(legs("crab")).toBe(6);
    expect(sampleById("slime")!.champion.parts.some((part) => part.role === "head")).toBe(false);
    expect(sampleById("giraffe")!.champion.parts.filter((part) => part.role === "head").length).toBe(3);
  });

  test("a few samples carry markings for the renderer to paint", () => {
    const kinds = (id: string) =>
      sampleById(id)!.champion.markings?.map((marking) => `${marking.part}:${marking.kind}`);
    for (const id of ["raccoon-lawyer", "raccoon-jetpack"]) {
      expect(kinds(id)).toEqual(["head:mask", "tail:stripes"]);
    }
    expect(kinds("penguin")).toEqual(["body:belly"]);
    expect(kinds("robot")).toEqual(["chassis:panel"]);
    expect(kinds("potato-googly")).toEqual(["spud:spots"]);
    expect(kinds("corgi")).toEqual(["head:belly"]);
    expect(kinds("spider")).toBeUndefined();
    // The clothing kinds: a jacketed biped with a head, a quadruped striped nose to tail.
    expect(kinds("frog-suit")).toEqual(["torso:suit"]);
    expect(kinds("skunk")).toEqual(["head:streak", "torso:streak", "tail:streak"]);
    const frog = sampleById("frog-suit")!.champion;
    expect(frog.bodyPlan).toBe("BIPED");
    expect(frog.parts.some((part) => part.role === "head")).toBe(true);
    const skunk = sampleById("skunk")!.champion;
    expect(skunk.bodyPlan).toBe("QUADRUPED");
    expect(skunk.parts.some((part) => part.role === "tail" && part.parent === "torso")).toBe(true);
  });
});
