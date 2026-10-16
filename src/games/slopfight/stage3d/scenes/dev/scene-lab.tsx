"use client";

// The scene lab: the real stage (StageRoot, every registered scene) inside a
// static room, with a synthetic timeline and a dev feed, so every non-fight
// scene can be watched and screenshotted without a backend.
//
// /dev/slopfight/scenes?
//   fixture=<slopfight fixture id>   any Controller fixture's view (the clock starts at FIXTURE_NOW)
//   scenario=forge                   BUILD with every player drawing/describing, submitting and forging live
//   players=2..4                     (lobby, forge) how many humans
//   arena=garage|kitchen|rooftop     force the arena for the phase's round
//   t=<seconds>                      start this far into the timeline
//   fresh=1                          (fixture) the phase starts at FIXTURE_NOW, so t is seconds into the phase
//   recap=1                          not live (no sounds; the recap's podium)
//   host=0                           (lobby) seen by a guest: "Waiting for the host"
//   then=<fixture id>&switch=<s>     at lab time `switch` seconds, change to that fixture's view
//                                    (its phase starting then): watch a phase change, e.g. START
//                                    from the lobby (window.__sceneLab.canvas is the canvas at load)
//   quality=high|medium|low, debug=1 (read by StageRoot)

import { useEffect, useMemo, useState } from "react";
import { findFixture } from "@/dev/fixtures";
import { FIXTURE_NOW, fixtureView } from "@/dev/fixtures/base";
import { StaticRoomProvider, type RoomView } from "@/room/context";
import type { ArenaId } from "../../../arenas";
import type { Champion } from "../../../sheet";
import type { StageFoundryEntry, StageStrokeRow } from "../../feeds";
import { DevFeedProvider, type DevFeed } from "../../feeds";
import StageRoot from "../../stage-root";
import { LobbyBridge } from "../lobby-bridge";
import { doodleFromChampion, LAB_ROW_STROKES, revealStrokes, sampleFor, syntheticDoneAt, syntheticPartial } from "../dev-feed";
import type { ModeFighter, SlopfightMode } from "../scene-data";

const ARENA_PARAM: Record<string, ArenaId> = { garage: "FLOODED_GARAGE", kitchen: "KITCHEN_COUNTER", rooftop: "ROOFTOP" };

interface LabParams {
  fixture: string | null;
  scenario: string | null;
  players: number;
  arena: ArenaId | null;
  t: number;
  recap: boolean;
  host: boolean;
  fresh: boolean;
  thenFixture: string | null;
  switchAt: number;
}

function readParams(): LabParams {
  const search = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const players = Number(search.get("players") ?? 4);
  return {
    fixture: search.get("fixture"),
    scenario: search.get("scenario"),
    players: Number.isFinite(players) ? Math.max(2, Math.min(4, Math.round(players))) : 4,
    arena: ARENA_PARAM[search.get("arena") ?? ""] ?? null,
    t: Number(search.get("t") ?? 0) || 0,
    recap: search.get("recap") === "1",
    host: search.get("host") !== "0",
    fresh: search.get("fresh") === "1",
    thenFixture: search.get("then"),
    switchAt: Number(search.get("switch") ?? 4) || 4,
  };
}

/** Put `arena` at the phase round's slot in tonight's arenas. */
function withArena(view: RoomView, arena: ArenaId | null): RoomView {
  if (!arena || view.mode.kind !== "SLOPFIGHT") return view;
  const mode = view.mode as SlopfightMode;
  const round = Math.max(1, Math.min(3, view.room.round || 1));
  const others = (["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as ArenaId[]).filter((id) => id !== arena);
  const arenas = [...others];
  arenas.splice(round - 1, 0, arena);
  return { ...view, mode: { ...mode, arenas } as RoomView["mode"] };
}

/** The same view with its phase (start and deadline) moved to start at `at` (default FIXTURE_NOW). */
function restartPhase(view: RoomView, at = FIXTURE_NOW): RoomView {
  const started = view.room.phaseStartedAt;
  if (typeof started !== "number") return { ...view, room: { ...view.room, phaseStartedAt: at } };
  const shift = at - started;
  const deadline = view.room.phaseDeadline;
  return { ...view, room: { ...view.room, phaseStartedAt: FIXTURE_NOW, phaseDeadline: typeof deadline === "number" ? deadline + shift : deadline } };
}

/** Lobby with `players` humans, seen by the host (or by the second player with host=0). */
function lobbyView(players: number, host: boolean): RoomView | null {
  const four = findFixture("slopfight-lobby-four")?.view;
  if (!four) return null;
  const seated = four.players.slice(0, players);
  return fixtureView(seated, { ...four.room }, four.mode, { viewer: host ? seated[0]! : seated[1]! });
}

interface ForgePlan {
  champion: Champion;
  strokes: StageStrokeRow[];
  kind: "DRAW" | "DESCRIBE";
  submitAt: number;
}

/** BUILD where every human draws or describes, submits and forges on a timeline. */
function forgeScenario(players: number, now: number): { view: RoomView; feed: DevFeed } | null {
  const base = findFixture("slopfight-build-four")?.view;
  if (!base || base.mode.kind !== "SLOPFIGHT") return null;
  const mode = base.mode as SlopfightMode;
  const plans: ForgePlan[] = mode.fighters.map((fighter, slot) => {
    const champion = sampleFor(`${fighter.id}:lab`).champion;
    const kind = slot === 1 || slot === 3 ? "DESCRIBE" : "DRAW";
    const strokes = kind === "DRAW" ? doodleFromChampion(champion, slot + 1) : [];
    return { champion, strokes: toRows(fighter.id, strokes), kind, submitAt: FIXTURE_NOW + (5 + slot * 1.6) * 1000 };
  });
  const fighters: ModeFighter[] = mode.fighters.map((fighter, slot) => {
    const plan = plans[slot]!;
    const human = slot < players;
    const ownerId = human ? fighter.ownerId : null;
    const startedAt = human ? plan.submitAt : FIXTURE_NOW - 2_000 + slot * 1_500;
    const doneAt = syntheticDoneAt(plan.champion, startedAt);
    const kind = human ? plan.kind : null;
    if (now < startedAt) {
      return {
        ...fighter,
        ownerId,
        status: kind === "DESCRIBE" ? "DESCRIBING" : "DRAWING",
        inputKind: kind,
        champion: null,
        forge: null,
      };
    }
    const forge = { kind: human ? ("SUBMIT" as const) : ("HOUSE" as const), version: 0, startedAt };
    if (now < doneAt) return { ...fighter, ownerId, status: "FORGING", inputKind: kind, champion: null, forge };
    return { ...fighter, ownerId, status: "READY", inputKind: kind, champion: plan.champion, forge, text: kind === "DESCRIBE" ? plan.champion.bio : null };
  });
  const humans = base.players.slice(0, players);
  const strokes: StageStrokeRow[] = [];
  const foundry: StageFoundryEntry[] = [];
  const typing: Record<string, number> = {};
  fighters.forEach((fighter, slot) => {
    const plan = plans[slot]!;
    if (fighter.inputKind === "DRAW") {
      const drawStart = FIXTURE_NOW;
      const fraction = Math.min(1, Math.max(0, (now - drawStart) / Math.max(1, plan.submitAt - drawStart)));
      const all = plan.strokes.flatMap((row) => row.strokes);
      strokes.push(...toRows(fighter.id, revealStrokes(all, fraction)));
    }
    // Describers type in bursts: a stamp that is fresh, then a pause.
    if (fighter.status === "DESCRIBING") typing[fighter.id] = now - (Math.floor(now / 700) % 3 === 0 ? 4_000 : 200);
    if (fighter.status === "FORGING" && fighter.forge) {
      foundry.push({ id: fighter.id, partial: syntheticPartial(plan.champion, fighter.forge.startedAt, now) });
    }
  });
  const view: RoomView = {
    ...base,
    players: humans,
    room: { ...base.room, phaseStartedAt: FIXTURE_NOW, phaseDeadline: FIXTURE_NOW + 90_000 },
    mode: { ...mode, fighters, doodles: null } as RoomView["mode"],
  };
  return { view, feed: { strokes, foundry, typing } };
}

function toRows(fighterId: string, strokes: readonly StageStrokeRow["strokes"][number][]): StageStrokeRow[] {
  const rows: StageStrokeRow[] = [];
  for (let start = 0; start < strokes.length; start += LAB_ROW_STROKES) {
    rows.push({ fighterId, layer: 0, seq: rows.length, strokes: strokes.slice(start, start + LAB_ROW_STROKES) });
  }
  return rows;
}

export default function SceneLab() {
  const [params] = useState(readParams);
  // The lab clock: FIXTURE_NOW (+ t) at mount, running on.
  const [offset] = useState(() => FIXTURE_NOW + params.t * 1000 - Date.now());
  const [now, setNow] = useState(() => FIXTURE_NOW + params.t * 1000);
  const switchAt = FIXTURE_NOW + params.switchAt * 1000;
  const timed = params.scenario === "forge" || (!!params.thenFixture && now < switchAt);
  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => setNow(Date.now() + offset), 200);
    return () => window.clearInterval(id);
  }, [timed, offset]);

  const switched = !!params.thenFixture && now >= switchAt;
  // The canvas at load, for checking that a phase change keeps it (no remount).
  useEffect(() => {
    if (!params.thenFixture) return;
    const id = window.setTimeout(() => {
      const stage = Array.from(document.querySelectorAll("canvas")).find((canvas) => !canvas.closest(".ambient")) ?? null;
      (window as unknown as { __sceneLab?: unknown }).__sceneLab = { canvas: stage };
    }, 1500);
    return () => window.clearTimeout(id);
  }, [params.thenFixture]);

  const built = useMemo(() => {
    if (switched) {
      const view = findFixture(params.thenFixture!)?.view;
      return view ? { view: restartPhase(view, switchAt), feed: null } : null;
    }
    if (params.scenario === "forge") return forgeScenario(params.players, now);
    if (params.fixture) {
      const view = findFixture(params.fixture)?.view;
      return view ? { view: params.fresh ? restartPhase(view) : view, feed: null } : null;
    }
    const view = lobbyView(params.players, params.host);
    return view ? { view, feed: null } : null;
  }, [params, now, switched, switchAt]);

  if (!built) return <p className="p-4 text-ink-dim">No such fixture or scenario.</p>;
  const view = withArena(built.view, params.arena);
  const content = (
    <LobbyBridge>
      <StageRoot />
    </LobbyBridge>
  );
  return (
    <StaticRoomProvider view={view} capability="fixture" clockOffsetMs={offset} live={!params.recap}>
      {built.feed ? <DevFeedProvider feed={built.feed}>{content}</DevFeedProvider> : content}
    </StaticRoomProvider>
  );
}
