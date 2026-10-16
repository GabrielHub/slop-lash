"use client";

import { StageLights } from "../tutorial/studio";
import { LIGHT_ONLY } from "./backdrop";

/**
 * The rig's swaying beams. On the cream light set a second pass multiplies
 * over the first, so the beams read as saturated stage light, not pastel.
 */
export function Beams({ amount }: { amount: number }) {
  if (amount <= 0.01) return null;
  return (
    <>
      <StageLights amount={amount} />
      <div className={`pointer-events-none absolute inset-0 mix-blend-multiply ${LIGHT_ONLY}`}>
        <StageLights amount={amount} />
      </div>
    </>
  );
}
