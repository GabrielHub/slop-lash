// Body plans as the forge prompt defines them, by leg count. Shared by the
// forge's repair check and the upgrade carry-over. Pure.

import type { BodyPlan } from "../vocab";

/** The leg counts each body plan has, as the prompt defines them. */
export const BODY_PLAN_LEGS: Record<BodyPlan, readonly [min: number, max: number]> = {
  BIPED: [2, 2],
  QUADRUPED: [3, 5],
  MULTIPED: [6, 8],
  HOPPER: [0, 1],
  SLITHER: [0, 0],
  FLIER: [0, 8],
};

/** The body plan, or the one its leg count implies when the two disagree. */
export function planForLegs(plan: BodyPlan, legs: number): BodyPlan {
  const [min, max] = BODY_PLAN_LEGS[plan];
  if (legs >= min && legs <= max) return plan;
  if (legs <= 1) return "HOPPER";
  if (legs === 2) return "BIPED";
  return legs <= 5 ? "QUADRUPED" : "MULTIPED";
}
