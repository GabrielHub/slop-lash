// SlopFight fight tuner: runs every pair of sample champions across the
// arenas and several seeds, then prints pacing, method mix and balance tables.
//
//   node --no-warnings --experimental-transform-types \
//     --import ./scripts/quizslop/register-ts-loader.mjs \
//     scripts/slopfight/tune-fights.ts [--seeds=2] [--jobs=8] [--arenas=ROOFTOP,...]
//     [--set=samples|fixtures] [--limit=30000] [--pairs=200] [--json=out.json]
//
// Pairs are unordered; each seed alternates which champion is side A, so side
// bias cancels. Forks --jobs worker processes (same loader flags).

import { fork } from "node:child_process";
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { ARENA_IDS, type ArenaId } from "../../src/games/slopfight/arenas";
import { SAMPLES } from "../../src/games/slopfight/samples";
import type { Champion } from "../../src/games/slopfight/sheet";
import { SIM_FIXTURES } from "../../src/games/slopfight/sim/fixtures";
import { loadRapier, runFight, type FightOutcome, type Side } from "../../src/games/slopfight/sim/index";
import type { MoveType } from "../../src/games/slopfight/vocab";

interface Job {
  a: number;
  b: number;
  arena: ArenaId;
  seed: number;
}

interface Result extends Job {
  winner: Side;
  method: FightOutcome["method"];
  endMs: number;
  health: { A: number; B: number };
  maxHealth: { A: number; B: number };
  firstContact: number | null;
  firstHit: number | null;
  decisive: number;
  hits: { A: number; B: number };
  whiffs: { A: number; B: number };
  miracles: { A: number; B: number };
  damageByType: { A: Record<MoveType, number>; B: Record<MoveType, number> };
  throws: number;
  counters: number;
  /** Move attempts (windups) and landings by type, both sides. */
  attempts: Record<MoveType, number>;
  landed: Record<MoveType, number>;
  /** Per side, per move index: [windups, landed (hit or grab), whiffs]. */
  perMove: { A: [number, number, number][]; B: [number, number, number][] };
  /** The last landed move type before a KO or ring-out (null: none within 3 s). */
  finisher: MoveType | null;
  ms: number;
}

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.slice(2).split("=");
      return [key!, value] as const;
    }),
);
const set = args.get("set") ?? "samples";
const roster: { id: string; champion: Champion }[] =
  set === "fixtures" ? SIM_FIXTURES : SAMPLES.map((sample) => ({ id: sample.id, champion: sample.champion }));
const limitMs = Number(args.get("limit") ?? 30_000);

function summarize(job: Job, outcome: FightOutcome, ms: number): Result {
  const empty = (): Record<MoveType, number> => ({ STRIKE: 0, GRAPPLE: 0, TRICK: 0 });
  const result: Result = {
    ...job,
    winner: outcome.winner,
    method: outcome.method,
    endMs: outcome.endMs,
    health: outcome.health,
    maxHealth: outcome.maxHealth,
    firstContact: null,
    firstHit: null,
    decisive: outcome.endMs,
    hits: { A: 0, B: 0 },
    whiffs: { A: 0, B: 0 },
    miracles: { A: 0, B: 0 },
    damageByType: { A: empty(), B: empty() },
    throws: 0,
    counters: 0,
    attempts: empty(),
    landed: empty(),
    finisher: null,
    perMove: { A: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] },
    ms,
  };
  let lastLanded: { t: number; type: MoveType } | null = null;
  for (const event of outcome.events) {
    if ((event.kind === "contact" || event.kind === "hit" || event.kind === "grab") && result.firstContact === null) {
      result.firstContact = event.t;
    }
    if (event.kind === "windup") result.perMove[event.side][event.move]![0] += 1;
    if (event.kind === "hit" || event.kind === "grab") result.perMove[event.side][event.move]![1] += 1;
    if (event.kind === "whiff") result.perMove[event.side][event.move]![2] += 1;
    if (event.kind === "hit") {
      result.firstHit ??= event.t;
      result.hits[event.side] += 1;
      if (event.miracle) result.miracles[event.side] += 1;
      if (event.counter) result.counters += 1;
      result.damageByType[event.side][event.type] += event.damage;
      result.landed[event.type] += 1;
      lastLanded = { t: event.t, type: event.type };
    } else if (event.kind === "windup") {
      result.attempts[event.type] += 1;
    } else if (event.kind === "throw") {
      result.landed.GRAPPLE += 1;
      lastLanded = { t: event.t, type: "GRAPPLE" };
      result.firstHit ??= event.t;
      result.hits[event.side] += 1;
      result.throws += 1;
      result.damageByType[event.side].GRAPPLE += event.damage;
    } else if (event.kind === "whiff") {
      result.whiffs[event.side] += 1;
    }
  }
  if ((outcome.method === "KO" || outcome.method === "RINGOUT") && lastLanded && outcome.endMs - lastLanded.t <= 3000) {
    result.finisher = lastLanded.type;
  }
  // Decisive moment: the finish for KO and ring-out; otherwise when the winner took the lead for good.
  if (outcome.method === "DECISION" || outcome.method === "SUDDEN_DEATH") {
    let since = outcome.endMs;
    for (let index = outcome.healthTimeline.length - 1; index >= 0; index -= 1) {
      const [t, a, b] = outcome.healthTimeline[index]!;
      // Decisions go by the share of the health bar left.
      const shareA = a * outcome.maxHealth.B;
      const shareB = b * outcome.maxHealth.A;
      const ahead = outcome.winner === "A" ? shareA > shareB : shareB > shareA;
      if (!ahead) break;
      since = t;
    }
    result.decisive = since;
  }
  return result;
}

async function work(jobs: Job[]): Promise<Result[]> {
  const R = await loadRapier();
  return jobs.map((job) => {
    const started = performance.now();
    const outcome = runFight(R, {
      seed: job.seed,
      arena: job.arena,
      a: roster[job.a]!.champion,
      b: roster[job.b]!.champion,
      notes: [],
      limitMs,
    });
    return summarize(job, outcome, performance.now() - started);
  });
}


async function main() {
  const seeds = Number(args.get("seeds") ?? 2);
  const arenas = (args.get("arenas")?.split(",") as ArenaId[] | undefined) ?? [...ARENA_IDS];
  const jobsCount = Number(args.get("jobs") ?? Math.max(1, Math.min(12, availableParallelism() - 2)));
  const jobs: Job[] = [];
  for (let i = 0; i < roster.length; i += 1) {
    for (let j = i + 1; j < roster.length; j += 1) {
      for (const arena of arenas) {
        for (let s = 0; s < seeds; s += 1) {
          const seed = (Math.imul(i * 977 + j * 131 + s * 7919 + arena.length * 31, 2654435761) >>> 0) || 1;
          jobs.push(s % 2 === 0 ? { a: i, b: j, arena, seed } : { a: j, b: i, arena, seed });
        }
      }
    }
  }
  const cap = args.has("pairs") ? Number(args.get("pairs")) : jobs.length;
  const picked = jobs.filter((_, index) => index % Math.max(1, Math.floor(jobs.length / cap)) === 0).slice(0, cap);
  const started = performance.now();
  const chunks: Job[][] = Array.from({ length: jobsCount }, () => []);
  picked.forEach((job, index) => chunks[index % jobsCount]!.push(job));
  const self = fileURLToPath(import.meta.url);
  const results = (
    await Promise.all(
      chunks
        .filter((chunk) => chunk.length)
        .map(
          (chunk) =>
            new Promise<Result[]>((resolve, reject) => {
              const child = fork(self, ["--worker", `--set=${set}`, `--limit=${limitMs}`], {
                execArgv: process.execArgv,
              });
              child.on("message", (message) => resolve(message as Result[]));
              child.on("error", reject);
              child.on("exit", (code) => code && reject(new Error(`worker exit ${code}`)));
              child.send(chunk);
            }),
        ),
    )
  ).flat();
  const wall = performance.now() - started;
  report(results, wall, jobsCount);
  const json = args.get("json");
  if (json) writeFileSync(json, JSON.stringify(results));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "-");
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function report(results: Result[], wall: number, jobs: number) {
  const n = results.length;
  console.log(`\n${n} fights (${roster.length} champions, set=${set}), ${sec(wall)} wall on ${jobs} jobs`);
  console.log(`sim time per fight: mean ${mean(results.map((r) => r.ms)).toFixed(0)} ms, max ${Math.max(...results.map((r) => r.ms)).toFixed(0)} ms, mean fight ${sec(mean(results.map((r) => r.endMs)))}`);

  const slowest = [...results].sort((x, y) => y.ms - x.ms).slice(0, 3);
  console.log(
    `  slowest: ${slowest.map((r) => `${roster[r.a]!.id} v ${roster[r.b]!.id} ${r.arena} #${r.seed} ${r.ms.toFixed(0)}ms/${sec(r.endMs)}`).join(", ")}`,
  );
  const contacts = results.map((r) => r.firstContact).filter((t): t is number => t !== null);
  const firstHits = results.map((r) => r.firstHit).filter((t): t is number => t !== null);
  console.log(`\nPACING`);
  console.log(`  first contact: median ${sec(median(contacts))}, mean ${sec(mean(contacts))}, none in ${n - contacts.length}; under 5s ${pct(contacts.filter((t) => t < 5000).length, n)}`);
  console.log(`  first hit:     median ${sec(median(firstHits))}, mean ${sec(mean(firstHits))}, none in ${n - firstHits.length}`);
  console.log(`  decisive moment: mean ${sec(mean(results.map((r) => r.decisive)))}, median ${sec(median(results.map((r) => r.decisive)))}, by 20s ${pct(results.filter((r) => r.decisive <= 20_000).length, n)}`);
  const stalemates = results.filter((r) => r.hits.A + r.hits.B <= 1);
  console.log(`  stalemates (<=1 hit total): ${stalemates.length}; sudden death reached: ${results.filter((r) => r.endMs > limitMs).length}`);
  console.log(`  hits per fight: mean ${mean(results.map((r) => r.hits.A + r.hits.B)).toFixed(1)}, throws ${mean(results.map((r) => r.throws)).toFixed(2)}, counters ${mean(results.map((r) => r.counters)).toFixed(2)}`);

  console.log(`\nMETHODS`);
  for (const method of ["KO", "RINGOUT", "DECISION", "SUDDEN_DEATH"] as const) {
    const count = results.filter((r) => r.method === method).length;
    console.log(`  ${method.padEnd(13)} ${String(count).padStart(5)}  ${pct(count, n)}`);
  }
  console.log(`  side A wins ${pct(results.filter((r) => r.winner === "A").length, n)}`);
  console.log(`  by arena (KO / ring-out / decision):`);
  for (const arena of ARENA_IDS) {
    const fights = results.filter((r) => r.arena === arena);
    if (!fights.length) continue;
    const share = (method: string) => pct(fights.filter((r) => r.method === method).length, fights.length);
    console.log(`    ${arena.padEnd(16)} ${share("KO")} / ${share("RINGOUT")} / ${share("DECISION")}  (${fights.length})`);
  }

  const champ = (r: Result, side: Side) => roster[side === "A" ? r.a : r.b]!.champion;
  const tally = (label: string, keyOf: (c: Champion) => string | null) => {
    const table = new Map<string, { w: number; l: number }>();
    for (const r of results) {
      const kA = keyOf(champ(r, "A"));
      const kB = keyOf(champ(r, "B"));
      if (kA === null || kB === null || kA === kB) continue;
      const win = r.winner === "A" ? kA : kB;
      const lose = r.winner === "A" ? kB : kA;
      table.set(win, { w: (table.get(win)?.w ?? 0) + 1, l: table.get(win)?.l ?? 0 });
      table.set(lose, { w: table.get(lose)?.w ?? 0, l: (table.get(lose)?.l ?? 0) + 1 });
    }
    const rows = [...table.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    console.log(`\nWIN RATE BY ${label}`);
    for (const [key, { w, l }] of rows) {
      const rate = w / Math.max(1, w + l);
      const flag = rate > 0.65 || rate < 0.35 ? "  <-- out of band" : "";
      console.log(`  ${key.padEnd(12)} ${pct(w, w + l).padStart(4)}  (${w}-${l})${flag}`);
    }
  };
  tally("BODY PLAN", (c) => c.bodyPlan);
  console.log(`  how each plan loses (KO / ring-out / decision):`);
  for (const plan of [...new Set(roster.map((entry) => entry.champion.bodyPlan))].sort()) {
    const losses = results.filter((r) => champ(r, r.winner === "A" ? "B" : "A").bodyPlan === plan);
    const share = (method: string) => pct(losses.filter((r) => r.method === method).length, losses.length);
    console.log(`    ${plan.padEnd(10)} ${share("KO")} / ${share("RINGOUT")} / ${share("DECISION")}  (${losses.length})`);
  }
  tally("HEFT", (c) => `heft ${c.stats.heft}`);
  tally("REACH", (c) => `reach ${c.stats.reach}`);
  tally("CHAOS", (c) => `chaos ${c.stats.chaos}`);
  tally("PRIMARY MOVE TYPE", (c) => {
    const totals: Record<MoveType, number> = { STRIKE: 0, GRAPPLE: 0, TRICK: 0 };
    for (const move of c.moves) totals[move.type] += move.power;
    const sorted = (Object.entries(totals) as [MoveType, number][]).sort((a, b) => b[1] - a[1]);
    return sorted[0]![1] === sorted[1]![1] ? "mixed" : sorted[0]![0];
  });

  console.log(`\nDAMAGE SHARE BY MOVE TYPE`);
  const byType: Record<MoveType, number> = { STRIKE: 0, GRAPPLE: 0, TRICK: 0 };
  for (const r of results) {
    for (const side of ["A", "B"] as const) {
      for (const type of ["STRIKE", "GRAPPLE", "TRICK"] as const) byType[type] += r.damageByType[side][type];
    }
  }
  const total = byType.STRIKE + byType.GRAPPLE + byType.TRICK;
  for (const type of ["STRIKE", "GRAPPLE", "TRICK"] as const) console.log(`  ${type.padEnd(8)} ${pct(byType[type], total)}`);

  console.log(`\nMOVE TYPES (attempts -> landed; finisher of KOs / ring-outs)`);
  const fin = (method: string, type: MoveType | null) =>
    results.filter((r) => r.method === method && r.finisher === type).length;
  for (const type of ["STRIKE", "GRAPPLE", "TRICK"] as const) {
    const attempts = results.reduce((sum, r) => sum + r.attempts[type], 0);
    const landed = results.reduce((sum, r) => sum + r.landed[type], 0);
    console.log(
      `  ${type.padEnd(8)} ${(attempts / results.length).toFixed(1)}/fight, lands ${pct(landed, attempts)}, finishes KO ${fin("KO", type)} RINGOUT ${fin("RINGOUT", type)}`,
    );
  }
  console.log(`  no finisher: KO ${fin("KO", null)} RINGOUT ${fin("RINGOUT", null)}`);

  console.log(`\nLANDING RATE BY DELIVERY (strikes and grabs: landed / (landed + whiffed))`);
  const byDelivery = new Map<string, [number, number]>();
  const perChampMove = roster.map((entry) => entry.champion.moves.map(() => [0, 0, 0] as [number, number, number]));
  for (const r of results) {
    for (const side of ["A", "B"] as const) {
      const index = side === "A" ? r.a : r.b;
      roster[index]!.champion.moves.forEach((move, m) => {
        const [w, l, x] = r.perMove[side][m]!;
        const acc = perChampMove[index]![m]!;
        acc[0] += w;
        acc[1] += l;
        acc[2] += x;
        if (move.type === "TRICK") return;
        const key = `${move.type.toLowerCase()} ${move.delivery}`;
        const row = byDelivery.get(key) ?? [0, 0];
        row[0] += l;
        row[1] += x;
        byDelivery.set(key, row);
      });
    }
  }
  console.log(`  ${[...byDelivery.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, [l, x]]) => `${key} ${pct(l, l + x)}`).join(", ")}`);
  const poor: string[] = [];
  roster.forEach((entry, index) => {
    entry.champion.moves.forEach((move, m) => {
      const [, l, x] = perChampMove[index]![m]!;
      if (move.type !== "TRICK" && l + x > 0 && l / (l + x) < 0.4) poor.push(`${entry.id}#${m} ${move.type.toLowerCase()} ${move.delivery} ${pct(l, l + x)}`);
    });
  });
  console.log(`  moves landing under 40%: ${poor.length ? poor.join(", ") : "none"}`);

  console.log(`\nCHAOS VARIANCE (per fighter-fight)`);
  for (const bucket of [[1, 2], [3, 3], [4, 5]] as const) {
    let hits = 0;
    let whiffs = 0;
    let miracles = 0;
    const margins: number[] = [];
    let w = 0;
    let fights = 0;
    for (const r of results) {
      for (const side of ["A", "B"] as const) {
        const c = champ(r, side);
        if (c.stats.chaos < bucket[0] || c.stats.chaos > bucket[1]) continue;
        fights += 1;
        hits += r.hits[side];
        whiffs += r.whiffs[side];
        miracles += r.miracles[side];
        if (r.winner === side) w += 1;
        const foe = side === "A" ? "B" : "A";
        margins.push(r.health[side] / r.maxHealth[side] - r.health[foe] / r.maxHealth[foe]);
      }
    }
    const m = mean(margins);
    const sd = Math.sqrt(mean(margins.map((x) => (x - m) * (x - m))));
    console.log(`  chaos ${bucket[0]}-${bucket[1]}: whiff ${pct(whiffs, hits + whiffs)}, miracles/hit ${pct(miracles, hits)}, win ${pct(w, fights)}, health-margin sd ${sd.toFixed(2)} (${fights})`);
  }
  // The same whiff rate inside each body plan, so the plan mix can't fake a Chaos trend.
  console.log(`  whiff by chaos within each body plan (chaos 1-2 / 3 / 4-5):`);
  for (const plan of [...new Set(roster.map((entry) => entry.champion.bodyPlan))].sort()) {
    const cells = ([[1, 2], [3, 3], [4, 5]] as const).map(([lo, hi]) => {
      let hits = 0;
      let whiffs = 0;
      for (const r of results) {
        for (const side of ["A", "B"] as const) {
          const c = champ(r, side);
          if (c.bodyPlan !== plan || c.stats.chaos < lo || c.stats.chaos > hi) continue;
          hits += r.hits[side];
          whiffs += r.whiffs[side];
        }
      }
      return hits + whiffs ? pct(whiffs, hits + whiffs) : "   -";
    });
    console.log(`    ${plan.padEnd(10)} ${cells.join(" / ")}`);
  }

  console.log(`\nPER CHAMPION WIN RATE`);
  const per = roster.map((entry, index) => {
    let w = 0;
    let f = 0;
    for (const r of results) {
      if (r.a !== index && r.b !== index) continue;
      f += 1;
      if ((r.winner === "A" ? r.a : r.b) === index) w += 1;
    }
    return { id: entry.id, plan: entry.champion.bodyPlan, w, f };
  });
  per.sort((x, y) => y.w / Math.max(1, y.f) - x.w / Math.max(1, x.f));
  console.log(`  ${per.map((p) => `${p.id} ${pct(p.w, p.f)}`).join(", ")}`);
}

if (args.has("worker")) {
  process.on("message", async (jobs: Job[]) => {
    process.send!(await work(jobs));
    process.exit(0);
  });
} else {
  await main();
}
