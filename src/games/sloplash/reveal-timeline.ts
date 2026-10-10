import { STAMP_IMPACT_MS } from "@/lib/animations";

/** How long one vote takes to fly from the ballot band into its card. */
export const FLIGHT_MS = 350;

export interface RevealTimeline {
  /** When each cast vote starts its flight, in flight order. */
  flights: number[];
  /** Crown, spotlight and points. */
  verdict: number;
  /** Authors' names. */
  unmask: number;
  /** The stamp appears (SLOPPED, FLAWLESS, TIE, NO VOTES), or null. */
  stamp: number | null;
  /** The stamp lands and the bonus counts on. */
  impact: number | null;
  /** Reaction bursts. */
  reactions: number;
}

/**
 * The beats of a contested reveal, in ms from the phase start. The stage and
 * the phones build their cue lists from this one function, so verdicts land
 * on every screen together. Six votes or fewer always finish by 5s, leaving
 * the rest of the 8s reveal as a hold.
 */
export function revealTimeline(cast: number, hasStamp: boolean): RevealTimeline {
  const spacing = cast <= 1 ? 0 : Math.min(240, 1200 / (cast - 1));
  const flights = Array.from({ length: cast }, (_, i) => 500 + i * spacing);
  const lastLand = cast === 0 ? 500 : flights.at(-1)! + FLIGHT_MS;
  // With no votes there is nothing to fly: the verdict follows the band folding away.
  const verdict = cast === 0 ? 1000 : Math.max(1600, lastLand + 350);
  const unmask = verdict + 600;
  const stamp = hasStamp ? unmask + 700 : null;
  const impact = stamp === null ? null : stamp + STAMP_IMPACT_MS;
  const reactions = (impact ?? unmask) + 700;
  return { flights, verdict, unmask, stamp, impact, reactions };
}

/**
 * The order cast votes fly in: the minority side first, alternating while
 * both sides have votes left, then the rest, so the lead can flip before it
 * settles. Equal sides start on the left. Returns indexes into `votes`;
 * votes for neither answer are left out.
 */
export function flightOrder(
  votes: readonly { responseId: string | null }[],
  leftId: string,
  rightId: string,
): number[] {
  const left: number[] = [];
  const right: number[] = [];
  votes.forEach((vote, index) => {
    if (vote.responseId === leftId) left.push(index);
    else if (vote.responseId === rightId) right.push(index);
  });
  const [first, second] = right.length < left.length ? [right, left] : [left, right];
  const order: number[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (i < first.length) order.push(first[i]!);
    if (i < second.length) order.push(second[i]!);
  }
  return order;
}
