// Finishes: what each part is made of, and what that does in a fight. A finish
// is local to its part: a finished limb changes the hits it delivers (damage,
// knockback) and how fast its strikes swing, a finished part changes the hits
// that land on it, and the body's share of each finish changes its speed
// (resolveModifiers folds that in). Each finish trades something for something,
// like a trait, so prose never buys power. Words live in vocab.ts
// (FINISH_INFO), the look in stage3d/creature. Pure and deterministic.

import type { Champion, Part } from "./sheet";
import { FINISH_INFO, FINISHES, type Finish, type PartRole, type PartSize } from "./vocab";

export interface FinishEffect {
  /** Hits this part delivers: damage multiplier. */
  hitDamage: number;
  /** Hits this part delivers: knockback multiplier. */
  hitKnockback: number;
  /** Windup multiplier of Strikes this part delivers (heavy swings slower). */
  swing: number;
  /** Hits that land on this part: damage multiplier. */
  guardDamage: number;
  /** Hits that land on this part: knockback multiplier. */
  guardKnockback: number;
  /** Speed change in percent for a body made entirely of it (scaled by coverage). */
  weight: number;
}

const NEUTRAL: FinishEffect = {
  hitDamage: 1,
  hitKnockback: 1,
  swing: 1,
  guardDamage: 1,
  guardKnockback: 1,
  weight: 0,
};

/**
 * Keep in step with FINISH_INFO's card lines. Tuned with
 * scripts/slopfight/tune-finishes.ts: each finish, on the whole body, the arms
 * only or the torso only, wins 42-58% against its own vinyl original.
 */
export const FINISH_EFFECTS: Readonly<Record<Finish, FinishEffect>> = {
  vinyl: NEUTRAL,
  metal: { hitDamage: 1.08, hitKnockback: 1.15, swing: 1.15, guardDamage: 0.94, guardKnockback: 1, weight: -18 },
  gold: { hitDamage: 1.1, hitKnockback: 1.08, swing: 1.2, guardDamage: 0.95, guardKnockback: 0.9, weight: -20 },
  crystal: { hitDamage: 1.1, hitKnockback: 0.92, swing: 1.05, guardDamage: 0.94, guardKnockback: 1.25, weight: -4 },
  stone: { hitDamage: 1.05, hitKnockback: 1.2, swing: 1.25, guardDamage: 0.92, guardKnockback: 0.88, weight: -22 },
  wood: { hitDamage: 1.04, hitKnockback: 1.1, swing: 1.08, guardDamage: 0.97, guardKnockback: 0.96, weight: -12 },
  ice: { hitDamage: 0.92, hitKnockback: 1.2, swing: 0.94, guardDamage: 0.95, guardKnockback: 1.25, weight: 0 },
  lava: { hitDamage: 1.15, hitKnockback: 1, swing: 1, guardDamage: 1.12, guardKnockback: 1, weight: -4 },
  slime: { hitDamage: 0.95, hitKnockback: 0.8, swing: 0.95, guardDamage: 0.9, guardKnockback: 0.75, weight: -6 },
  glow: { hitDamage: 1, hitKnockback: 1, swing: 0.9, guardDamage: 1.1, guardKnockback: 1.08, weight: 8 },
};

export const partFinish = (part: Pick<Part, "finish">): Finish => part.finish ?? "vinyl";

export const isFinished = (champion: Pick<Champion, "parts">): boolean =>
  champion.parts.some((part) => partFinish(part) !== "vinyl");

const SIZE_WEIGHT: Record<PartSize, number> = { S: 0.4, M: 1, L: 1.8, XL: 3 };
const ROLE_WEIGHT: Partial<Record<PartRole, number>> = { torso: 2.5, head: 1.5 };

/** A part's share of the body's bulk: size, role (the torso is most of a fighter) and its mirror. */
export function partBulk(part: Pick<Part, "role" | "size" | "mirror">): number {
  return SIZE_WEIGHT[part.size] * (ROLE_WEIGHT[part.role] ?? 1) * (part.mirror ? 2 : 1);
}

/** Each finish's share of the body's bulk, 0..1; the shares sum to 1. */
export function finishCoverage(champion: Pick<Champion, "parts">): Record<Finish, number> {
  const coverage = Object.fromEntries(FINISHES.map((finish) => [finish, 0])) as Record<Finish, number>;
  let total = 0;
  for (const part of champion.parts) {
    const bulk = partBulk(part);
    coverage[partFinish(part)] += bulk;
    total += bulk;
  }
  if (total <= 0) return { ...coverage, vinyl: 1 };
  for (const finish of FINISHES) coverage[finish] /= total;
  return coverage;
}

/** The speed change (percent) the body's finishes add up to; 0 for an all-vinyl champion. */
export function finishSpeed(champion: Pick<Champion, "parts">): number {
  const coverage = finishCoverage(champion);
  let speed = 0;
  for (const finish of FINISHES) speed += FINISH_EFFECTS[finish].weight * coverage[finish];
  return Math.round(speed * 10) / 10;
}

/**
 * A finish's net advantage over vinyl for a body made entirely of it (a tuning
 * aid and a test bound), with 1 point per percent of damage like traitScore:
 * offence, defence and the speed it costs. The other levers are weighed by
 * what they measured worth against damage in one-lever runs of
 * tune-finishes.ts (2026-10-16, 1536 twin fights each, about 0.6 win-rate
 * points per percent of damage): knockback is worth far less than damage,
 * a percent of swing about a third of one, a percent of speed about 0.8.
 */
export function finishScore(finish: Finish): number {
  const e = FINISH_EFFECTS[finish];
  const offence = (e.hitDamage - 1) * 100 + (e.hitKnockback - 1) * 20 - (e.swing - 1) * 30;
  const defence = (1 - e.guardDamage) * 100 + (1 - e.guardKnockback) * 15;
  return offence + defence + e.weight * 0.8;
}

const ROLE_NOUN: Record<PartRole, string> = {
  torso: "body",
  head: "head",
  leg: "legs",
  arm: "arms",
  wing: "wings",
  tail: "tail",
  horn: "horns",
  ear: "ears",
  fin: "fins",
  spike: "spikes",
  item: "item",
};

export interface FinishGroup {
  finish: Finish;
  /** What is made of it, as a card reads: "arms", "body and head", "everything". */
  where: string;
  /** "Metal arms", "Gold everything". */
  label: string;
}

/** The champion's non-vinyl finishes for cards: one group per finish, biggest share first. */
export function finishGroups(champion: Pick<Champion, "parts">): FinishGroup[] {
  const coverage = finishCoverage(champion);
  const roles = new Map<Finish, PartRole[]>();
  for (const part of champion.parts) {
    const finish = partFinish(part);
    if (finish === "vinyl") continue;
    const list = roles.get(finish) ?? [];
    if (!list.includes(part.role)) list.push(part.role);
    roles.set(finish, list);
  }
  return [...roles.entries()]
    .sort((a, b) => coverage[b[0]] - coverage[a[0]] || FINISHES.indexOf(a[0]) - FINISHES.indexOf(b[0]))
    .map(([finish, list]) => {
      const nouns = list.map((role) => ROLE_NOUN[role]);
      const where =
        coverage[finish] > 0.999
          ? "everything"
          : nouns.length <= 2
            ? nouns.join(" and ")
            : `${nouns.slice(0, 2).join(", ")} and more`;
      return { finish, where, label: `${FINISH_INFO[finish].label} ${where}` };
    });
}
