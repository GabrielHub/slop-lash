"use client";

// The phase slot. One scene per phase renders inside the persistent canvas;
// the Wave 3 workstreams register theirs in PHASE_SCENES (scenes/registry.ts)
// and until then a placeholder names the phase on the set's marquee.
//
// useStagedPhase (called by the canvas) runs the default direction for every
// phase change: the entry transition (slam, wipe, ...) and, at its covered
// moment, the cut to the phase's base shot and a clock resync (the
// presentation clock absorbs any hit-stop / slow-mo debt on a hard cut). The
// stage keeps showing the phase it is leaving, on the room as it last was,
// until that covered moment, so a scene never pops out before the cover is
// over it. Phases that share a scene (the forge floor) carry it over instead
// of remounting. A registered scene can take over by setting `ownsDirection`
// in its PHASE_DIRECTION entry.

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { StaticRoomProvider, type RoomContextValue } from "@/room/context";
import type { ArenaNodes } from "../arena/nodes";
import { StageBoundary } from "../boundary";
import type { ShotRequest } from "../director/director";
import type { ShotId } from "../director/shots";
import type { TransitionKind } from "../events";
import { feedFromRoom, sheetsOf, useProvidedFightFeed, type FightFeed } from "../fight/feed";
import { useArenaNodes, useStage } from "../services";
import type { StageInput, StagePhase } from "../stage-input";
import { stageSfx } from "../ui3d/sound";
import { fitTextSize, MARQUEE_TEXT, OnPlane, StageText } from "../ui3d/text";
import { PHASE_SCENES } from "./registry";

export interface PhaseSceneProps {
  input: StageInput;
  nodes: ArenaNodes | null;
}

export interface PhaseDirection {
  /** What the marquee says during the phase. */
  marquee: string;
  /** The phase's base shot. */
  shot: ShotId;
  request?: ShotRequest;
  /** The entry transition when the phase changes. */
  enter: Exclude<TransitionKind, "matchCut">;
  /** Slam text (defaults to the marquee). */
  slam?: string;
  /** A slam that reads the fight data (the face-off's names); null falls back to `slam`. */
  slamFor?: (feed: FightFeed | null) => SlamEntry | null;
  /** The podium is up in this phase. */
  showPodium?: boolean;
  /** The registered scene runs its own transitions and shots. */
  ownsDirection?: boolean;
}

export interface SlamEntry {
  text: string;
  sub?: string;
  holdMs?: number;
  shake?: number;
  /** How hard it lands (the slam sound and the crowd), 0..1. */
  hit?: number;
}

export const PHASE_DIRECTION: Record<StagePhase, PhaseDirection> = {
  LOBBY: { marquee: "SLOPFIGHT", shot: "crane_establish", request: { duration: 8 }, enter: "cut" },
  BUILD: { marquee: "BUILD", shot: "easels", enter: "wipe" },
  // The forge floor carries over from Build or Upgrade and turns to the foundry itself.
  FOUNDRY: { marquee: "THE FOUNDRY", shot: "foundry", enter: "cut", ownsDirection: true },
  ROSTER: { marquee: "THE ROSTER", shot: "roster", enter: "wipe" },
  // The names slam in and the champions walk to their marks under it.
  FACE_OFF: { marquee: "FACE-OFF", shot: "face_off_low", request: { side: "A" }, enter: "slam", slamFor: faceOffSlam },
  FIGHT: { marquee: "FIGHT!", shot: "fight_wide", enter: "slam" },
  RESULT: { marquee: "RESULT", shot: "winner_pose", enter: "wipe" },
  STANDINGS: { marquee: "STANDINGS", shot: "scoreboard", enter: "wipe" },
  UPGRADE: { marquee: "UPGRADES", shot: "easels", enter: "wipe" },
  FINISHED: { marquee: "CHAMPION", shot: "podium", enter: "slam", showPodium: true },
};

/** The face-off's slam: who fights (the Final and third place get their own title). */
function faceOffSlam(feed: FightFeed | null): SlamEntry | null {
  const fight = feed?.current;
  if (!feed || !fight) return null;
  const sheets = sheetsOf(feed, fight);
  const names = sheets.A && sheets.B ? `${sheets.A.name} vs ${sheets.B.name}` : undefined;
  const text = fight.isFinal ? "THE FINAL" : fight.isThirdPlace ? "THIRD PLACE" : "FACE-OFF";
  const sub = fight.isFinal && names ? `${names} · double points` : names;
  return { text, sub, holdMs: 900, shake: 0.4, hit: fight.isFinal ? 1 : 0.8 };
}

/** Phases that share one scene: it carries over between them instead of remounting. */
const SCENE_GROUP: Partial<Record<StagePhase, string>> = { BUILD: "FORGE", FOUNDRY: "FORGE", UPGRADE: "FORGE" };
export const sceneGroupOf = (phase: StagePhase): string => SCENE_GROUP[phase] ?? phase;

/** Entries with a covered moment the scene swap can hide under. */
const COVERING: ReadonlySet<TransitionKind> = new Set<TransitionKind>(["slam", "wipe", "iris"]);
/** A phase change waits no longer than this for its cover (a stalled transition). */
const COVER_TIMEOUT_MS = 1_500;

export interface StagedPhase {
  /** The phase on stage: the room's, or the one it is leaving until the entry covers the swap. */
  input: StageInput;
  /** The room as that phase last saw it (null outside a room). */
  room: RoomContextValue | null;
}

/**
 * The phase the stage shows, and the direction of every phase change (see the
 * top of this file). `direct` is off when the caller replaces the phase scene.
 */
export function useStagedPhase(input: StageInput, room: RoomContextValue | null, direct: boolean): StagedPhase {
  const services = useStage();
  const [released, setReleased] = useState(input.phaseKey);
  const holds = (staged: StageInput) => {
    const entry = PHASE_DIRECTION[staged.phase];
    return direct && staged.phaseKey !== released && !entry.ownsDirection && COVERING.has(entry.enter);
  };
  // The last input and room rendered, and what was on stage when the phase
  // changed (kept through a second change before the first one's cover).
  // Adjusted during render: React's "information from previous renders".
  const [last, setLast] = useState<StagedPhase>({ input, room });
  const [leaving, setLeaving] = useState<StagedPhase | null>(null);
  if (last.input !== input || last.room !== room) {
    if (last.input.phaseKey !== input.phaseKey && !holds(last.input)) setLeaving(last);
    setLast({ input, room });
  }
  const held = leaving !== null && holds(input);
  // The fight data the slams read: the lab's, else the live room's.
  const provided = useProvidedFightFeed();
  const latest = useRef({ room, provided });
  useEffect(() => {
    latest.current = { room, provided };
  }, [room, provided]);

  const directed = useRef<{ key: string; phase: StagePhase } | null>(null);
  const { phase, phaseKey } = input;
  useEffect(() => {
    if (!direct || directed.current?.key === phaseKey) return;
    const previous = directed.current;
    directed.current = { key: phaseKey, phase };
    const entry = PHASE_DIRECTION[phase];
    const { director, transitions, clock, voice } = services;
    let done = false;
    const cover = () => {
      // A later phase change took over (its own cover releases the stage).
      if (done || directed.current?.key !== phaseKey) return;
      done = true;
      clock.resync();
      // On the stage's first phase a scene that framed its own base shot (with targets) keeps it.
      if (!entry.ownsDirection && (previous || director.baseShot !== entry.shot)) director.setBase(entry.shot, entry.request ?? {});
      // Live beats still queued belong to the scene going away.
      if (previous && sceneGroupOf(previous.phase) !== sceneGroupOf(phase)) voice.dropQueued();
      setReleased(phaseKey);
    };
    if (!previous || entry.ownsDirection || !COVERING.has(entry.enter)) {
      cover();
      return;
    }
    window.setTimeout(cover, COVER_TIMEOUT_MS);
    switch (entry.enter) {
      case "slam": {
        const { room: liveRoom, provided: feed } = latest.current;
        const slam = entry.slamFor?.(feed ?? (liveRoom ? feedFromRoom(liveRoom) : null)) ?? { text: entry.slam ?? entry.marquee };
        if (slam.hit) {
          stageSfx(services).play("slam", { intensity: slam.hit });
          services.cheer(slam.hit);
        }
        void transitions.play("slam", { text: slam.text, sub: slam.sub, holdMs: slam.holdMs, shake: slam.shake, onCover: cover });
        break;
      }
      case "wipe":
        void transitions.play("wipe", { onCover: cover });
        break;
      case "iris":
        void transitions.play("iris", { target: null, full: true, onCover: cover });
        break;
    }
  }, [services, direct, phase, phaseKey]);

  return held ? leaving : { input, room };
}

/** Provide the staged room to the phase scene (the live room, or the one it is leaving). */
export function StagedRoom({ room, children }: { room: RoomContextValue | null; children: ReactNode }) {
  if (!room) return children;
  return (
    <StaticRoomProvider view={room.view} capability={room.capability} clockOffsetMs={room.clockOffsetMs} live={room.live} run={room.run}>
      {children}
    </StaticRoomProvider>
  );
}

/** The phase's name on the set's marquee, in its own colours. */
export function MarqueeSign({ nodes, text }: { nodes: ArenaNodes | null; text: string }) {
  const plane = nodes?.marqueeText;
  if (!plane) return null;
  const color = plane.textColor ?? "#fff2c2";
  const size = fitTextSize(text, plane.width * 0.88, plane.height * 0.66);
  return (
    <OnPlane plane={plane}>
      {plane.bgColor && (
        <mesh position={[0, 0, -0.006]} receiveShadow>
          <planeGeometry args={[plane.width, plane.height]} />
          <meshStandardMaterial color={plane.bgColor} roughness={0.85} />
        </mesh>
      )}
      <StageText {...MARQUEE_TEXT} size={size} color={color}>
        {text}
      </StageText>
    </OnPlane>
  );
}

/** The scoreboard's resting card: the round and, in the lobby, the room code. */
export function ScoreboardSign({ nodes, lines }: { nodes: ArenaNodes | null; lines: readonly string[] }) {
  const plane = nodes?.scoreboardText;
  if (!plane || lines.length === 0) return null;
  const color = plane.textColor ?? "#f4f0e0";
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
  const size = fitTextSize(longest, plane.width * 0.85, (plane.height * 0.7) / lines.length);
  return (
    <OnPlane plane={plane}>
      {plane.bgColor && (
        <mesh position={[0, 0, -0.006]} receiveShadow>
          <planeGeometry args={[plane.width, plane.height]} />
          <meshStandardMaterial color={plane.bgColor} roughness={0.9} />
        </mesh>
      )}
      <StageText {...MARQUEE_TEXT} size={size} color={color} lineHeight={1.2}>
        {lines.join("\n")}
      </StageText>
    </OnPlane>
  );
}

/** Until a phase's scene lands: the phase on the marquee, the round on the scoreboard. */
export function PlaceholderScene({ input, nodes }: PhaseSceneProps) {
  const lines =
    input.phase === "LOBBY"
      ? input.roomCode
        ? ["JOIN THE FIGHT", `CODE ${input.roomCode}`]
        : ["TONIGHT", "THREE ARENAS"]
      : [`ROUND ${input.round}`];
  return (
    <>
      <MarqueeSign nodes={nodes} text={PHASE_DIRECTION[input.phase].marquee} />
      <ScoreboardSign nodes={nodes} lines={lines} />
    </>
  );
}

export function PhaseScene({ input, children }: { input: StageInput; children?: ReactNode }) {
  const nodes = useArenaNodes();
  const Scene = PHASE_SCENES[input.phase] ?? PlaceholderScene;
  const arena = nodes?.arena ?? "none";
  // A scene that throws drops back to the placeholder instead of taking the
  // canvas down; the next phase (or set) tries the registered scene again.
  return (
    <Suspense fallback={null}>
      <StageBoundary
        label={`${input.phase} scene`}
        resetKey={`${input.phaseKey}:${arena}`}
        fallback={<PlaceholderScene input={input} nodes={nodes} />}
      >
        <Scene key={`${sceneGroupOf(input.phase)}:${arena}`} input={input} nodes={nodes} />
      </StageBoundary>
      {children}
    </Suspense>
  );
}
