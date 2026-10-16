// SlopFight finish tuner: dresses each sample champion in each finish (the
// whole body, the arms only, the torso only) and fights the variant against
// its own vinyl original ("twin") and against the vinyl field, then prints a
// win-rate table per finish and scope. A finish is a trade-off, not an
// upgrade: every twin win rate should land near 50% (42-58%).
//
//   node --no-warnings --experimental-transform-types \
//     --import ./scripts/quizslop/register-ts-loader.mjs \
//     scripts/slopfight/tune-finishes.ts [--seeds=24] [--field=8] [--jobs=14]
//     [--finishes=metal,gold] [--scopes=all,arms,torso] [--limit=30000] [--json=out.json]
//     [--override=metal=neutral,metal.hitDamage=1.2]
//
// --seeds: twin fights per champion, finish and scope; --field: fights against
// other vinyl samples per variant (0 skips the field), with the vinyl original
// fighting the same opponents, arenas and seeds as the baseline. Sides
// alternate by seed and arenas rotate. Forks --jobs workers (same loader flags).
// --override patches FINISH_EFFECTS in every process ("finish=neutral" resets
// one to vinyl's, "finish.key=value" sets one lever) to measure a single lever
// or try numbers before committing them.

import { fork } from "node:child_process";
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { ARENA_IDS, type ArenaId } from "../../src/games/slopfight/arenas";
import { FINISH_EFFECTS, finishScore, type FinishEffect } from "../../src/games/slopfight/finishes";
import { SAMPLES } from "../../src/games/slopfight/samples";
import type { Champion, Part } from "../../src/games/slopfight/sheet";
import { loadRapier, runFight, type FightOutcome, type Side } from "../../src/games/slopfight/sim/index";
import { FINISHES, type Finish } from "../../src/games/slopfight/vocab";

const SCOPES = {
  all: (_part: Part) => true,
  arms: (part: Part) => part.role === "arm",
  torso: (part: Part) => part.role === "torso",
} as const;
type Scope = keyof typeof SCOPES;

interface Job {
  /** "twin", "field" (variant v other) or "base" (original v other). */
  kind: "twin" | "field" | "base";
  finish: Finish;
  scope: Scope;
  champ: number;
  /** The variant (or, for "base", the original) fights as this side. */
  side: Side;
  a: Champion;
  b: Champion;
  arena: ArenaId;
  seed: number;
}

interface Result {
  kind: Job["kind"];
  finish: Finish;
  scope: Scope;
  champ: number;
  won: boolean;
  method: FightOutcome["method"];
  /** Hits (and throws) the tracked side landed and took, with their damage and knockback. */
  dealt: { n: number; damage: number; knockback: number };
  taken: { n: number; damage: number; knockback: number };
}

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const at = arg.indexOf("=");
      return at < 0 ? ([arg.slice(2), "true"] as const) : ([arg.slice(2, at), arg.slice(at + 1)] as const);
    }),
);
const limitMs = Number(args.get("limit") ?? 30_000);
const override = args.get("override") ?? "";
{
  const effects = FINISH_EFFECTS as Record<Finish, FinishEffect>;
  for (const token of override.split(",").filter(Boolean)) {
    const [lhs, value] = token.split("=") as [string, string];
    const [finish, key] = lhs.split(".") as [Finish, keyof FinishEffect | undefined];
    if (!(finish in effects)) throw new Error(`--override: unknown finish ${finish}`);
    effects[finish] = key ? { ...effects[finish], [key]: Number(value) } : { ...effects.vinyl };
  }
}
const roster = SAMPLES.map((sample) => sample.champion);

function variant(champion: Champion, finish: Finish, scope: Scope): Champion | null {
  const match = SCOPES[scope];
  if (!champion.parts.some(match)) return null;
  return { ...champion, parts: champion.parts.map((part) => (match(part) ? { ...part, finish } : part)) };
}

function summarize(job: Job, outcome: FightOutcome): Result {
  const dealt = { n: 0, damage: 0, knockback: 0 };
  const taken = { n: 0, damage: 0, knockback: 0 };
  for (const event of outcome.events) {
    if (event.kind !== "hit" && event.kind !== "throw") continue;
    const row = event.side === job.side ? dealt : taken;
    row.n += 1;
    row.damage += event.damage;
    row.knockback += event.knockback;
  }
  return {
    kind: job.kind,
    finish: job.finish,
    scope: job.scope,
    champ: job.champ,
    won: outcome.winner === job.side,
    method: outcome.method,
    dealt,
    taken,
  };
}

async function work(jobs: Job[]): Promise<Result[]> {
  const R = await loadRapier();
  return jobs.map((job) =>
    summarize(job, runFight(R, { seed: job.seed, arena: job.arena, a: job.a, b: job.b, notes: [], limitMs })),
  );
}

const seedOf = (...parts: number[]) =>
  (Math.imul(parts.reduce((acc, part) => Math.imul(acc ^ part, 16777619) >>> 0, 2166136261), 2654435761) >>> 0) || 1;

function buildJobs(): Job[] {
  const seeds = Number(args.get("seeds") ?? 24);
  const field = Number(args.get("field") ?? 8);
  const finishes = (args.get("finishes")?.split(",") as Finish[] | undefined) ?? FINISHES.filter((f) => f !== "vinyl");
  const scopes = (args.get("scopes")?.split(",") as Scope[] | undefined) ?? (Object.keys(SCOPES) as Scope[]);
  const jobs: Job[] = [];
  const pair = (kind: Job["kind"], finish: Finish, scope: Scope, champ: number, mine: Champion, other: Champion, s: number, seed: number) => {
    const side: Side = s % 2 === 0 ? "A" : "B";
    const arena = ARENA_IDS[s % ARENA_IDS.length]!;
    jobs.push({ kind, finish, scope, champ, side, a: side === "A" ? mine : other, b: side === "A" ? other : mine, arena, seed });
  };
  // Field opponents per champion: fixed, so the base fights face the same ones.
  const opponents = roster.map((_, champ) =>
    Array.from({ length: field }, (_, k) => {
      const pick = seedOf(champ, k, 99) % (roster.length - 1);
      return pick >= champ ? pick + 1 : pick;
    }),
  );
  roster.forEach((original, champ) => {
    if (field > 0) {
      for (let k = 0; k < field; k += 1)
        pair("base", "vinyl", "all", champ, original, roster[opponents[champ]![k]!]!, k, seedOf(champ, k, 7));
    }
    finishes.forEach((finish) => {
      scopes.forEach((scope) => {
        const dressed = variant(original, finish, scope);
        if (!dressed) return;
        const fi = FINISHES.indexOf(finish);
        const si = Object.keys(SCOPES).indexOf(scope);
        for (let s = 0; s < seeds; s += 1) pair("twin", finish, scope, champ, dressed, original, s, seedOf(champ, fi, si, s, 1));
        for (let k = 0; k < field; k += 1)
          pair("field", finish, scope, champ, dressed, roster[opponents[champ]![k]!]!, k, seedOf(champ, k, 7));
      });
    });
  });
  return jobs;
}

async function main() {
  const jobsCount = Number(args.get("jobs") ?? Math.max(1, Math.min(14, availableParallelism() - 2)));
  const jobs = buildJobs();
  const started = performance.now();
  const chunks: Job[][] = Array.from({ length: jobsCount }, () => []);
  jobs.forEach((job, index) => chunks[index % jobsCount]!.push(job));
  const self = fileURLToPath(import.meta.url);
  const results = (
    await Promise.all(
      chunks
        .filter((chunk) => chunk.length)
        .map(
          (chunk) =>
            new Promise<Result[]>((resolve, reject) => {
              const child = fork(self, ["--worker", `--limit=${limitMs}`, `--override=${override}`], {
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
  report(results, performance.now() - started, jobsCount);
  const json = args.get("json");
  if (json) writeFileSync(json, JSON.stringify(results));
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "-");

function report(results: Result[], wall: number, jobs: number) {
  console.log(`\n${results.length} fights, ${(wall / 1000).toFixed(0)}s wall on ${jobs} jobs`);
  const base = results.filter((r) => r.kind === "base");
  const baseRate = new Map<number, number>();
  for (const champ of new Set(base.map((r) => r.champ))) {
    const rows = base.filter((r) => r.champ === champ);
    baseRate.set(champ, rows.filter((r) => r.won).length / rows.length);
  }
  const vinylDealt = base.reduce((acc, r) => [acc[0]! + r.dealt.damage, acc[1]! + r.dealt.knockback, acc[2]! + r.dealt.n], [0, 0, 0]);
  if (base.length)
    console.log(
      `vinyl field: win ${pct(base.filter((r) => r.won).length, base.length)} (${base.length}), dmg/hit ${(vinylDealt[0]! / vinylDealt[2]!).toFixed(1)}, kb/hit ${(vinylDealt[1]! / vinylDealt[2]!).toFixed(2)}`,
    );
  console.log(
    `\n${"finish".padEnd(8)} ${"scope".padEnd(6)} ${"score".padStart(6)}  ${"twin".padStart(5)} ${"(n)".padStart(6)}  ${"field".padStart(6)}  dmg/hit dealt/taken   kb/hit dealt/taken   ringouts for/against  KOs for/against`,
  );
  const keys = [...new Set(results.filter((r) => r.kind !== "base").map((r) => `${r.finish}|${r.scope}`))];
  keys.sort((x, y) => {
    const [fx, sx] = x.split("|") as [Finish, Scope];
    const [fy, sy] = y.split("|") as [Finish, Scope];
    return FINISHES.indexOf(fx) - FINISHES.indexOf(fy) || Object.keys(SCOPES).indexOf(sx) - Object.keys(SCOPES).indexOf(sy);
  });
  for (const key of keys) {
    const [finish, scope] = key.split("|") as [Finish, Scope];
    const twin = results.filter((r) => r.kind === "twin" && r.finish === finish && r.scope === scope);
    const field = results.filter((r) => r.kind === "field" && r.finish === finish && r.scope === scope);
    const tw = twin.filter((r) => r.won).length;
    const rate = tw / Math.max(1, twin.length);
    // Field delta: the variant's win rate against the field minus its original's, per champion.
    const deltas = [...new Set(field.map((r) => r.champ))].map((champ) => {
      const rows = field.filter((r) => r.champ === champ);
      return rows.filter((r) => r.won).length / rows.length - (baseRate.get(champ) ?? 0);
    });
    const delta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : Number.NaN;
    const all = [...twin, ...field];
    const sum = (pick: (r: Result) => number) => all.reduce((acc, r) => acc + pick(r), 0);
    const per = (a: number, n: number, digits: number) => (n ? (a / n).toFixed(digits) : "-");
    const outs = (won: boolean) => all.filter((r) => r.method === "RINGOUT" && r.won === won).length;
    const kos = (won: boolean) => all.filter((r) => r.method === "KO" && r.won === won).length;
    const flag = rate < 0.42 || rate > 0.58 ? "  <-- out of band" : "";
    console.log(
      `${finish.padEnd(8)} ${scope.padEnd(6)} ${finishScore(finish).toFixed(1).padStart(6)}  ${pct(tw, twin.length).padStart(5)} ${`(${twin.length})`.padStart(6)}  ${Number.isNaN(delta) ? "     -" : `${delta >= 0 ? "+" : ""}${(100 * delta).toFixed(0)}pt`.padStart(6)}  ${per(sum((r) => r.dealt.damage), sum((r) => r.dealt.n), 1).padStart(7)} / ${per(sum((r) => r.taken.damage), sum((r) => r.taken.n), 1).padEnd(6)}   ${per(sum((r) => r.dealt.knockback), sum((r) => r.dealt.n), 2).padStart(6)} / ${per(sum((r) => r.taken.knockback), sum((r) => r.taken.n), 2).padEnd(6)}   ${pct(outs(true), all.length).padStart(4)} / ${pct(outs(false), all.length).padEnd(4)}          ${pct(kos(true), all.length).padStart(4)} / ${pct(kos(false), all.length)}${flag}`,
    );
  }
}

if (args.has("worker")) {
  process.on("message", async (jobs: Job[]) => {
    process.send!(await work(jobs));
    process.exit(0);
  });
} else {
  await main();
}
