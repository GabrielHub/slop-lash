// The forge's pure rules: the part queue's cadence and what stands on a
// pedestal in each phase (the growing/new champion, and the old one during
// an upgrade).

import type { Champion } from "../../sheet";
import type { StagePhase } from "../stage-input";
import type { SceneFighter } from "./scene-data";

/** Parts popped per second from the queue (faster when a burst is waiting). */
export const POP_RATE = 4;
export const POP_RATE_BURST = 6;

/** Seconds between pops with `waiting` parts queued. */
export function popInterval(waiting: number): number {
  return 1 / (waiting > 6 ? POP_RATE_BURST : POP_RATE);
}

/** What stands on a pedestal: the growing/new champion and, during an upgrade, the old one. */
export function pedestalCast(fighter: SceneFighter, phase: StagePhase, round: number) {
  const upgrading = phase === "UPGRADE" || (phase === "FOUNDRY" && round > 1);
  const forging = fighter.status === "FORGING";
  const upgradedNow = upgrading && fighter.status === "READY" && fighter.version >= round && round > 1;
  const old: Champion | null = upgrading ? (forging ? fighter.champion : upgradedNow ? fighter.previous : null) : null;
  // While an upgrade forges, `champion` is still the old sheet: nothing new to show yet.
  const current: Champion | null = forging ? null : fighter.status === "READY" ? fighter.champion : null;
  return { forging, old, current };
}

/** Forges older than this when the scene mounts are shown settled (no replayed celebration). */
export const SETTLED_AFTER_MS = 30_000;

/**
 * The forge a pedestal shows as already done when it mounts: its key, or null
 * when the reveal should play. A finished champion is settled when it already
 * celebrated or finished long ago. Settled belongs to that one forge: a later
 * forge on the same pedestal (the upgrade, a retry) has a new key and plays
 * its own reveal.
 */
export function settledForgeAtMount(
  key: string,
  { hasChampion, celebrated, startedAt, now }: { hasChampion: boolean; celebrated: boolean; startedAt: number; now: number },
): string | null {
  if (!hasChampion) return null;
  return celebrated || now - startedAt > SETTLED_AFTER_MS ? key : null;
}
