import type { ModeView, RoomPlayer } from "@/room/context";
import type { MatchupNote } from "@/games/slopfight/modifiers";
import type { FightSide } from "@/games/slopfight/scoring";
import { maxHealth, type Champion } from "@/games/slopfight/sheet";

type Outcome = NonNullable<ModeView<"SLOPFIGHT">["fights"][number]["outcome"]>;

// --- Fights: a scripted hit list becomes an outcome in the stored shape ---

/** [sim ms, attacker, damage, move index, big] */
type Hit = [t: number, by: FightSide, damage: number, move: 0 | 1 | 2, big?: boolean];

type Finish =
  | { method: "KO" }
  | { method: "RINGOUT"; loser: FightSide; t: number }
  | { method: "DECISION" };

export interface Bout {
  round: number;
  step: number;
  a: number;
  b: number;
  hits: Hit[];
  finish: Finish;
  bets: [RoomPlayer, FightSide][];
  hype: { A: number; B: number };
  notes: MatchupNote[];
  walkOn: [string, string];
  recapLine: string;
}

const other = (side: FightSide): FightSide => (side === "A" ? "B" : "A");

export function synthOutcome(bout: Bout, sheets: Record<FightSide, Champion>, limitMs: number): Outcome {
  const max = { A: maxHealth(sheets.A), B: maxHealth(sheets.B) };
  const health = { ...max };
  const events: Outcome["events"] = [{ t: 0, kind: "start", side: null }];
  const changes: [number, number, number][] = [];
  const first = bout.hits[0];
  if (first) events.push({ t: first[0] - 180, kind: "contact", side: null, point: [0, 0.5, 0] });
  for (const [t, by, damage, move, big = false] of bout.hits) {
    const target = other(by);
    const sheet = sheets[by];
    health[target] = Math.max(0, health[target] - damage);
    const type = sheet.moves[move]!.type;
    const x = by === "A" ? 0.4 : -0.4;
    events.push({ t: t - 420, kind: "windup", side: by, move, type });
    if (type === "GRAPPLE") {
      events.push({ t: t - 200, kind: "grab", side: by, move, point: [x, 0.6, 0] });
      events.push({
        t,
        kind: "throw",
        side: by,
        move,
        damage,
        knockback: 9,
        point: [x, 0.6, 0],
        health: health[target],
      });
    } else {
      events.push({
        t,
        kind: "hit",
        side: by,
        move,
        type,
        damage,
        knockback: big ? 14 : 5,
        big,
        point: [x, 0.7, 0],
        health: health[target],
        counter: false,
        miracle: false,
      });
    }
    if (big) events.push({ t: t + 16, kind: "stagger", side: target, ms: 900, cause: "hit" });
    changes.push([t, health.A, health.B]);
  }
  const finish = bout.finish;
  let endMs: number;
  let winner: FightSide;
  if (finish.method === "KO") {
    const last = bout.hits.at(-1)!;
    endMs = last[0];
    winner = last[1];
    events.push({ t: endMs, kind: "ko", side: other(winner) });
  } else if (finish.method === "RINGOUT") {
    endMs = finish.t;
    winner = other(finish.loser);
    const x = finish.loser === "A" ? -3.1 : 3.1;
    events.push({ t: endMs - 1_100, kind: "edge", side: finish.loser, point: [x * 0.9, 0, 0.4] });
    events.push({ t: endMs, kind: "ringout", side: finish.loser, point: [x, -0.7, 0.4] });
  } else {
    endMs = limitMs;
    winner = health.A >= health.B ? "A" : "B";
    events.push({ t: endMs, kind: "timeout", side: null });
  }
  events.push({ t: endMs, kind: "end", side: winner, method: finish.method });

  const healthTimeline: number[][] = [];
  let shown = { A: max.A, B: max.B };
  let next = 0;
  for (let t = 0; t <= endMs; t += 250) {
    while (next < changes.length && changes[next]![0] <= t) {
      const [at, a, b] = changes[next]!;
      if (at < t) healthTimeline.push([at, a, b]);
      shown = { A: a, B: b };
      next += 1;
    }
    healthTimeline.push([t, shown.A, shown.B]);
  }
  if (healthTimeline.at(-1)![0] !== endMs) healthTimeline.push([endMs, health.A, health.B]);
  return {
    winner,
    method: finish.method,
    endMs,
    health,
    maxHealth: max,
    events,
    healthTimeline,
    hash: "fixture",
  };
}
