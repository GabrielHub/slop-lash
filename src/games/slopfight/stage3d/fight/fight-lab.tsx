"use client";

// The fight lab (/dev/slopfight/fight): the real FACE_OFF, FIGHT and RESULT
// scenes (stage canvas, arena, creatures, director, kit UI, Voice captions,
// sounds when ?live=1) on a synthetic fight row. The outcome comes from
// `runFight` + the server's `compactOutcome`, exactly what the backend
// stores, so the stage's replay hash check runs for real.
//
//   ?a=<sampleId>&b=<sampleId>&arena=garage|kitchen|rooftop&seed=<n>
//   ?fa=<recipe>&fb=<recipe>  finishes on A's and B's parts ("gold", "arm:metal",
//                             "torso:crystal,head:gold"; see creature/finish-recipes.ts)
//   ?phase=roster|faceoff|fight|result|recap&t=<ms into the phase>
//   ?auto=0          stay in the phase (default: roster -> faceoff -> fight -> result)
//   ?final=1 ?third=1 ?pending=1 (matchup still running) ?coin=1 (decided by seed)
//   ?bets=live|none  (default: a few bets placed, `live` adds one every 1.4 s)
//   ?mismatch=1      (a wrong stored hash: the stage must warn and use the stored outcome)
//   ?live=1 (sounds) ?quality=high|medium|low ?debug=1 ?names=long
//
// window.__fightLab: services, row, outcome, events, go(phase, t),
// freezeAt(simMs), freezeOn(event, afterMs), resume() for scripted screenshots.

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compactOutcome } from "../../../../../convex/slopfight/outcome";
import { ARENA_IDS, type ArenaId } from "../../arenas";
import { FACE_OFF_SECONDS, FIGHT_LEAD_MS, FIGHT_LIMIT_MS, FIGHT_OUTRO_MS, RESULT_SECONDS } from "../../constants";
import { resolveModifiers, type MatchupNote } from "../../modifiers";
import { SAMPLES, sampleById } from "../../samples";
import { scoreFight } from "../../scoring";
import type { Champion } from "../../sheet";
import { loadRapier, runFight, type FightEvent, type FightInput, type FightOutcome } from "../../sim";
import { applyFinishRecipe } from "../creature/finish-recipes";
import type { StageEventName } from "../events";
import { parseQualityParam, type QualityTier } from "../look/quality";
import { useArenaNodes, useCreateStageServices, type StageServices } from "../services";
import { StageCanvas } from "../stage-canvas";
import type { StageInput, StagePhase } from "../stage-input";
import { FightFeedProvider, type FeedPlayer, type FightFeed, type FightRow } from "./feed";
import { StandingFighters } from "./parts";

const ARENA_ALIASES: Record<string, ArenaId> = { garage: "FLOODED_GARAGE", kitchen: "KITCHEN_COUNTER", rooftop: "ROOFTOP" };

type LabPhase = "ROSTER" | "FACE_OFF" | "FIGHT" | "RESULT" | "FINISHED";
const PHASE_PARAM: Record<string, LabPhase> = {
  roster: "ROSTER",
  faceoff: "FACE_OFF",
  fight: "FIGHT",
  result: "RESULT",
  recap: "FINISHED",
};

interface LabParams {
  a: Champion;
  b: Champion;
  arena: ArenaId;
  seed: number;
  phase: LabPhase;
  t: number;
  auto: boolean;
  final: boolean;
  third: boolean;
  pending: boolean;
  coin: boolean;
  bets: "some" | "live" | "none";
  mismatch: boolean;
  live: boolean;
  quality: QualityTier | null;
  debug: boolean;
  /** Long player names (layout checks). */
  longNames: boolean;
}

function championFor(id: string | null, fallback: number): Champion {
  return (id ? sampleById(id)?.champion : null) ?? SAMPLES[fallback]!.champion;
}

function readParams(): LabParams {
  const query = new URLSearchParams(window.location.search);
  const arenaParam = query.get("arena") ?? "garage";
  const arena = ARENA_ALIASES[arenaParam] ?? ((ARENA_IDS as readonly string[]).includes(arenaParam) ? (arenaParam as ArenaId) : "FLOODED_GARAGE");
  const bets = query.get("bets");
  return {
    a: applyFinishRecipe(championFor(query.get("a"), 0), query.get("fa") ?? ""),
    b: applyFinishRecipe(championFor(query.get("b"), 5), query.get("fb") ?? ""),
    arena,
    seed: Number(query.get("seed") ?? 7) >>> 0,
    phase: PHASE_PARAM[query.get("phase") ?? "roster"] ?? "ROSTER",
    t: Math.max(0, Number(query.get("t") ?? 0)),
    auto: query.get("auto") !== "0",
    final: query.get("final") === "1",
    third: query.get("third") === "1",
    pending: query.get("pending") === "1",
    coin: query.get("coin") === "1",
    bets: bets === "live" || bets === "none" ? bets : "some",
    mismatch: query.get("mismatch") === "1",
    live: query.get("live") === "1",
    quality: parseQualityParam(query),
    debug: query.get("debug") === "1",
    longNames: query.get("names") === "long",
  };
}

// ---------------------------------------------------------------------------
// The synthetic room
// ---------------------------------------------------------------------------

/** ?names=long: the longest names a room is likely to see. */
const LONG_NAMES: Record<string, string> = { p1: "Bartholomew", p2: "Maximiliana", p3: "Theodora", p4: "Ruthie-Mae" };

const PLAYERS: FeedPlayer[] = [
  { id: "p1", name: "Gabriel", modelId: null, score: 400 },
  { id: "p2", name: "Mina", modelId: null, score: 300 },
  { id: "p3", name: "Theo", modelId: null, score: 200 },
  { id: "p4", name: "Ruth", modelId: null, score: 100 },
  { id: "p5", name: "Sol", modelId: null, score: 100 },
  { id: "p6", name: "Priya", modelId: null, score: 0 },
];
/** Bettors in the order their bets arrive: [player, side]. */
const BETTORS: Array<[string, "A" | "B"]> = [
  ["p3", "A"],
  ["p4", "B"],
  ["p5", "B"],
  ["p6", "A"],
  ["p1", "B"],
];

const ARENA_PHRASES: Record<ArenaId, { place: string; floor: string }> = {
  FLOODED_GARAGE: { place: "underwater", floor: "wet epoxy" },
  KITCHEN_COUNTER: { place: "near the sink", floor: "greasy counter" },
  ROOFTOP: { place: "in this wind", floor: "windy roof" },
};

/** Plausible matchup notes for any pair (the real ones come from the matchup call). */
function labNotes(a: Champion, b: Champion, arena: ArenaId): MatchupNote[] {
  const phrase = ARENA_PHRASES[arena];
  const clip = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}...` : text);
  const thingA = a.item ? a.item.replace(/_/g, " ") : (a.traits[0] ?? "Style").replace(/_/g, " ");
  return [
    { side: "A", modifies: "strikePower", value: -1, reason: clip(`${capital(thingA)} is useless ${phrase.place}`) },
    { side: "B", modifies: "speed", value: 15, reason: clip(`${b.name} loves a ${phrase.floor}`) },
    { side: "A", modifies: "knockbackTaken", value: 20, reason: clip(`${a.name} is light as a crumb`) },
  ];
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface LabFight {
  input: FightInput;
  raw: FightOutcome;
  stored: ReturnType<typeof compactOutcome>;
  notes: MatchupNote[];
  /** The recap's whole night (phase=recap only): every fight as its own row. */
  night: FightRow[];
}

/** A night of six fights over the three arenas for the recap reel (the lab's pair, sides swapped every other fight). */
const NIGHT: ReadonlyArray<{ arena: ArenaId; seed: number; swap: boolean; round: number; final?: boolean; third?: boolean }> = [
  { arena: "FLOODED_GARAGE", seed: 13, swap: false, round: 1 },
  { arena: "FLOODED_GARAGE", seed: 17, swap: true, round: 1 },
  { arena: "KITCHEN_COUNTER", seed: 6, swap: false, round: 2 },
  { arena: "KITCHEN_COUNTER", seed: 11, swap: true, round: 2 },
  { arena: "ROOFTOP", seed: 25, swap: false, round: 3, third: true },
  { arena: "ROOFTOP", seed: 4, swap: true, round: 3, final: true },
];

function buildNight(R: Parameters<typeof runFight>[0], params: LabParams): FightRow[] {
  const timeline: Timeline = { phase: "FINISHED", phaseStartedAt: Date.now(), startsAt: Date.now() + 1e9, n: 0 };
  return NIGHT.map((entry, index) => {
    const night: LabParams = {
      ...params,
      arena: entry.arena,
      seed: entry.seed,
      a: entry.swap ? params.b : params.a,
      b: entry.swap ? params.a : params.b,
      final: entry.final === true,
      third: entry.third === true,
      coin: false,
      mismatch: false,
    };
    const fight = buildFight(R, night);
    return {
      ...fightRow(fight, night, timeline, 3),
      id: `lab-night-${index}`,
      round: entry.round,
      step: index % 2,
      a: entry.swap ? "fb" : "fa",
      b: entry.swap ? "fa" : "fb",
    };
  });
}

function buildFight(R: Parameters<typeof runFight>[0], params: LabParams): LabFight {
  const notes = labNotes(params.a, params.b, params.arena);
  const input: FightInput = { seed: params.seed, arena: params.arena, a: params.a, b: params.b, notes, limitMs: FIGHT_LIMIT_MS };
  const raw = runFight(R, input);
  const stored = compactOutcome(raw);
  if (params.mismatch) stored.hash = "00000000";
  if (params.coin) stored.decidedBySeed = true;
  return { input, raw, stored, notes, night: [] };
}

interface Timeline {
  phase: LabPhase;
  /** Server (wall) ms the phase started. */
  phaseStartedAt: number;
  /** The sim's t = 0, wall ms (FIGHT and RESULT). */
  startsAt: number;
  n: number;
}

function phaseLengthMs(phase: LabPhase, endMs: number): number {
  switch (phase) {
    case "ROSTER":
      return 1_600;
    case "FACE_OFF":
      return FACE_OFF_SECONDS * 1000;
    case "FIGHT":
      return FIGHT_LEAD_MS + endMs + FIGHT_OUTRO_MS;
    case "RESULT":
      return RESULT_SECONDS * 1000;
    case "FINISHED":
      return Infinity;
  }
}

const NEXT: Record<LabPhase, LabPhase | null> = {
  ROSTER: "FACE_OFF",
  FACE_OFF: "FIGHT",
  FIGHT: "RESULT",
  RESULT: null,
  FINISHED: null,
};

function timelineFor(phase: LabPhase, t: number, endMs: number, n: number, coin: boolean): Timeline {
  const now = Date.now();
  // A seed-decided fight skips FIGHT (the backend goes straight to RESULT).
  const resolved = coin && phase === "FIGHT" ? "RESULT" : phase;
  if (resolved === "FIGHT") {
    // t is sim time: the clock shows serverNow - startsAt.
    const startsAt = now - t;
    return { phase: resolved, phaseStartedAt: startsAt - FIGHT_LEAD_MS, startsAt, n };
  }
  const phaseStartedAt = now - t;
  const startsAt = resolved === "RESULT" ? phaseStartedAt - FIGHT_OUTRO_MS - endMs : phaseStartedAt + 1e9;
  return { phase: resolved, phaseStartedAt, startsAt, n };
}

function fightRow(fight: LabFight, params: LabParams, timeline: Timeline, betCount: number): FightRow {
  const revealed = timeline.phase === "FIGHT" || timeline.phase === "RESULT" || timeline.phase === "FINISHED";
  const placed = BETTORS.slice(0, betCount);
  const bets = {
    A: placed.filter(([, side]) => side === "A").map(([id]) => id),
    B: placed.filter(([, side]) => side === "B").map(([id]) => id),
  };
  const pending = params.pending && timeline.phase === "FACE_OFF";
  const resolved = resolveModifiers(params.a, params.b, params.arena, fight.notes);
  const outcome = params.coin ? { ...fight.stored, events: [], healthTimeline: [], decidedBySeed: true } : fight.stored;
  const awards = scoreFight({
    isFinal: params.final,
    winner: outcome.winner,
    method: outcome.method,
    owners: { A: "p1", B: "p2" },
    bets: placed.map(([playerId, side]) => ({ playerId, side })),
  });
  const methodWords = { KO: "by knockout", RINGOUT: "by ring-out", DECISION: "on points", SUDDEN_DEATH: "in sudden death" } as const;
  const winnerName = outcome.winner === "A" ? params.a.name : params.b.name;
  return {
    id: "lab-fight",
    round: params.final ? 3 : 1,
    step: params.final ? 2 : 1,
    a: "fa",
    b: "fb",
    arena: params.arena,
    limitMs: FIGHT_LIMIT_MS,
    isFinal: params.final,
    isThirdPlace: params.third,
    matchup: pending ? "PENDING" : "READY",
    notes: pending ? [] : fight.notes,
    applied: pending
      ? []
      : resolved.notes.map((applied) => ({
          side: applied.note.side,
          modifies: applied.note.modifies,
          reason: applied.note.reason,
          value: applied.value,
          favors: applied.favors,
          capped: applied.capped,
          dropped: applied.dropped,
        })),
    walkOn: pending ? null : [`${params.a.name} struts in like they own the place`, `${params.b.name} arrives, already annoyed`],
    hype: { A: 0, B: 0 },
    bets,
    seed: revealed ? params.seed : null,
    startsAt: revealed && !params.coin ? timeline.startsAt : null,
    outcome: revealed ? outcome : null,
    decidedBySeed: revealed && params.coin,
    awards: revealed && timeline.phase !== "FIGHT" ? awards : null,
    sheets: timeline.phase === "FINISHED" ? { A: params.a, B: params.b } : null,
    recapLine: revealed ? `${winnerName} won ${methodWords[outcome.method]}.` : null,
  };
}

// ---------------------------------------------------------------------------
// The lab
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __fightLab?: {
      services: StageServices;
      row: FightRow;
      outcome: FightOutcome;
      events: readonly FightEvent[];
      phase: LabPhase;
      go(phase: string, t?: number): void;
      freezeAt(simMs: number): Promise<number>;
      freezeOn(event: StageEventName, afterMs?: number): Promise<number>;
      resume(): void;
      /** Run seeds from `from` (this pair and arena): method, end, first contact, big hits, edges. */
      scan(from: number, count: number): Promise<string[]>;
    };
  }
}

export default function FightLab() {
  const [params] = useState(readParams);
  const [fight, setFight] = useState<LabFight | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadRapier()
      .then((R) => {
        if (!alive) return;
        const fight = buildFight(R, params);
        if (params.phase === "FINISHED") fight.night = buildNight(R, params);
        setFight(fight);
      })
      .catch((reason: unknown) => setError(String(reason)));
    return () => {
      alive = false;
    };
  }, [params]);
  if (error) return <p className="p-4 text-ink">The fight lab failed: {error}</p>;
  if (!fight) return <p className="p-4 text-ink-dim">Running the fight...</p>;
  return <LabStage params={params} fight={fight} />;
}

function LabStage({ params, fight }: { params: LabParams; fight: LabFight }) {
  const services = useCreateStageServices({ quality: params.quality });
  const endMs = fight.stored.endMs;
  const [timeline, setTimeline] = useState<Timeline>(() => timelineFor(params.phase, params.t, endMs, 0, params.coin));
  const [betCount, setBetCount] = useState(params.bets === "none" ? 0 : params.bets === "live" ? 0 : 3);

  const go = useCallback(
    (phase: LabPhase, t = 0) => setTimeline((previous) => timelineFor(phase, t, endMs, previous.n + 1, params.coin)),
    [endMs, params.coin],
  );

  // Auto-advance through the phases on their real lengths.
  useEffect(() => {
    if (!params.auto) return;
    const next = NEXT[timeline.phase];
    if (!next) return;
    const length = phaseLengthMs(timeline.phase, endMs);
    const wait = timeline.phaseStartedAt + length - Date.now();
    const timer = window.setTimeout(() => go(next), Math.max(0, wait));
    return () => window.clearTimeout(timer);
  }, [timeline, params.auto, endMs, go]);

  // Live bets: one more every 1.4 s during the face-off.
  useEffect(() => {
    if (params.bets !== "live" || timeline.phase !== "FACE_OFF") return;
    const timer = window.setInterval(() => setBetCount((count) => Math.min(BETTORS.length, count + 1)), 1_400);
    return () => window.clearInterval(timer);
  }, [params.bets, timeline.phase]);

  useEffect(() => {
    services.voice.setGame(`lab:${params.seed}`);
  }, [services, params.seed]);

  const row = useMemo(() => fightRow(fight, params, timeline, betCount), [fight, params, timeline, betCount]);
  const feed = useMemo<FightFeed>(
    () => ({
      fights: timeline.phase === "FINISHED" && fight.night.length > 0 ? fight.night : [row],
      current: timeline.phase === "FINISHED" ? null : row,
      fighters: [
        { id: "fa", slot: 0, ownerId: "p1", champion: params.a },
        { id: "fb", slot: 1, ownerId: "p2", champion: params.b },
      ],
      players: params.longNames ? PLAYERS.map((player) => ({ ...player, name: LONG_NAMES[player.id] ?? player.name })) : PLAYERS,
      clockOffsetMs: 0,
      live: params.live,
      roomKey: `lab:${params.seed}`,
    }),
    [row, timeline.phase, params, fight.night],
  );
  const input = useMemo<StageInput>(
    () => ({
      phase: timeline.phase as StagePhase,
      phaseKey: `${timeline.phase}:${timeline.n}`,
      arena: params.arena,
      arenaOrder: [params.arena],
      round: row.round,
      step: row.step,
      roomCode: null,
      clockOffsetMs: 0,
      phaseStartedAt: timeline.phaseStartedAt,
      live: params.live,
    }),
    [timeline, params, row.round, row.step],
  );

  const labRef = useRef({ row, timeline });
  labRef.current = { row, timeline };

  return (
    <FightFeedProvider feed={feed}>
      <StageCanvas
        input={input}
        services={services}
        quality={params.quality}
        debug={params.debug}
        overlay={params.debug ? <LabReadout timeline={timeline} row={row} /> : null}
      >
        {timeline.phase === "ROSTER" && <RosterStandIn a={params.a} b={params.b} />}
        <LabBridge services={services} fight={fight} labRef={labRef} go={go} />
      </StageCanvas>
    </FightFeedProvider>
  );
}

/** The roster lead-in: both champions on their roster marks, where FACE_OFF's walk-in starts. */
function RosterStandIn({ a, b }: { a: Champion; b: Champion }) {
  const nodes = useArenaNodes();
  const arena = nodes?.arena ?? "FLOODED_GARAGE";
  return <StandingFighters arena={arena} sheets={{ A: a, B: b }} marks="roster" />;
}

interface Freeze {
  until: (state: { t: number }) => boolean;
  resolve: (t: number) => void;
}

/** Inside the canvas: window.__fightLab, and freezing the frame loop for exact screenshots. */
function LabBridge({
  services,
  fight,
  labRef,
  go,
}: {
  services: StageServices;
  fight: LabFight;
  labRef: React.RefObject<{ row: FightRow; timeline: Timeline }>;
  go: (phase: LabPhase, t?: number) => void;
}) {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const freezes = useRef<Freeze[]>([]);
  // Runs after the frame's render (priority 1): freezing here keeps this frame on screen.
  useFrame(() => {
    if (freezes.current.length === 0) return;
    const t = window.__slopFight?.player.t ?? -1;
    const due = freezes.current.filter((freeze) => freeze.until({ t }));
    if (due.length === 0) return;
    freezes.current = freezes.current.filter((freeze) => !due.includes(freeze));
    setFrameloop("never");
    for (const freeze of due) freeze.resolve(t);
  }, 2);

  useEffect(() => {
    window.__fightLab = {
      services,
      get row() {
        return labRef.current!.row;
      },
      outcome: fight.raw,
      events: fight.raw.events,
      get phase() {
        return labRef.current!.timeline.phase;
      },
      go(phase, t = 0) {
        setFrameloop("always");
        go(PHASE_PARAM[phase] ?? (phase as LabPhase), t);
      },
      freezeAt(simMs) {
        return new Promise((resolve) => freezes.current.push({ until: ({ t }) => t >= simMs, resolve }));
      },
      freezeOn(event, afterMs = 0) {
        return new Promise((resolve) => {
          const off = services.events.on(event, () => {
            off();
            const at = performance.now() + afterMs;
            freezes.current.push({ until: () => performance.now() >= at, resolve });
          });
        });
      },
      resume() {
        setFrameloop("always");
      },
      async scan(from, count) {
        const R = await loadRapier();
        const lines: string[] = [];
        for (let seed = from; seed < from + count; seed += 1) {
          const outcome = runFight(R, { ...fight.input, seed: seed >>> 0 });
          const first = outcome.events.find((event) => event.kind === "contact")?.t ?? -1;
          const big = outcome.events.filter((event) => event.kind === "hit" && event.big).length;
          const edges = outcome.events.filter((event) => event.kind === "edge").length;
          lines.push(`${seed} ${outcome.winner} ${outcome.method} ${(outcome.endMs / 1000).toFixed(1)}s contact ${(first / 1000).toFixed(1)}s big ${big} edge ${edges}`);
        }
        return lines;
      },
    } as NonNullable<Window["__fightLab"]>;
    return () => {
      delete window.__fightLab;
    };
  }, [services, fight, labRef, go, setFrameloop]);
  return null;
}

function LabReadout({ timeline, row }: { timeline: Timeline; row: FightRow }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = window.__slopFight?.player;
      const into = ((Date.now() - timeline.phaseStartedAt) / 1000).toFixed(1);
      setText(
        `${timeline.phase} +${into}s | ${row.outcome ? `${row.outcome.winner} ${row.outcome.method} @${(row.outcome.endMs / 1000).toFixed(1)}s` : "no outcome"}` +
          (player ? ` | sim ${(player.t / 1000).toFixed(2)}s hash ${player.hash}` : ""),
      );
    }, 200);
    return () => window.clearInterval(timer);
  }, [timeline, row]);
  return (
    <div className="pointer-events-none absolute top-[2.25rem] left-[0.5rem] z-10 rounded bg-black/55 px-[0.5rem] py-[0.25rem] font-mono text-[0.75rem] text-white">
      {text}
    </div>
  );
}
