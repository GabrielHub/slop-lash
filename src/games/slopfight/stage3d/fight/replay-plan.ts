// RESULT's instant replay, planned: which moment of the fight to show again
// and how fast to play it. A KO replays the finishing blow, a ring-out the
// victim going over the edge (with the push, when it came just before; one
// the arena's finale did on its own says so on the bug), a decision the winner's biggest hit and sudden death the winning hit.
//
// The replay plays a short window of sim time around that moment: at full
// speed into a ramp, slow motion (0.3x) from just before contact through the
// reaction, then a ramp back up. The window comes from the recording's own
// events, so it always matches the motion on screen. Pure TypeScript.

import type { FinaleSpec } from "../../arenas";
import type { FightEvent, FightMethod, Side } from "../../sim";

export type ReplayKind = "KO" | "RINGOUT" | "HIT";

type ImpactEvent = Extract<FightEvent, { kind: "hit" | "throw" }>;

export interface ReplaySegment {
  /** Sim ms. */
  fromMs: number;
  toMs: number;
  /** Playback rate at each end (linear in sim time between them). */
  r0: number;
  r1: number;
  /** Real ms into the replay where the segment starts, and its real length. */
  realFrom: number;
  realMs: number;
}

export interface ReplayPlan {
  kind: ReplayKind;
  /** The line under the REPLAY bug. */
  label: string;
  attacker: Side;
  victim: Side;
  /** The decisive hit or throw (a ring-out's push), when there is one. */
  impact: ImpactEvent | null;
  /** Sim ms the slow motion centres on: the impact, or the victim going over the edge. */
  momentMs: number;
  /** A ring-out victim's landing inside the window (the splash), sim ms. */
  landingMs: number | null;
  fromMs: number;
  toMs: number;
  /** Slow motion holds between these, sim ms. */
  coreFromMs: number;
  coreToMs: number;
  segments: readonly ReplaySegment[];
  /** How long the replay lasts on screen, real ms. */
  realMs: number;
}

/** What a scan of the recording adds for a ring-out (playback.ts). */
export interface RingOutScan {
  /** The victim's torso left the floor (went over the edge or into a pit). */
  overEdgeMs?: number | null;
  /** The victim landed (water, street, floor or sink). */
  landingMs?: number | null;
  /** The arena's finale (the replay labels a ring-out it caused, with no push before the fall). */
  finale?: FinaleSpec["id"];
}

export const REPLAY_RATES = { lead: 1, core: 0.3, tail: 1 } as const;

/** Sim ms at full speed before the ramp into slow motion. */
const LEAD_MS = 500;
/** Sim ms the ramp from full speed down to slow motion takes. */
const RAMP_IN_MS = 250;
/** Slow motion around a hit: from just before contact through the target's reaction. */
const HIT_CORE_BEFORE_MS = 100;
const HIT_CORE_AFTER_MS = 280;
/** Slow motion around a ring-out: the victim tipping over the edge and starting to drop. */
const RINGOUT_CORE_BEFORE_MS = 150;
const RINGOUT_CORE_AFTER_MS = 330;
/** A push this soon before the fall shares its slow motion. */
const PUSH_SHARE_MS = 450;
/** How far back a ring-out looks for the push. */
const PUSH_WINDOW_MS = 1_500;
/** How far back a KO looks for the finishing blow. */
const FINISH_WINDOW_MS = 1_500;
/** Slow motion never covers more sim time than this. */
const CORE_MAX_MS = 500;
/** Sim ms the ramp back up to speed takes. */
const TAIL_MS = 350;
/** A landing this soon after the ramp is still shown (the splash closes the replay)... */
const LANDING_GRACE_MS = 450;
/** ...with this much after it. */
const LANDING_AFTER_MS = 200;
/** The replay never lasts longer than this on screen: the lead, then a landing's tail, give way first. */
export const REPLAY_MAX_REAL_MS = 3_000;
/** The lead never gets shorter than this (sim ms at full speed). */
const MIN_LEAD_MS = 150;

const LABELS: Record<FightMethod, string> = {
  KO: "THE KNOCKOUT",
  RINGOUT: "THE RING-OUT",
  DECISION: "BIGGEST HIT",
  SUDDEN_DEATH: "THE WINNING HIT",
};

/** A ring-out the finale did on its own: the counter tipped them off, the flood took them, the storm blew them off. */
const FINALE_LABELS: Record<FinaleSpec["id"], string> = {
  tilt: "TIPPED OFF",
  flood: "SWEPT AWAY",
  storm: "BLOWN AWAY",
};

const other = (side: Side): Side => (side === "A" ? "B" : "A");

const isImpact = (event: FightEvent): event is ImpactEvent => (event.kind === "hit" || event.kind === "throw") && event.damage > 0;

/** The last damaging hit or throw by `side` in [fromMs, toMs]. */
function lastImpact(events: readonly FightEvent[], side: Side, fromMs: number, toMs: number): ImpactEvent | null {
  let found: ImpactEvent | null = null;
  for (const event of events) {
    if (event.t > toMs) break;
    if (event.t >= fromMs && isImpact(event) && event.side === side) found = event;
  }
  return found;
}

/** The heaviest hit or throw (by `side` when given); ties go to a big hit, then the later one. */
function biggestImpact(events: readonly FightEvent[], endMs: number, side: Side | null): ImpactEvent | null {
  let best: ImpactEvent | null = null;
  for (const event of events) {
    if (event.t > endMs) break;
    if (!isImpact(event) || (side !== null && event.side !== side)) continue;
    const big = event.kind === "hit" && event.big;
    const bestBig = best?.kind === "hit" && best.big;
    if (!best || event.damage > best.damage || (event.damage === best.damage && (big || !bestBig))) best = event;
  }
  return best;
}

/**
 * The replay for a fight, from the recording's events and result; null when
 * there is nothing worth replaying (a decision without a single hit).
 */
export function planReplay(
  events: readonly FightEvent[],
  result: { winner: Side; method: FightMethod; endMs: number },
  scan: RingOutScan = {},
): ReplayPlan | null {
  const { winner, method, endMs } = result;
  const loser = other(winner);
  const label = LABELS[method];

  if (method === "RINGOUT") {
    const ringout = events.find((event) => event.kind === "ringout" && event.side === loser);
    if (!ringout) return null;
    const moment = Math.min(ringout.t, scan.overEdgeMs ?? ringout.t - 250);
    const push = lastImpact(events, winner, moment - PUSH_WINDOW_MS, moment);
    const pushed = push !== null && moment - push.t <= PUSH_SHARE_MS;
    let coreFrom = moment - RINGOUT_CORE_BEFORE_MS;
    if (pushed) coreFrom = push.t - HIT_CORE_BEFORE_MS;
    const coreTo = Math.min(moment + RINGOUT_CORE_AFTER_MS, coreFrom + CORE_MAX_MS);
    let toMs = coreTo + TAIL_MS;
    const landing = scan.landingMs ?? null;
    const landed = landing !== null && landing >= coreFrom && landing <= toMs + LANDING_GRACE_MS;
    if (landed) toMs = Math.max(toMs, landing + LANDING_AFTER_MS);
    const finale = events.find((event) => event.kind === "finale");
    const byFinale = scan.finale !== undefined && !pushed && finale !== undefined && finale.t <= moment;
    return build({ kind: "RINGOUT", label: byFinale ? FINALE_LABELS[scan.finale!] : label, attacker: winner, victim: loser, impact: push, momentMs: moment, landingMs: landed ? landing : null }, coreFrom, coreTo, toMs);
  }

  let impact: ImpactEvent | null = null;
  let kind: ReplayKind = "HIT";
  let moment: number | null = null;
  const ko = method === "KO" ? events.find((event) => event.kind === "ko" && event.side === loser) : undefined;
  if (ko) {
    // The finishing blow, else the fall itself (a KO from a broken part).
    kind = "KO";
    impact = lastImpact(events, winner, ko.t - FINISH_WINDOW_MS, ko.t);
    moment = impact?.t ?? ko.t;
  } else {
    if (method === "SUDDEN_DEATH") impact = lastImpact(events, winner, 0, endMs);
    impact ??= biggestImpact(events, endMs, winner) ?? biggestImpact(events, endMs, null);
    moment = impact?.t ?? null;
  }
  if (moment === null) return null;
  const attacker = impact?.side ?? winner;
  const coreFrom = moment - HIT_CORE_BEFORE_MS;
  const coreTo = moment + HIT_CORE_AFTER_MS;
  return build({ kind, label, attacker, victim: other(attacker), impact, momentMs: moment, landingMs: null }, coreFrom, coreTo, coreTo + TAIL_MS);
}

type PlanHead = Pick<ReplayPlan, "kind" | "label" | "attacker" | "victim" | "impact" | "momentMs" | "landingMs">;

function build(head: PlanHead, coreFromMs: number, coreToMs: number, toMs: number): ReplayPlan {
  let fromMs = Math.max(0, coreFromMs - RAMP_IN_MS - LEAD_MS);
  let plan = spanOf(head, fromMs, coreFromMs, coreToMs, toMs);
  let excess = plan.realMs - REPLAY_MAX_REAL_MS;
  if (excess <= 0) return plan;
  // Too long: a shorter lead (it plays at full speed, so each ms cut saves one)...
  const lead = Math.max(0, Math.min(excess, coreFromMs - RAMP_IN_MS - MIN_LEAD_MS - fromMs));
  fromMs += lead;
  excess -= lead;
  // ...then less of a landing's tail.
  const tail = Math.max(0, Math.min(excess, toMs - (coreToMs + TAIL_MS)));
  toMs -= tail;
  plan = spanOf(head, fromMs, coreFromMs, coreToMs, toMs);
  if (plan.landingMs !== null && plan.landingMs > toMs) plan = { ...plan, landingMs: null };
  return plan;
}

function spanOf(head: PlanHead, fromMs: number, coreFromMs: number, coreToMs: number, toMs: number): ReplayPlan {
  const rate = (t: number) => rateAt(coreFromMs, coreToMs, t);
  // Breakpoints of the piecewise-linear rate, clipped to the window.
  const marks = [fromMs, coreFromMs - RAMP_IN_MS, coreFromMs, coreToMs, coreToMs + TAIL_MS, toMs]
    .filter((t) => t >= fromMs && t <= toMs)
    .sort((a, b) => a - b);
  const segments: ReplaySegment[] = [];
  let real = 0;
  for (let i = 0; i + 1 < marks.length; i += 1) {
    const from = marks[i]!;
    const to = marks[i + 1]!;
    if (to - from < 1e-6) continue;
    const r0 = rate(from);
    const r1 = rate(to);
    const realMs = segmentRealMs(to - from, r0, r1);
    segments.push({ fromMs: from, toMs: to, r0, r1, realFrom: real, realMs });
    real += realMs;
  }
  return { ...head, fromMs, toMs, coreFromMs, coreToMs, segments, realMs: real };
}

/** The playback rate at sim time t: full speed, ramping into slow motion over the core, ramping back out. */
function rateAt(coreFrom: number, coreTo: number, t: number): number {
  const { lead, core, tail } = REPLAY_RATES;
  if (t <= coreFrom - RAMP_IN_MS) return lead;
  if (t < coreFrom) return core + (lead - core) * ((coreFrom - t) / RAMP_IN_MS);
  if (t <= coreTo) return core;
  if (t < coreTo + TAIL_MS) return core + (tail - core) * ((t - coreTo) / TAIL_MS);
  return tail;
}

/** Real ms to play `simMs` while the rate moves linearly from r0 to r1. */
function segmentRealMs(simMs: number, r0: number, r1: number): number {
  if (Math.abs(r1 - r0) < 1e-9) return simMs / r0;
  return (simMs * Math.log(r1 / r0)) / (r1 - r0);
}

/** The sim time shown `realMs` into the replay. */
export function replaySimAt(plan: ReplayPlan, realMs: number): number {
  if (realMs <= 0) return plan.fromMs;
  for (const segment of plan.segments) {
    if (realMs > segment.realFrom + segment.realMs) continue;
    const tau = realMs - segment.realFrom;
    const length = segment.toMs - segment.fromMs;
    const { r0, r1 } = segment;
    if (Math.abs(r1 - r0) < 1e-9) return segment.fromMs + tau * r0;
    // rate(u) = r0 + k u, so real(u) = ln(rate / r0) / k and u = r0 (e^{k real} - 1) / k.
    const k = (r1 - r0) / length;
    return segment.fromMs + Math.min(length, (r0 * (Math.exp(k * tau) - 1)) / k);
  }
  return plan.toMs;
}

/** The playback rate at a sim time inside the plan's window. */
export function replayRateAt(plan: ReplayPlan, simMs: number): number {
  return rateAt(plan.coreFromMs, plan.coreToMs, simMs);
}

/**
 * The replay camera's horizontal direction from the action (x, z): low and
 * off the attacker's back shoulder for a hit, so the victim's face takes it;
 * nearly side-on to a ring-out, so the drop reads. Never from behind the set
 * (the camera stays on the room's side, +z).
 */
export function replayFrom(attacker: readonly [number, number], victim: readonly [number, number], kind: ReplayKind): [number, number] {
  let lx = victim[0] - attacker[0];
  let lz = victim[1] - attacker[1];
  const length = Math.hypot(lx, lz);
  if (length < 1e-4) {
    lx = 1;
    lz = 0;
  } else {
    lx /= length;
    lz /= length;
  }
  // Side-on, on the room's side.
  let px = -lz;
  let pz = lx;
  if (pz < 0 || (pz === 0 && px > 0)) {
    px = -px;
    pz = -pz;
  }
  const angle = ((kind === "RINGOUT" ? 20 : 50) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Toward the attacker's back; swing the other way if that would leave the room's side.
  let x = px * cos - lx * sin;
  let z = pz * cos - lz * sin;
  if (z < -0.2) {
    x = px * cos + lx * sin;
    z = pz * cos + lz * sin;
  }
  const n = Math.hypot(x, z) || 1;
  return [x / n, z / n];
}
