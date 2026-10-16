// Dev-lab finish recipes: put finishes on a sample's parts from a short
// string, so every finish can be looked at side by side.
//
//   "gold"                     every part gold
//   "arm:metal"                the arms metal (roles, a trailing "s" allowed)
//   "torso:crystal,head:gold"  several, later entries win
//   "sword:gold"               a part by id ("item:gold" for any held item)

import { sampleById, type Sample } from "../../samples";
import type { Champion, Part } from "../../sheet";
import { FINISHES, type Finish } from "../../vocab";

const isFinish = (value: string): value is Finish => (FINISHES as readonly string[]).includes(value);

/** The finish a recipe gives `part`, or null when the recipe leaves it alone. */
function recipeFinish(part: Part, entries: Array<[key: string, finish: Finish]>): Finish | null {
  let out: Finish | null = null;
  for (const [key, finish] of entries) {
    if (key === "all" || key === part.id || key === part.role || key === `${part.role}s`) out = finish;
  }
  return out;
}

/** `champion` with the recipe's finishes on its parts (vinyl drops the field). */
export function applyFinishRecipe(champion: Champion, recipe: string): Champion {
  const entries: Array<[string, Finish]> = [];
  for (const raw of recipe.split(",")) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const [key, value] = entry.includes(":") ? (entry.split(":") as [string, string]) : ["all", entry];
    if (isFinish(value)) entries.push([key, value]);
  }
  if (entries.length === 0) return champion;
  return {
    ...champion,
    parts: champion.parts.map((part) => {
      const finish = recipeFinish(part, entries);
      if (finish === null) return part;
      const { finish: _old, ...rest } = part;
      return finish === "vinyl" ? rest : { ...rest, finish };
    }),
  };
}

/** A lab entry: a sample with a recipe on it. */
export interface FinishVariant {
  id: string;
  title: string;
  sample: Sample;
  champion: Champion;
}

function variant(sampleId: string, recipe: string, title?: string): FinishVariant | null {
  const sample = sampleById(sampleId);
  if (!sample) return null;
  return { id: `${sampleId}:${recipe}`, title: title ?? `${sampleId} ${recipe}`, sample, champion: applyFinishRecipe(sample.champion, recipe) };
}

/** Every finish on one sample, vinyl first. */
export function everyFinish(sampleId: string): FinishVariant[] {
  return FINISHES.map((finish) => variant(sampleId, finish, finish)).filter((v): v is FinishVariant => v !== null);
}

/** Mixed bodies: one finish on some parts (the way a forge hands them out). */
export const MIXED_RECIPES: ReadonlyArray<[sampleId: string, recipe: string, title: string]> = [
  ["robot", "arm:metal", "metal arms"],
  ["raccoon-lawyer", "torso:crystal", "crystal body"],
  ["dragon", "gold", "gold everything"],
  ["stick-figure", "item:gold", "golden sword"],
  ["frog", "torso:slime,head:slime", "slime body"],
  ["crab", "arm:stone,leg:stone", "stone claws"],
  ["cat", "tail:lava,arm:lava", "lava tail and arms"],
  ["penguin", "torso:ice", "ice body"],
  ["corgi", "torso:wood,head:wood", "wooden dog"],
  ["ghost", "glow", "glow everything"],
];

export function mixedFinishes(): FinishVariant[] {
  return MIXED_RECIPES.map(([id, recipe, title]) => variant(id, recipe, title)).filter((v): v is FinishVariant => v !== null);
}

/** Four fighters with heavy finishes, for frame-time checks. */
export function finishedFour(): FinishVariant[] {
  return (
    [
      ["robot", "metal", "metal robot"],
      ["raccoon-lawyer", "crystal", "crystal raccoon"],
      ["dragon", "lava", "lava dragon"],
      ["slime", "glow", "glow slime"],
    ] as const
  )
    .map(([id, recipe, title]) => variant(id, recipe, title))
    .filter((v): v is FinishVariant => v !== null);
}

/**
 * The lab's finish set from the query: "all" (every finish on `sample`),
 * "mix" (the mixed bodies), "four" (four heavy finishes), or a recipe applied
 * to `sample`.
 */
export function finishSet(set: string | null, sampleId: string | null): FinishVariant[] {
  const id = sampleId ?? "robot";
  if (!set || set === "all") return everyFinish(id);
  if (set === "mix") return mixedFinishes();
  if (set === "four") return finishedFour();
  const one = variant(id, set);
  return one ? [one] : everyFinish(id);
}
