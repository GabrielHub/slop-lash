import { writeFileSync } from "node:fs";
import path from "node:path";
import { HITCH_WINDOW_MS, OUT, log } from "./config.mjs";
import { frameStats, framesBetween } from "./browser.mjs";

export const PERFORMANCE_LIMITS = Object.freeze({
  minFps: 58,
  maxP95Ms: 20,
  maxFightHitchMs: 50,
  sampleEdgeToleranceMs: 50,
});

// Two phones build and upgrade once; the guest leaves after round 2's last
// bet. The host then upgrades once more and bets through the Final.
export const REQUIRED_INTERACTIONS = Object.freeze({
  "rooms:create": 1,
  "rooms:join": 1,
  "engine:start": 1,
  "slopfight/play:submitChampion": 2,
  "slopfight/play:submitUpgrade": 3,
  "slopfight/play:placeBet": 10,
  "slopfight/play:hype": 1,
});

function hashFor(report, fight) {
  return report.hashes[`fight ${fight.label.slice(1).replace("s", ".")}`];
}

function fightWindowName(fight) {
  return `fight-${fight.label}${fight.filmed ? "-filmed" : ""}`;
}

/** The actual samples and capture overlap stay beside every reported metric. */
function measure(frames, from, to, report) {
  const selected = framesBetween(frames, from, to);
  const stats = frameStats(selected);
  const captures = (report.captures ?? []).filter(
    (capture) => capture.from <= to && (capture.to ?? Infinity) >= from,
  );
  return {
    from,
    to,
    ...stats,
    complete:
      !!stats &&
      selected[0] - from <= PERFORMANCE_LIMITS.sampleEdgeToleranceMs &&
      to - selected.at(-1) <= PERFORMANCE_LIMITS.sampleEdgeToleranceMs,
    clean: Array.isArray(report.captures) && captures.length === 0,
    captures: captures.map((capture) => ({
      kind: capture.kind,
      label: capture.label,
      from: capture.from,
      to: capture.to,
    })),
  };
}

function sampleFailures(name, sample, { throughput = false, clean = false } = {}) {
  if (
    !sample?.complete ||
    !Number.isFinite(sample.fps) ||
    !Number.isFinite(sample.p95) ||
    !Number.isFinite(sample.max) ||
    !(sample.frames >= 2) ||
    !(sample.seconds > 0)
  ) {
    return [`${name}: missing or incomplete frame samples`];
  }
  if (clean && !sample.clean)
    return [`${name}: capture overhead overlaps the required clean performance window`];
  const failures = [];
  if (throughput && sample.fps < PERFORMANCE_LIMITS.minFps) {
    failures.push(`${name}: ${sample.fps} fps < ${PERFORMANCE_LIMITS.minFps} fps`);
  }
  if (throughput && sample.p95 > PERFORMANCE_LIMITS.maxP95Ms) {
    failures.push(`${name}: p95 ${sample.p95} ms > ${PERFORMANCE_LIMITS.maxP95Ms} ms`);
  }
  return failures;
}

function performanceFailures(report) {
  const failures = [];
  if (!Array.isArray(report.captures)) failures.push("Missing capture timing evidence");
  if (!(report.frameCount >= 3)) failures.push("Missing TV frame recording");
  const forging = Object.entries(report.fps).filter(([name]) => /^build-\d+-forging$/.test(name));
  if (!forging.length) failures.push("Missing forging performance window");
  for (const [name, sample] of forging) {
    failures.push(...sampleFailures(name, sample, { throughput: true, clean: true }));
    if (!(sample.forging >= 2)) failures.push(`${name}: fewer than two fighters were forging`);
  }
  failures.push(...sampleFailures("podium", report.fps.podium, { throughput: true, clean: true }));
  const cleanFights = report.fights.filter((fight) => fight.filmed === false);
  if (!cleanFights.length) failures.push("No unfilmed fight performance window");
  for (const fight of cleanFights) {
    const sample = report.fps[fightWindowName(fight)];
    failures.push(...sampleFailures(fight.label, sample, { throughput: true, clean: true }));
    for (const key of ["entry", "firstContact"]) {
      const moment = sample?.moments?.[key];
      const name = `${fight.label} ${key === "entry" ? "FIGHT entry" : "first contact"}`;
      failures.push(...sampleFailures(name, moment));
      // Capture timing stays in the report. A screenshot/encoder stall is
      // evidence to remeasure, not a game-performance failure.
      if (moment?.complete && moment.clean && moment.max > PERFORMANCE_LIMITS.maxFightHitchMs) {
        failures.push(`${name}: max ${moment.max} ms > ${PERFORMANCE_LIMITS.maxFightHitchMs} ms`);
      }
    }
  }
  return failures;
}

/** A report is a release gate: missing evidence must never count as a pass. */
export function validationFailures(report = log) {
  const failures = [...report.failures, ...performanceFailures(report)];
  if (!report.phases.some((phase) => phase.status === "FINISHED"))
    failures.push("The game did not finish");
  if (report.fights.length !== 6 || new Set(report.fights.map((fight) => fight.label)).size !== 6) {
    failures.push(`Expected 6 distinct fights, recorded ${report.fights.length}`);
  }
  for (const fight of report.fights) {
    const hash = hashFor(report, fight);
    if (!hash?.match || hash.local !== fight.hash)
      failures.push(`${fight.label}: replay hash missing or mismatched`);
  }
  for (const phone of ["host", "guest"]) {
    const scripts = report.bundles.filter((bundle) => bundle.ctx === phone);
    if (!scripts.length) failures.push(`${phone}: no controller scripts inspected`);
    if (scripts.some((bundle) => bundle.heavy))
      failures.push(`${phone}: controller loaded Three.js or Rapier`);
  }
  for (const mutation of report.mutations) {
    if (mutation.ok === false)
      failures.push(`${mutation.ctx}: ${mutation.fn} failed: ${mutation.error}`);
  }
  for (const [fn, required] of Object.entries(REQUIRED_INTERACTIONS)) {
    const succeeded = report.mutations.filter(
      (mutation) => mutation.fn === fn && mutation.ok === true,
    ).length;
    if (succeeded < required) {
      failures.push(
        `${fn}: expected at least ${required} successful replies, recorded ${succeeded}`,
      );
    }
  }
  for (const entry of report.console) {
    if (entry.type === "pageerror" || entry.type === "error")
      failures.push(`${entry.ctx}: ${entry.text}`);
  }
  for (const entry of report.network) {
    if (!entry.aborted)
      failures.push(`${entry.ctx}: network ${entry.status ?? entry.error}: ${entry.url}`);
  }
  return [...new Set(failures)];
}

export function analyzeFrames(frames, timeline, report = log) {
  report.performanceLimits = PERFORMANCE_LIMITS;
  for (const window of Object.values(report.fps)) {
    if (typeof window.from !== "number") continue;
    Object.assign(window, measure(frames, window.from, window.to, report));
  }
  // Fights: the whole fight and its busiest 5 s (the most hits).
  for (const f of report.fights) {
    const change = timeline.find(
      (t) => t.phase === "FIGHT" && t.round === Number(f.label[1]) && t.step === Number(f.label[3]),
    );
    if (!change || typeof f.perfEnd !== "number") continue;
    const perfAtServer = (server) => change.perf + (server - change.server);
    const whole = measure(
      frames,
      perfAtServer(f.startsAt),
      perfAtServer(f.startsAt + f.endMs),
      report,
    );
    let busiest = null;
    for (const e of f.events) {
      const from = f.startsAt + e.t - 1000;
      const count = f.events.filter(
        (x) => (x.kind === "hit" || x.kind === "throw") && x.t >= e.t - 1000 && x.t <= e.t + 4000,
      ).length;
      if (!busiest || count > busiest.count) busiest = { count, from };
    }
    const busy = busiest
      ? measure(frames, perfAtServer(busiest.from), perfAtServer(busiest.from + 5000), report)
      : null;
    const momentAt = (server) =>
      measure(
        frames,
        perfAtServer(server) - HITCH_WINDOW_MS,
        perfAtServer(server) + HITCH_WINDOW_MS,
        report,
      );
    // A margin-based grab/hit can land without a geometric contact event.
    // Retain the exact event kind so fallback evidence is explicit.
    const contact =
      f.events.find((event) => event.kind === "contact") ??
      f.events.find((event) => ["grab", "hit", "throw"].includes(event.kind));
    const entry = momentAt(change.phaseStartedAt);
    const firstContact = contact
      ? { ...momentAt(f.startsAt + contact.t), eventKind: contact.kind, eventMs: contact.t }
      : null;
    report.fps[fightWindowName(f)] = {
      ...whole,
      filmed: f.filmed,
      busiest5s: busy && { hits: busiest.count, ...busy },
      moments: { entry, firstContact },
    };
  }
  // The worst frame around every phase change.
  report.hitches = [];
  for (const change of timeline) {
    const stats = measure(
      frames,
      change.perf - HITCH_WINDOW_MS,
      change.perf + HITCH_WINDOW_MS,
      report,
    );
    report.hitches.push({
      phase: change.phase,
      round: change.round,
      step: change.step,
      status: change.status,
      fighters: change.fighters,
      ...stats,
    });
  }
  report.frameCount = frames.length;
}

export function writeLog() {
  writeFileSync(path.join(OUT, "log.json"), JSON.stringify(log, null, 2));
  const lines = [];
  lines.push(
    `SlopFight E2E ${log.meta.code ?? ""} ${log.meta.startedAt} → ${log.meta.endedAt ?? "?"}`,
  );
  lines.push(`GPU: ${log.meta.gpu ?? "?"}`);
  lines.push(`Required successful replies: ${JSON.stringify(REQUIRED_INTERACTIONS)}`);
  lines.push(
    `Performance gate: ≥${PERFORMANCE_LIMITS.minFps} fps, p95 ≤${PERFORMANCE_LIMITS.maxP95Ms} ms; clean unfilmed FIGHT entry / first contact max ≤${PERFORMANCE_LIMITS.maxFightHitchMs} ms.`,
  );
  lines.push("", "Phases (server time, from the TV's room view):");
  const t0 = log.phases[0]?.server ?? 0;
  for (const p of log.phases) {
    lines.push(
      `  +${((p.server - t0) / 1000).toFixed(1).padStart(6)} s  ${p.status} ${p.phase} r${p.round}s${p.step}  started ${p.phaseStartedAt} deadline ${p.phaseDeadline ?? "-"}  ${p.fighters.join(" ")}`,
    );
  }
  lines.push("", "Mutations and actions sent by the phones:");
  for (const m of log.mutations) {
    lines.push(
      `  ${new Date(m.at).toISOString().slice(11, 23)} ${m.ctx.padEnd(6)} ${m.kind.padEnd(8)} ${m.fn} ${m.ok === null ? "(no reply)" : m.ok ? `ok ${m.ms} ms` : `FAILED ${m.error}`} ${JSON.stringify(m.args).slice(0, 140)}`,
    );
  }
  lines.push("", "Console errors and warnings:");
  for (const c of log.console)
    lines.push(
      `  ${new Date(c.at).toISOString().slice(11, 23)} ${c.ctx} [${c.type}] ${c.text.replace(/\s+/g, " ").slice(0, 300)}`,
    );
  lines.push("", "Network errors:");
  for (const n of log.network)
    lines.push(
      `  ${new Date(n.at).toISOString().slice(11, 23)} ${n.ctx} ${n.status ?? n.error}${n.aborted ? " (aborted)" : ""} ${n.url}`,
    );
  lines.push("", "FPS windows:");
  for (const [name, w] of Object.entries(log.fps)) lines.push(`  ${name}: ${JSON.stringify(w)}`);
  lines.push("", "Worst frame around each phase change (±1.5 s):");
  for (const h of log.hitches)
    lines.push(
      `  ${h.status} ${h.phase} r${h.round}s${h.step}: max ${h.max ?? "missing"} ms, p95 ${h.p95 ?? "missing"} ms, ${h.over33 ?? "?"} frames > 33 ms; ${h.clean ? "clean" : "capture overhead"}, ${h.complete ? "complete" : "incomplete"}  [${h.fighters}]`,
    );
  lines.push("", "Fight hashes (TV replay vs stored):");
  for (const f of log.fights) {
    const check = log.hashes[`fight ${f.label.slice(1).replace("s", ".")}`];
    lines.push(
      `  ${f.label} stored ${f.hash} local ${check?.local ?? "?"} ${check ? (check.match ? "MATCH" : "MISMATCH") : "NOT CHECKED"}`,
    );
  }
  lines.push("", "Notes:", ...log.notes.map((n) => `  ${String(n)}`));
  lines.push("", "Validation failures:", ...(log.failures.length ? log.failures : ["None"]));
  writeFileSync(path.join(OUT, "timeline.txt"), lines.join("\n"));
}

export function summarize() {
  const errors = log.console.filter((c) => c.type !== "warning");
  const failed = log.mutations.filter((m) => m.ok === false);
  const hashes = log.fights.map((f) => log.hashes[`fight ${f.label.slice(1).replace("s", ".")}`]);
  console.log("\n=== summary ===");
  console.log(
    `room ${log.meta.code}, ${log.phases.length} phase changes, ${log.fights.length} fights, ${log.mutations.length} phone mutations (${failed.length} failed)`,
  );
  console.log(
    `console errors ${errors.length}, warnings ${log.console.length - errors.length}, network errors ${log.network.filter((n) => !n.aborted).length} (+${log.network.filter((n) => n.aborted).length} aborted)`,
  );
  console.log(`hashes: ${hashes.filter((h) => h?.match).length}/${log.fights.length} match`);
  console.log(
    `controller bundle checks: ${log.bundles.length} scripts, ${log.bundles.filter((bundle) => bundle.heavy).length} heavy`,
  );
  for (const [name, w] of Object.entries(log.fps))
    if (w.fps)
      console.log(`fps ${name}: ${w.fps} fps, p50 ${w.p50} ms, p95 ${w.p95} ms, max ${w.max} ms`);
  console.log(`evidence: ${OUT}`);
}
