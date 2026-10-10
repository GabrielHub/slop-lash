import type { StoredOutcome } from "./tables";

// Keeps a fight row well under Convex's 1 MB document limit: the event log
// and the health timeline are capped, numbers rounded, and the result is plain
// JSON. Stages replay the sim from its inputs for the visuals; the stored log
// feeds narration, the phones' health bars and the recap. `hash` is the sim's
// own and still covers the full run.

export const MAX_STORED_EVENTS = 500;
export const MAX_TIMELINE_SAMPLES = 400;

/** Least important first: dropped in this order when the log is over the cap. */
const DROP_ORDER = ["windup", "contact", "whiff", "getup", "dodge", "stagger", "showboat", "edge"];

interface RawOutcome {
  winner: "A" | "B";
  method: StoredOutcome["method"];
  endMs: number;
  health: { A: number; B: number };
  maxHealth: { A: number; B: number };
  events: readonly { kind: string }[];
  healthTimeline: readonly (readonly number[])[];
  hash: string;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** JSON-safe copy with numbers rounded to 3 decimals (non-finite numbers become 0). */
function plain<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "number" ? (Number.isFinite(item) ? round(item) : 0) : item,
    ),
  ) as T;
}

function capEvents(events: readonly { kind: string }[]) {
  let kept = [...events];
  for (const kind of DROP_ORDER) {
    if (kept.length <= MAX_STORED_EVENTS) break;
    kept = kept.filter((event) => event.kind !== kind);
  }
  if (kept.length > MAX_STORED_EVENTS) {
    // Still over: keep the head and the ending, which holds the decisive beats.
    const tail = kept.slice(-Math.floor(MAX_STORED_EVENTS / 2));
    kept = [...kept.slice(0, MAX_STORED_EVENTS - tail.length), ...tail];
  }
  return { events: kept, truncated: kept.length < events.length };
}

/** Evenly thinned samples, always keeping the first and the last. */
function capTimeline(samples: readonly (readonly number[])[]) {
  if (samples.length <= MAX_TIMELINE_SAMPLES) return samples.map((sample) => [...sample]);
  const out: number[][] = [];
  const stride = (samples.length - 1) / (MAX_TIMELINE_SAMPLES - 1);
  for (let index = 0; index < MAX_TIMELINE_SAMPLES; index += 1) {
    out.push([...samples[Math.round(index * stride)]!]);
  }
  return out;
}

export function compactOutcome(outcome: RawOutcome): StoredOutcome {
  const { events, truncated } = capEvents(outcome.events);
  return plain({
    winner: outcome.winner,
    method: outcome.method,
    endMs: Math.round(outcome.endMs),
    health: outcome.health,
    maxHealth: outcome.maxHealth,
    events,
    healthTimeline: capTimeline(outcome.healthTimeline),
    hash: outcome.hash,
    ...(truncated ? { truncated: true } : {}),
  });
}
