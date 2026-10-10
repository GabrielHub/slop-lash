import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeFrames, PERFORMANCE_LIMITS, validationFailures } from "./report.mjs";

const SERVER_OFFSET = 1_000_000;
const frameTimes = () => Array.from({ length: 5521 }, (_, index) => (index * 1000) / 60);

function recording() {
  const report = {
    phases: [{ status: "FINISHED" }],
    fights: [],
    hashes: {},
    bundles: [
      { ctx: "host", heavy: false },
      { ctx: "guest", heavy: false },
    ],
    mutations: [
      ...Array.from({ length: 2 }, () => ({ fn: "slopfight/play:submitChampion", ok: true })),
      ...Array.from({ length: 3 }, () => ({ fn: "slopfight/play:submitUpgrade", ok: true })),
      ...Array.from({ length: 10 }, () => ({ fn: "slopfight/play:placeBet", ok: true })),
      { fn: "slopfight/play:hype", ok: true },
      { fn: "engine:start", ok: true },
      { fn: "rooms:create", ok: true },
      { fn: "rooms:join", ok: true },
    ],
    console: [],
    network: [],
    captures: [],
    failures: [],
    fps: {
      "build-4-forging": { from: 1000, to: 7000, forging: 4 },
      podium: { from: 85000, to: 91000 },
    },
  };
  const timeline = [];
  for (let index = 0; index < 6; index += 1) {
    const round = Math.floor(index / 2) + 1;
    const step = index % 2;
    const perf = 10_000 + index * 10_000;
    const fight = {
      label: `r${round}s${step}`,
      startsAt: SERVER_OFFSET + perf + 1500,
      endMs: 4000,
      perfEnd: perf + 5500,
      filmed: false,
      hash: `hash-${index}`,
      events: [
        { kind: "contact", t: 1000 },
        { kind: "hit", t: 1100 },
        { kind: "end", t: 4000 },
      ],
    };
    report.fights.push(fight);
    report.hashes[`fight ${round}.${step}`] = { local: fight.hash, match: true };
    timeline.push({
      phase: "FIGHT",
      round,
      step,
      perf: perf + 50,
      server: SERVER_OFFSET + perf + 50,
      phaseStartedAt: SERVER_OFFSET + perf,
    });
  }
  return { report, timeline, frames: frameTimes() };
}

function analyze(fixture) {
  analyzeFrames(fixture.frames, fixture.timeline, fixture.report);
  return fixture.report;
}

function stall(frames, at, duration = 80) {
  return frames.filter((time) => time < at || time > at + duration);
}

describe("SlopFight integration release gate", () => {
  it("accepts six distinct matching fights with complete clean near-60fps evidence", () => {
    const report = analyze(recording());
    assert.deepEqual(validationFailures(report), []);
    assert.deepEqual(report.performanceLimits, PERFORMANCE_LIMITS);
    assert.equal(report.hitches.length, 6);
    assert.partialDeepStrictEqual(report.fps["fight-r1s0"].moments.firstContact, {
      from: 11000,
      to: 14000,
      eventKind: "contact",
      eventMs: 1000,
      complete: true,
      clean: true,
    });
    assert.partialDeepStrictEqual(report.fps["fight-r1s0"].moments.entry, {
      from: 8500,
      to: 11500,
    });
  });

  it("fails when performance evidence is absent even though the game and hashes succeeded", () => {
    const report = analyze(recording());
    report.fps = {};
    report.frameCount = 0;
    const failures = validationFailures(report);
    assert.ok(failures.includes("Missing TV frame recording"));
    assert.ok(failures.includes("Missing forging performance window"));
    assert.ok(failures.includes("podium: missing or incomplete frame samples"));
    assert.ok(failures.includes("r3s1: missing or incomplete frame samples"));
    assert.ok(failures.includes("r3s1 first contact: missing or incomplete frame samples"));
  });

  it("checks throughput and p95 independently and reports the exact rejected data", () => {
    const report = analyze(recording());
    report.fps["build-4-forging"].fps = 57.9;
    report.fps.podium.p95 = 20.01;
    report.fps["fight-r2s1"].fps = 5;
    for (const failure of [
      "build-4-forging: 57.9 fps < 58 fps",
      "podium: p95 20.01 ms > 20 ms",
      "r2s1: 5 fps < 58 fps",
    ])
      assert.ok(validationFailures(report).includes(failure), failure);
  });

  it("accepts the stated tolerance boundary", () => {
    const report = analyze(recording());
    report.fps.podium.fps = 58;
    report.fps.podium.p95 = 20;
    report.fps["fight-r1s0"].moments.entry.max = 50;
    assert.deepEqual(validationFailures(report), []);
  });

  it("rejects a partial sample range and non-finite metrics", () => {
    const fixture = recording();
    fixture.frames = fixture.frames.filter((time) => time < 85000 || time > 86000);
    const report = analyze(fixture);
    report.fps["fight-r1s0"].fps = Number.NaN;
    for (const failure of [
      "podium: missing or incomplete frame samples",
      "r1s0: missing or incomplete frame samples",
    ])
      assert.ok(validationFailures(report).includes(failure), failure);
  });

  it("detects an entry hitch using the phase start rather than the delayed polling time", () => {
    const fixture = recording();
    fixture.frames = stall(fixture.frames, 10000);
    const report = analyze(fixture);
    const entry = report.fps["fight-r1s0"].moments.entry;
    assert.ok(entry.max > 50);
    assert.ok(validationFailures(report).includes(`r1s0 FIGHT entry: max ${entry.max} ms > 50 ms`));
  });

  it("detects a first-contact hitch separately from overall throughput", () => {
    const fixture = recording();
    fixture.frames = stall(fixture.frames, 12500);
    const report = analyze(fixture);
    const fight = report.fps["fight-r1s0"];
    assert.ok(fight.fps >= 58);
    assert.ok(fight.p95 <= 20);
    assert.ok(
      validationFailures(report).includes(
        `r1s0 first contact: max ${fight.moments.firstContact.max} ms > 50 ms`,
      ),
    );
  });

  it("labels capture-related entry hitches without blaming the game", () => {
    const fixture = recording();
    fixture.frames = stall(fixture.frames, 10000);
    fixture.report.captures.push({ from: 9990, to: 10100, kind: "screenshot", label: "title" });
    const report = analyze(fixture);
    const entry = report.fps["fight-r1s0"].moments.entry;
    assert.partialDeepStrictEqual(entry, {
      clean: false,
      captures: [{ kind: "screenshot", label: "title", from: 9990, to: 10100 }],
    });
    assert.equal(report.hitches[0].clean, false);
    assert.ok(entry.max > 50);
    assert.deepEqual(validationFailures(report), []);
  });

  it("requires clean throughput windows and capture timing evidence", () => {
    const fixture = recording();
    fixture.report.captures.push({ from: 1000, to: 1500, kind: "screencast", label: "forge" });
    const report = analyze(fixture);
    assert.ok(
      validationFailures(report).includes(
        "build-4-forging: capture overhead overlaps the required clean performance window",
      ),
    );
    delete report.captures;
    assert.ok(validationFailures(report).includes("Missing capture timing evidence"));
  });

  it("requires at least one measured unfilmed fight and identifies filmed metrics", () => {
    const fixture = recording();
    fixture.frames = stall(fixture.frames, 12500);
    for (const fight of fixture.report.fights) fight.filmed = true;
    const report = analyze(fixture);
    assert.equal(report.fps["fight-r1s0-filmed"].filmed, true);
    assert.deepEqual(validationFailures(report), ["No unfilmed fight performance window"]);
  });

  it("does not treat missing contact evidence as a passing hitch check", () => {
    const fixture = recording();
    fixture.report.fights[0].events = [{ kind: "end", t: 4000 }];
    assert.ok(
      validationFailures(analyze(fixture)).includes(
        "r1s0 first contact: missing or incomplete frame samples",
      ),
    );
  });

  it("retains the fallback event kind when a margin-based hit precedes geometric contact", () => {
    const fixture = recording();
    fixture.report.fights[0].events = [{ kind: "hit", t: 1000 }];
    const report = analyze(fixture);
    assert.equal(report.fps["fight-r1s0"].moments.firstContact.eventKind, "hit");
    assert.deepEqual(validationFailures(report), []);
  });

  it("fails non-aborted network errors while retaining intentional navigation aborts", () => {
    const report = analyze(recording());
    report.network.push(
      { ctx: "tv", status: 404, url: "/models/missing.glb" },
      { ctx: "host", error: "net::ERR_FAILED", url: "/game-data" },
      { ctx: "guest", error: "net::ERR_ABORTED", aborted: true, url: "/navigation" },
    );
    assert.deepEqual(validationFailures(report), [
      "tv: network 404: /models/missing.glb",
      "host: network net::ERR_FAILED: /game-data",
    ]);
  });

  it("keeps functional failures, missing scripts, and duplicate fights blocking", () => {
    const report = analyze(recording());
    report.failures.push("Bet button did not appear");
    report.bundles = [];
    report.fights[5] = report.fights[4];
    report.hashes["fight 1.0"].match = false;
    for (const failure of [
      "Bet button did not appear",
      "Expected 6 distinct fights, recorded 6",
      "r1s0: replay hash missing or mismatched",
      "host: no controller scripts inspected",
      "guest: no controller scripts inspected",
    ])
      assert.ok(validationFailures(report).includes(failure), failure);
  });

  it("fails a completed timer-driven game that never exercised the expected controls", () => {
    const report = analyze(recording());
    report.mutations = [];
    assert.deepEqual(validationFailures(report), [
      "rooms:create: expected at least 1 successful replies, recorded 0",
      "rooms:join: expected at least 1 successful replies, recorded 0",
      "engine:start: expected at least 1 successful replies, recorded 0",
      "slopfight/play:submitChampion: expected at least 2 successful replies, recorded 0",
      "slopfight/play:submitUpgrade: expected at least 3 successful replies, recorded 0",
      "slopfight/play:placeBet: expected at least 10 successful replies, recorded 0",
      "slopfight/play:hype: expected at least 1 successful replies, recorded 0",
    ]);
  });

  it("does not count requests without successful replies toward required interactions", () => {
    const report = analyze(recording());
    report.mutations.find((mutation) => mutation.fn === "slopfight/play:submitChampion").ok = null;
    report.mutations.find((mutation) => mutation.fn === "slopfight/play:submitUpgrade").ok = false;
    report.mutations.find((mutation) => mutation.fn === "slopfight/play:placeBet").ok = null;
    report.mutations.find((mutation) => mutation.fn === "slopfight/play:hype").ok = null;
    const failures = validationFailures(report);
    for (const expected of [
      "slopfight/play:submitChampion: expected at least 2 successful replies, recorded 1",
      "slopfight/play:submitUpgrade: expected at least 3 successful replies, recorded 2",
      "slopfight/play:placeBet: expected at least 10 successful replies, recorded 9",
      "slopfight/play:hype: expected at least 1 successful replies, recorded 0",
    ])
      assert.ok(failures.includes(expected), expected);
  });
});
