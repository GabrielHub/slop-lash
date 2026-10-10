// SlopFight forge probe: runs the real forge prompts against Claude Haiku 5.5
// at high effort through the Vercel AI Gateway (the local machine has an AI
// Gateway key, not an Anthropic key; production calls Anthropic directly with
// the same prompts and settings). Every input goes through forgeChampion, so
// streaming, the repair call and the Sonnet fallback all run as in the game.
//
//   node --no-warnings --experimental-transform-types \
//     --import ./scripts/quizslop/register-ts-loader.mjs \
//     scripts/slopfight/forge-probe.ts [--only id,id] [--out <dir>] [--concurrency 4]
//     [--force-fallback] [--calls]
//
// --calls skips the forge inputs and instead runs the other three calls once
// each (house descriptions, then a house forge of each; two matchups; two
// recaps), writing calls.md under --out.
//
// Writes public/dev/slopfight-probe.json ([{ id, input, kind, champion }] for
// every forged champion; full runs only) and, under --out, summary.md (with a
// sheet audit), results.json, gallery.json (the same shape as the public file,
// for every run) and the rasterized doodles. The h-* inputs are held out: no
// prompt or example mentions their subjects, so they measure generalization.
// Reads AI_GATEWAY_API_KEY from .env.local; never prints it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APICallError, createGateway } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { FORGE_EXAMPLES } from "../../src/games/slopfight/ai/examples";
import { forgeChampion } from "../../src/games/slopfight/ai/forge";
import { preserveUpgrade } from "../../src/games/slopfight/ai/upgrade";
import { inventHouseChampions } from "../../src/games/slopfight/ai/house";
import { writeMatchup } from "../../src/games/slopfight/ai/matchup";
import { writeRecapLine } from "../../src/games/slopfight/ai/recap";
import type { ArenaId } from "../../src/games/slopfight/arenas";
import { REJECTION_TEXT_MAX } from "../../src/games/slopfight/constants";
import {
  legCount,
  parsePartialParts,
  type Champion,
  type ForgeResult,
  type Rejection,
} from "../../src/games/slopfight/sheet";
import { TOY_COLOR_VALUES, type ToyColor } from "../../src/games/slopfight/vocab";
import { SLOPFIGHT_MODEL_ID } from "../../src/games/slopfight/ai/shared";
import type { AiCallRecord } from "../../src/lib/ai/run";

import { ADDITIONS, DOODLES, PROBES, png, type Kind, type Probe } from "./forge-probe-inputs";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "..", "..");

function loadGatewayKey(): string {
  const text = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*AI_GATEWAY_API_KEY\s*=\s*(.*?)\s*$/u.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/gu, "");
  }
  throw new Error("AI_GATEWAY_API_KEY is not set in .env.local");
}

process.env.AI_GATEWAY_API_KEY = loadGatewayKey();
const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

/** --force-fallback: Haiku fails every request, so every forge runs the real Sonnet fallback path. */
const FORCE_FALLBACK = args.includes("--force-fallback");
const failingHaiku = new MockLanguageModelV4({
  doStream: async () => {
    throw new APICallError({
      message: "forced failure (--force-fallback)",
      url: "https://probe.invalid",
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    });
  },
});
/** Catalog ids are gateway ids for both models, so the probe maps them one to one. */
const languageModel = (modelId: string) =>
  FORCE_FALLBACK && modelId === SLOPFIGHT_MODEL_ID ? failingHaiku : gateway(modelId);
const OUT = flag("--out") ?? join(ROOT, "output", "slopfight-probe");
const ONLY = flag("--only")?.split(",");
const CONCURRENCY = Number(flag("--concurrency") ?? 4);
const CALLS = args.includes("--calls");
const ARENAS: readonly ArenaId[] = ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"];

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

interface ProbeRun {
  id: string;
  kind: Kind;
  input: string;
  ok: boolean;
  failReason?: string;
  result?: ForgeResult;
  firstPartMs: number | null;
  totalMs: number;
  calls: AiCallRecord[];
  checks: string[];
  /** The rejection as the model wrote it (the last streamed partial), before shortening. */
  rawRejection?: Rejection;
}

/**
 * Arms as built: root arm parts, mirrors counted twice. The sim and the
 * renderer build from the parts; the sheet's `armCount` rounds to 0, 2 or 4.
 */
function armParts(champion: Champion): number {
  const roleOf = new Map(champion.parts.map((part) => [part.id, part.role]));
  return champion.parts
    .filter((part) => part.role === "arm" && (part.parent === null || roleOf.get(part.parent) !== "arm"))
    .reduce((count, part) => count + (part.mirror ? 2 : 1), 0);
}

/** Arms, legs and tails on the torso, mirrors counted twice. */
function torsoLimbs(champion: Champion): number {
  const torso = champion.parts.find((part) => part.role === "torso")?.id;
  return champion.parts
    .filter((part) => part.parent === torso && (part.role === "arm" || part.role === "leg" || part.role === "tail"))
    .reduce((count, part) => count + (part.mirror ? 2 : 1), 0);
}

/** The prompt's stock comedy first names, allowed only when the player wrote them. */
const STOCK_NAMES = ["Dennis", "Gary", "Kevin", "Barry", "Steve", "Gerald"];
const wordIn = (text: string, word: string) => new RegExp(`\\b${word}\\b`, "iu").test(text);

const ENDS_SENTENCE = /[.!?…]["'”’)\]]*$/u;

function describeCalls(calls: readonly AiCallRecord[]): string {
  return calls
    .map((call) => {
      const model = call.modelId.includes("sonnet") ? "sonnet" : "haiku";
      const status = call.ok ? "ok" : (call.failReason ?? "fail");
      return `${call.task.replace("slopfight.", "")}/${model} ${status} ${(call.latencyMs / 1000).toFixed(1)}s`;
    })
    .join(" -> ");
}

function checksFor(probe: Probe, result: ForgeResult | undefined, rawRejection?: Rejection): string[] {
  const failed: string[] = [];
  const { expect } = probe;
  if (!result) return ["no result"];
  if (expect.verdict && result.verdict !== expect.verdict) failed.push(`verdict ${result.verdict}, wanted ${expect.verdict}`);
  const champion = result.champion;
  if (champion) {
    if (expect.legs !== undefined && legCount(champion) !== expect.legs) {
      failed.push(`legs ${legCount(champion)}, wanted ${expect.legs}`);
    }
    if (expect.limbs !== undefined && legCount(champion) + armParts(champion) !== expect.limbs) {
      failed.push(`legs ${legCount(champion)} + arms ${armParts(champion)}, wanted ${expect.limbs} limbs`);
    }
    if (expect.arms !== undefined && armParts(champion) !== expect.arms) {
      failed.push(`arms ${armParts(champion)}, wanted ${expect.arms}`);
    }
    if (expect.tentacles !== undefined && torsoLimbs(champion) !== expect.tentacles) {
      failed.push(`tentacles ${torsoLimbs(champion)}, wanted ${expect.tentacles}`);
    }
    if (expect.name && !champion.name.toLowerCase().includes(expect.name.toLowerCase())) {
      failed.push(`name "${champion.name}" lost ${expect.name}`);
    }
    const stock = STOCK_NAMES.find(
      (stockName) => wordIn(champion.name, stockName) && !wordIn(probe.input, stockName),
    );
    if (stock) failed.push(`stock name "${champion.name}" (${stock} is not in the input)`);
  }
  if (result.rejection && rawRejection) {
    for (const field of ["reason", "suggestion"] as const) {
      const text = result.rejection[field];
      const cut = text !== rawRejection[field].trim();
      if (cut && !ENDS_SENTENCE.test(text)) failed.push(`rejection ${field} cut mid-sentence: "${text}"`);
    }
  }
  return failed;
}

const results = new Map<string, ProbeRun>();

async function runProbe(probe: Probe): Promise<ProbeRun> {
  const base = probe.base ? results.get(probe.base)?.result?.champion : undefined;
  if (probe.base && !base) {
    return {
      id: probe.id,
      kind: probe.kind,
      input: probe.input,
      ok: false,
      failReason: `base ${probe.base} has no champion`,
      firstPartMs: null,
      totalMs: 0,
      calls: [],
      checks: ["skipped"],
    };
  }
  const drawing = probe.doodle !== undefined ? DOODLES[probe.doodle]! : undefined;
  const image =
    drawing !== undefined
      ? png(drawing, probe.additionDoodle ? ADDITIONS[probe.additionDoodle] : undefined)
      : undefined;
  if (image) writeFileSync(join(OUT, `${probe.id}.png`), image);
  const started = Date.now();
  let firstPartMs: number | null = null;
  let lastPartial: Partial<ForgeResult> | undefined;
  const forged = await forgeChampion({
    mode: probe.mode,
    ...(probe.kind === "describe" || (probe.kind === "lenient" && !drawing && probe.id !== "l-nothing")
      ? { text: probe.input }
      : {}),
    ...(image ? { png: image } : {}),
    ...(base ? { previous: base } : {}),
    ...(probe.addition ? { addition: probe.addition } : {}),
    arenas: ARENAS,
    keys: {},
    deadline: null,
    languageModel,
    onPartial: (partial) => {
      lastPartial = partial as Partial<ForgeResult>;
      if (firstPartMs === null && parsePartialParts(partial).length > 0) firstPartMs = Date.now() - started;
    },
  });
  const run: ProbeRun = {
    id: probe.id,
    kind: probe.kind,
    input: probe.input,
    ok: forged.ok,
    ...(forged.ok ? { result: forged.result } : { failReason: forged.failReason }),
    firstPartMs,
    totalMs: Date.now() - started,
    calls: forged.calls,
    checks: [],
    ...(forged.ok && forged.result.rejection && lastPartial?.rejection
      ? { rawRejection: lastPartial.rejection as Rejection }
      : {}),
  };
  run.checks = checksFor(probe, run.result, run.rawRejection);
  const verdict = run.result?.verdict ?? `FAILED ${run.failReason}`;
  const name = run.result?.champion?.name ?? run.result?.rejection?.reason ?? "";
  console.log(
    `${probe.id.padEnd(20)} ${verdict.padEnd(7)} ${(run.totalMs / 1000).toFixed(1).padStart(5)}s  first ${firstPartMs === null ? "  -  " : `${(firstPartMs / 1000).toFixed(1)}s`}  ${name}${run.checks.length ? `  [CHECK: ${run.checks.join("; ")}]` : ""}`,
  );
  return run;
}

async function runAll(probes: readonly Probe[]): Promise<void> {
  const queue = [...probes];
  await Promise.all(
    Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
      for (let probe = queue.shift(); probe; probe = queue.shift()) {
        results.set(probe.id, await runProbe(probe));
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}
const sec = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "-");

function championLines(champion: Champion): string[] {
  const parts = champion.parts
    .map(
      (part) =>
        `${part.id}(${part.role} ${part.shape} ${part.size}${part.elongation === "normal" ? "" : ` ${part.elongation}`}${part.parent ? ` on ${part.parent}.${part.anchor}` : ""} ${part.color}${part.mirror ? " x2" : ""})`,
    )
    .join(" ");
  return [
    `  **${champion.name}** - ${champion.bodyPlan}, legs ${legCount(champion)}, arms ${armParts(champion)}, item ${champion.item ?? "none"}, ${champion.parts.length} parts`,
    `  bio: ${champion.bio}`,
    `  stats: heft ${champion.stats.heft} / reach ${champion.stats.reach} / chaos ${champion.stats.chaos}; traits: ${champion.traits.join(", ")}; face: ${champion.face.eyes}/${champion.face.mouth}; palette: ${champion.palette.primary}, ${champion.palette.secondary}, ${champion.palette.accent}`,
    `  moves: ${champion.moves.map((move) => `${move.name} (${move.type} ${move.power}, ${move.delivery})`).join("; ")}`,
    `  parts: ${parts}`,
    ...(champion.markings?.length
      ? [`  markings: ${champion.markings.map((marking) => `${marking.kind} on ${marking.part} (${marking.color})`).join(", ")}`]
      : []),
    `  walkOn: ${champion.narration.walkOn.join(" | ")}`,
    `  landHit: ${champion.narration.landHit.join(" | ")}`,
    `  win: ${champion.narration.win.join(" | ")}`,
  ];
}

/** OKLab lightness of a toy colour (0 black to 1 white). */
function oklabL(color: ToyColor): number {
  const hex = TOY_COLOR_VALUES[color].hex;
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const UPRIGHT_PLANS = new Set(["BIPED", "HOPPER"]);

/**
 * The recognizability audit over the forged sheets:
 * - parts covering the face: anything on the face part's front but one horn,
 *   or an item on a head's front;
 * - different roles sharing a parent and anchor. Same-role copies fan out and
 *   are allowed; so is a tail plus one centred part on an upright torso's back
 *   (the skeleton puts the tail on the lower back). Ears under a hat count;
 * - stubby legs, masks lighter than their part (OKLab L), bellies in the
 *   accent slot, mirrored side boxes that are not wings, second heads whose
 *   face parts differ from the first, champions at 3/3/3 stats;
 * - size S and spike parts, and which champions carry markings;
 * - every upgrade unchanged by preserveUpgrade (the carry-over is idempotent)
 *   and its palette against its base.
 */
function sheetAudit(runs: readonly ProbeRun[]): string[] {
  const forged = runs.filter((run) => run.result?.champion).map((run) => [run.id, run.result!.champion!] as const);
  let parts = 0;
  let small = 0;
  let spikes = 0;
  let legs = 0;
  let stubbyLegs = 0;
  let masks = 0;
  let bellies = 0;
  let flat = 0;
  const faceHits: string[] = [];
  const shared: string[] = [];
  const marked: string[] = [];
  const lightMasks: string[] = [];
  const accentBellies: string[] = [];
  const sideBoxes: string[] = [];
  const headMismatch: string[] = [];
  const multiHead: string[] = [];
  for (const [id, champion] of forged) {
    parts += champion.parts.length;
    small += champion.parts.filter((part) => part.size === "S").length;
    spikes += champion.parts.filter((part) => part.role === "spike").length;
    const legParts = champion.parts.filter((part) => part.role === "leg");
    legs += legParts.length;
    stubbyLegs += legParts.filter((part) => part.elongation === "stubby").length;
    const { heft, reach, chaos } = champion.stats;
    if (heft === 3 && reach === 3 && chaos === 3) flat += 1;
    const headParents = new Set(champion.parts.filter((part) => part.role === "head").map((part) => part.parent));
    const face =
      champion.parts.find((part) => part.role === "head" && !headParents.has(part.id)) ??
      champion.parts.find((part) => part.role === "torso");
    const torso = champion.parts.find((part) => part.role === "torso");
    const byId = new Map(champion.parts.map((part) => [part.id, part]));
    const roleOf = new Map(champion.parts.map((part) => [part.id, part.role]));
    const onFace = champion.parts.filter((part) => face && part.parent === face.id && part.anchor === "front");
    const covering = onFace.filter((part, index) => part.role !== "horn" || onFace.slice(0, index).some((p) => p.role === "horn"));
    const headItems = champion.parts.filter(
      (part) => part.role === "item" && part.anchor === "front" && roleOf.get(part.parent ?? "") === "head" && part.parent !== face?.id,
    );
    for (const part of [...covering, ...headItems]) faceHits.push(`${id}: ${part.id} (${part.role} ${part.shape})`);
    const groups = new Map<string, Champion["parts"]>();
    for (const part of champion.parts) {
      if (!part.parent) continue;
      const key = `${part.parent}.${part.anchor}`;
      groups.set(key, [...(groups.get(key) ?? []), part]);
    }
    const upright = UPRIGHT_PLANS.has(champion.bodyPlan) || torso?.shape === "sphere";
    for (const [key, group] of groups) {
      if (new Set(group.map((part) => part.role)).size < 2) continue;
      const others = group.filter((part) => part.role !== "tail");
      const tailAndGear =
        upright && key === `${torso?.id}.back` && others.length === 1 && !others[0]!.mirror;
      if (tailAndGear) continue;
      shared.push(`${id}: ${key} (${group.map((part) => `${part.id} ${part.role}${part.mirror ? " x2" : ""}`).join(", ")})`);
    }
    for (const marking of champion.markings ?? []) {
      const part = byId.get(marking.part);
      if (!part) continue;
      if (marking.kind === "mask") {
        masks += 1;
        const paint = oklabL(champion.palette[marking.color]);
        const skin = oklabL(champion.palette[part.color]);
        if (paint >= skin) lightMasks.push(`${id} (${champion.palette[marking.color]} on ${champion.palette[part.color]})`);
      }
      if (marking.kind === "belly") {
        bellies += 1;
        if (marking.color === "accent") accentBellies.push(`${id} (${champion.palette.accent})`);
      }
    }
    for (const part of champion.parts) {
      if (part.parent !== torso?.id || !part.mirror || part.role === "wing") continue;
      if ((part.anchor === "left" || part.anchor === "right") && part.shape === "box") {
        sideBoxes.push(`${id}: ${part.id} (${part.role} box ${part.size})`);
      }
    }
    const ends = champion.parts.filter((part) => part.role === "head" && !headParents.has(part.id));
    if (ends.length > 1) {
      const faceParts = (headId: string) =>
        champion.parts
          .filter((part) => part.parent === headId && part.role !== "head")
          .map((part) => `${part.role} ${part.shape} ${part.color}${part.mirror ? " x2" : ""}`)
          .sort()
          .join(", ");
      const sets = ends.map((end) => `${end.id}: ${faceParts(end.id) || "nothing"}`);
      multiHead.push(`${id} (${sets.join(" / ")})`);
      if (new Set(ends.map((end) => faceParts(end.id))).size > 1) headMismatch.push(id);
    }
    if (champion.markings?.length) {
      marked.push(`${id} (${champion.markings.map((marking) => `${marking.kind} on ${marking.part}`).join(", ")})`);
    }
  }
  const upgrades = runs
    .filter((run) => run.kind.startsWith("upgrade") && run.result?.champion)
    .map((run) => {
      const probe = PROBES.find((candidate) => candidate.id === run.id)!;
      const base = results.get(probe.base!)?.result?.champion;
      const champion = run.result!.champion!;
      if (!base) return `${run.id}: no base`;
      const again = preserveUpgrade(base, champion, probe.addition ?? "");
      const idempotent = JSON.stringify(again) === JSON.stringify(champion);
      const slots = (["primary", "secondary", "accent"] as const).filter((slot) => base.palette[slot] !== champion.palette[slot]);
      const baseIds = new Set(base.parts.map((part) => part.id));
      const added = champion.parts.filter((part) => !baseIds.has(part.id)).map((part) => part.id);
      return `${run.id}: ${idempotent ? "unchanged by preserveUpgrade" : "CHANGED by preserveUpgrade"}; palette ${slots.length ? `changed ${slots.map((slot) => `${slot} ${base.palette[slot]}->${champion.palette[slot]}`).join(", ")}` : "kept"}; added ${added.join(", ") || "nothing"}`;
    });
  const crab = forged.find(([id]) => id === "d-crab-three")?.[1];
  const pct = (count: number, of = parts) => `${count} (${of ? ((100 * count) / of).toFixed(1) : "0"}%)`;
  return [
    `## Sheet audit (${forged.length} champions, ${parts} parts)`,
    "",
    `- size S: ${pct(small)}; spike role: ${pct(spikes)}`,
    `- stubby legs: ${pct(stubbyLegs, legs)} of ${legs} leg parts`,
    `- masks lighter than their part: ${lightMasks.length} of ${masks}${lightMasks.length ? ` (${lightMasks.join("; ")})` : ""}`,
    `- bellies in the accent slot: ${accentBellies.length} of ${bellies}${accentBellies.length ? ` (${accentBellies.join("; ")})` : ""}`,
    `- mirrored side boxes that are not wings: ${sideBoxes.length}${sideBoxes.length ? ` (${sideBoxes.join("; ")})` : ""}`,
    `- multi-head sheets: ${multiHead.length}, face parts differ on ${headMismatch.length}${multiHead.length ? ` (${multiHead.join("; ")})` : ""}`,
    `- d-crab-three suit marking: ${crab ? (crab.markings?.some((marking) => marking.kind === "suit") ? "yes" : "no") : "not forged"}`,
    `- face-covering parts: ${faceHits.length}${faceHits.length ? ` (${faceHits.join("; ")})` : ""}`,
    `- different roles sharing a parent and anchor: ${shared.length}${shared.length ? ` (${shared.join("; ")})` : ""}`,
    `- stats at 3/3/3: ${pct(flat, forged.length)} of ${forged.length} champions`,
    `- champions with markings: ${marked.length}${marked.length ? ` (${marked.join("; ")})` : ""}`,
    ...(upgrades.length ? ["- upgrades:", ...upgrades.map((line) => `  - ${line}`)] : []),
    "",
  ];
}

function summary(runs: readonly ProbeRun[]): string {
  const forgedFirst = runs.filter((run) => run.firstPartMs !== null).map((run) => run.firstPartMs!);
  const totals = runs.filter((run) => run.calls.length > 0).map((run) => run.totalMs);
  const single = runs.filter((run) => run.calls.length === 1 && run.ok).map((run) => run.totalMs);
  const calls = runs.flatMap((run) => run.calls);
  const tokens = (pick: (call: AiCallRecord) => number) => calls.reduce((sum, call) => sum + pick(call), 0);
  // The call whose reply was used: the first call, or the repair or fallback after it.
  const firstCalls = runs.map((run) => run.calls.at(-1)).filter((call): call is AiCallRecord => Boolean(call));
  const rejections = runs.filter((run) => run.rawRejection);
  const overlong = rejections.flatMap((run) =>
    Object.entries(run.rawRejection!)
      .filter(([, text]) => text.length > REJECTION_TEXT_MAX)
      .map(([field, text]) => `${run.id} ${field} ${text.length}`),
  );
  const out = [
    `# SlopFight forge probe`,
    "",
    `Model: anthropic/claude-haiku-5.5 at reasoning "high" through the Vercel AI Gateway (fallback anthropic/claude-sonnet-5.5 at "medium"), streamed with the production prompts. Concurrency ${CONCURRENCY}. ${new Date().toISOString()}.`,
    "",
    `## Latency (${runs.length} inputs)`,
    "",
    `| measure | p50 | p90 | max |`,
    `|---|---|---|---|`,
    `| first part (stream to first growable part) | ${sec(percentile(forgedFirst, 50))} | ${sec(percentile(forgedFirst, 90))} | ${sec(Math.max(...forgedFirst))} |`,
    `| total, single-call forges | ${sec(percentile(single, 50))} | ${sec(percentile(single, 90))} | ${sec(Math.max(...single))} |`,
    `| total, all inputs (repairs and fallbacks included) | ${sec(percentile(totals, 50))} | ${sec(percentile(totals, 90))} | ${sec(Math.max(...totals))} |`,
    "",
    `Calls: ${calls.length} (${calls.filter((call) => call.task === "slopfight.forgeFallback").length} Sonnet fallbacks, ${runs.filter((run) => run.calls.filter((call) => call.task === "slopfight.forge").length > 1).length} repairs). Tokens: ${tokens((call) => call.usage.inputTokens)} in (${tokens((call) => call.usage.cacheReadTokens)} cache reads, ${tokens((call) => call.usage.cacheWriteTokens)} cache writes), ${tokens((call) => call.usage.outputTokens)} out (${tokens((call) => call.usage.reasoningTokens)} thinking). Estimated cost $${tokens((call) => call.usage.costUsd).toFixed(4)}.`,
    `Output tokens of the call whose reply was used: p50 ${percentile(firstCalls.map((call) => call.usage.outputTokens), 50)}, p90 ${percentile(firstCalls.map((call) => call.usage.outputTokens), 90)}, max ${Math.max(...firstCalls.map((call) => call.usage.outputTokens))}; thinking p50 ${percentile(firstCalls.map((call) => call.usage.reasoningTokens), 50)}, max ${Math.max(...firstCalls.map((call) => call.usage.reasoningTokens))}.`,
    "",
    `Rejections: ${rejections.length}; written over ${REJECTION_TEXT_MAX} characters: ${overlong.length} of ${rejections.length * 2} texts${overlong.length ? ` (${overlong.join(", ")})` : ""}.`,
    "",
    ...sheetAudit(runs),
    `## Checks`,
    "",
    ...(runs.some((run) => run.checks.length > 0)
      ? runs.filter((run) => run.checks.length > 0).map((run) => `- ${run.id}: ${run.checks.join("; ")}`)
      : ["All automatic checks passed (verdicts, leg and arm counts, names)."]),
    "",
    `## Results`,
  ];
  for (const run of runs) {
    out.push("", `### ${run.id} (${run.kind})`, "", `Input: ${run.input}`, "");
    out.push(
      `Verdict: ${run.result?.verdict ?? `FAILED (${run.failReason})`}; first part ${run.firstPartMs === null ? "-" : sec(run.firstPartMs)}; total ${sec(run.totalMs)}; calls: ${describeCalls(run.calls) || "none"}; tokens out ${run.calls.reduce((sum, call) => sum + call.usage.outputTokens, 0)} (thinking ${run.calls.reduce((sum, call) => sum + call.usage.reasoningTokens, 0)})`,
    );
    if (run.result?.rejection) {
      out.push(`  rejection: ${run.result.rejection.reason} / ${run.result.rejection.suggestion}`);
      const raw = run.rawRejection;
      if (raw && (raw.reason !== run.result.rejection.reason || raw.suggestion !== run.result.rejection.suggestion)) {
        out.push(`  as written (${raw.reason.length} / ${raw.suggestion.length} chars): ${raw.reason} / ${raw.suggestion}`);
      }
    }
    if (run.result?.champion) out.push(...championLines(run.result.champion));
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// --calls: house, matchup and recap, once each
// ---------------------------------------------------------------------------

function callLine(call: AiCallRecord): string {
  return `${call.task} ${call.modelId} ${call.ok ? "ok" : call.failReason} ${sec(call.latencyMs)}, out ${call.usage.outputTokens} (thinking ${call.usage.reasoningTokens})`;
}

async function runCalls(): Promise<void> {
  const base = { keys: {}, deadline: null, languageModel } as const;
  const out = ["# SlopFight calls probe", "", `${new Date().toISOString()}. Haiku 5.5 at high through the AI Gateway.`, ""];
  const timed = async <T>(work: () => Promise<T>): Promise<[T, number]> => {
    const start = Date.now();
    const value = await work();
    return [value, Date.now() - start];
  };

  const [house, houseMs] = await timed(() =>
    inventHouseChampions({ ...base, arenas: ARENAS, count: 3, seed: 20261010 }),
  );
  out.push(`## House descriptions (${sec(houseMs)})`, "", ...house.calls.map((call) => `- ${callLine(call)}`), "");
  const descriptions = house.ok ? house.descriptions : [];
  descriptions.forEach((text) => out.push(`- ${text}`));
  const forged = await Promise.all(
    descriptions.map((text) =>
      timed(() => forgeChampion({ ...base, mode: "house", text, arenas: ARENAS })),
    ),
  );
  out.push("", "## House forges", "");
  const champions: Champion[] = [];
  for (const [index, [result, ms]] of forged.entries()) {
    out.push(`### house ${index + 1} (${sec(ms)}; ${result.calls.map(callLine).join("; ")})`, "");
    if (result.ok && result.result.champion) {
      champions.push(result.result.champion);
      out.push(...championLines(result.result.champion), "");
    } else {
      out.push(`  ${result.ok ? "REJECT" : `FAILED (${result.failReason})`}`, "");
    }
  }

  const examples = FORGE_EXAMPLES.map((example) => example.result.champion).filter(
    (champion): champion is NonNullable<typeof champion> => champion !== null,
  );
  const pairs: [Champion, Champion, ArenaId][] = [
    [examples[0]!, examples[2]!, "FLOODED_GARAGE"],
    [champions[0] ?? examples[1]!, champions[1] ?? examples[3]!, "KITCHEN_COUNTER"],
  ];
  out.push("## Matchups", "");
  for (const [a, b, arena] of pairs) {
    const [matchup, ms] = await timed(() => writeMatchup({ ...base, a, b, arena }));
    out.push(`### ${a.name} vs ${b.name} in ${arena} (${sec(ms)}; ${matchup.calls.map(callLine).join("; ")})`, "");
    if (!matchup.ok) {
      out.push(`  FAILED (${matchup.failReason})`, "");
      continue;
    }
    for (const note of matchup.notes) out.push(`- ${note.side} ${note.modifies} ${note.value}: ${note.reason}`);
    out.push(`- walk-ons: ${matchup.walkOn.join(" | ")}`, "");
  }

  out.push("## Recaps", "");
  const recaps = [
    {
      a: examples[0]!,
      b: examples[2]!,
      outcome: { winner: "B", method: "RINGOUT", endMs: 21_300, health: { A: 34, B: 12 }, maxHealth: { A: 110, B: 100 } },
      events: [
        { t: 1_000, kind: "start" },
        { t: 4_100, kind: "hit", side: "A", move: 0, damage: 14, big: false },
        { t: 9_800, kind: "hit", side: "B", move: 1, damage: 31, big: true },
        { t: 15_200, kind: "hazard", side: "A" },
        { t: 20_900, kind: "throw", side: "B" },
        { t: 21_300, kind: "ringout", side: "A" },
      ],
    },
    {
      a: examples[1]!,
      b: examples[3]!,
      outcome: { winner: "A", method: "KO", endMs: 12_800, health: { A: 8, B: 0 }, maxHealth: { A: 100, B: 120 } },
      events: [
        { t: 1_000, kind: "start" },
        { t: 3_000, kind: "hit", side: "B", move: 0, damage: 40, big: true },
        { t: 7_400, kind: "hit", side: "A", move: 2, damage: 22, big: false },
        { t: 12_800, kind: "ko", side: "B" },
      ],
    },
  ] as const;
  for (const recap of recaps) {
    const [line, ms] = await timed(() =>
      writeRecapLine({ ...base, a: recap.a, b: recap.b, outcome: recap.outcome, events: recap.events }),
    );
    out.push(`- ${recap.a.name} vs ${recap.b.name}: ${line.ok ? line.line : `FAILED (${line.failReason})`} (${sec(ms)}; ${line.calls.map(callLine).join("; ")})`);
  }
  writeFileSync(join(OUT, "calls.md"), `${out.join("\n")}\n`);
  console.log(`calls: ${join(OUT, "calls.md")}`);
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
if (CALLS) {
  await runCalls();
  process.exit(0);
}
const selected = ONLY ? PROBES.filter((probe) => ONLY.includes(probe.id) || ONLY.includes(probe.base ?? "")) : PROBES;
const baseProbes = selected.filter((probe) => !probe.base);
const upgradeProbes = selected.filter((probe) => probe.base);
// An upgrade needs its base champion even when only the upgrade was asked for.
for (const probe of upgradeProbes) {
  if (!baseProbes.some((candidate) => candidate.id === probe.base)) {
    baseProbes.push(PROBES.find((candidate) => candidate.id === probe.base)!);
  }
}
const started = Date.now();
await runAll(baseProbes);
await runAll(upgradeProbes);
const runs = selected.map((probe) => results.get(probe.id)!).filter(Boolean);
console.log(`\n${runs.length} probes in ${((Date.now() - started) / 1000).toFixed(0)}s`);

writeFileSync(join(OUT, "results.json"), JSON.stringify(runs, null, 2));
writeFileSync(join(OUT, "summary.md"), summary(runs));
const gallery = runs
  .filter((run) => run.result?.champion)
  .map((run) => ({ id: run.id, input: run.input, kind: run.kind, champion: run.result!.champion! }));
writeFileSync(join(OUT, "gallery.json"), `${JSON.stringify(gallery, null, 2)}\n`);
if (!ONLY && !FORCE_FALLBACK) {
  mkdirSync(join(ROOT, "public", "dev"), { recursive: true });
  writeFileSync(join(ROOT, "public", "dev", "slopfight-probe.json"), `${JSON.stringify(gallery, null, 2)}\n`);
}
console.log(`summary: ${join(OUT, "summary.md")}`);
