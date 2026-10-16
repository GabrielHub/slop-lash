import type { Cues } from "@/tutorial/timeline";

/**
 * Where each shot starts and ends on the global clock. Chapter cuts land a
 * hair before their first line, under a pixel sweep.
 */
export function shotTimes(cues: Cues) {
  const writeCut = cues.at("prompts") - 0.08;
  const arenaFrom = cues.at("rival");
  const roundsCut = cues.at("double") - 0.06;
  const finaleFrom = cues.at("outro") - 0.05;
  return {
    titleTo: writeCut,
    writeFrom: writeCut,
    writeTo: arenaFrom,
    arenaFrom,
    arenaTo: roundsCut,
    roundsFrom: roundsCut,
    roundsTo: finaleFrom,
    finaleFrom,
    /** The sweep transitions, each centred on its cut. */
    sweeps: [writeCut, roundsCut],
  };
}
