"use client";

// FACE_OFF: the stage slams the title and the names ("FACE-OFF" / "THE
// FINAL", PhaseScene's entry) and this scene opens under it on the
// letterboxed, Dutch-tilted `face_off_low`: both champions walk from their
// roster marks to their face-off marks together while The Voice reads each
// walk-on line (the Final and third place get their call first), the shot
// alternating sides; the arena's hazard card and the matchup notes take the
// spotlight one at a time, big, then land on a wall between the fighters
// ("the Voice is thinking..." while the matchup call runs); each side's ring
// sits on the floor in its phone colour, and every bet arrives as the
// bettor's avatar tossed from the crowd onto the fighter they backed, with
// the count per side. The fighters end on the sim's spawns, so FIGHT starts
// where this ends.

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type Group, type PerspectiveCamera, type Vector3Tuple } from "three";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { buildProxyDef, loadRapier } from "../../sim";
import type { ArenaNodes } from "../arena/nodes";
import { easeOutBack } from "../director/noise";
import { Creature, createDriver, type CreatureDriver } from "../creature/creature";
import type { ShotRequest } from "../director/director";
import type { PhaseSceneProps } from "../scenes/phase-scene";
import { useStage } from "../services";
import { Card, faceZ } from "../ui3d/card";
import { clamp01, easeInOutCubic, easeOutCubic } from "../ui3d/motion";
import { placeOnScreen, screenDepth } from "../ui3d/screen";
import { Chip } from "../ui3d/chips";
import { SIDE_COLORS, UI_COLORS, uiToon } from "../ui3d/materials";
import { stageSfx } from "../ui3d/sound";
import { AvatarToken, FaceCamera } from "../ui3d/tokens";
import { playerName, sheetsOf, useFightFeed, type FightFeed, type FightRow } from "./feed";
import { STAGE_SPECULAR_MIN_LIGHT } from "./fighters";
import { SideMarker } from "./hud";
import { FightMarquee, rosterMarkOf, spawnOf, useBaseShot } from "./parts";
import {
  cardBodySize,
  cardGap,
  cardGrid,
  chainFaceOffLines,
  FACE_OFF_PLAN,
  faceOffLines,
  HAZARD_H,
  HAZARD_W,
  NOTE_H,
  NOTE_W,
  notesOf,
  relevantHazard,
  SIDE_SWAP_S,
  SPOTLIGHT_IN_S,
  SPOTLIGHT_OUT_S,
  spotlightPlan,
  walkAt,
  type CardGap,
  type FaceOffPlan,
  type GapKind,
  type ScreenSpan,
  type WalkPath,
} from "./faceoff-plan";
import { voiceFightOf } from "./voice";

const SIDES: readonly Side[] = ["A", "B"];
const tmpP = new Vector3();
const tmpV = new Vector3();

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** One fighter's size from its sim proxy: standing height and a horizontal half width for screen layout. */
/** A champion's body box in its own frame (x to its side, z forward), from its physics proxy, a little padded. */
function sizeOf(champion: Champion): FighterSize {
  const def = buildProxyDef(champion);
  let minX = -0.1;
  let maxX = 0.1;
  let minZ = -0.1;
  let maxZ = 0.1;
  for (const body of def.bodies) {
    const [hx, , hz] = body.head;
    for (const [x, z] of [
      [hx, hz],
      [hx + body.tip[0], hz + body.tip[2]],
    ] as const) {
      minX = Math.min(minX, x - body.radius);
      maxX = Math.max(maxX, x + body.radius);
      minZ = Math.min(minZ, z - body.radius);
      maxZ = Math.max(maxZ, z + body.radius);
    }
  }
  const pad = 0.06;
  return { height: def.height, box: [minX - pad, maxX + pad, minZ - pad, maxZ + pad] };
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

export function FaceOffScene({ input, nodes }: PhaseSceneProps) {
  const feed = useFightFeed();
  const fight = feed?.current ?? null;
  const sheets = feed && fight ? sheetsOf(feed, fight) : null;
  // Rapier is needed the moment FIGHT starts: load it now.
  useEffect(() => {
    void loadRapier().catch(() => {});
  }, []);
  if (!feed || !fight || !sheets?.A || !sheets.B) return <FaceOffWaiting nodes={nodes} />;
  return (
    <FaceOff key={fight.id} feed={feed} fight={fight} sheets={{ A: sheets.A, B: sheets.B }} phaseStartedAt={input.phaseStartedAt} nodes={nodes} />
  );
}

/** No fight data yet: the marquee and the low face-off framing on the empty marks. */
function FaceOffWaiting({ nodes }: { nodes: ArenaNodes | null }) {
  useBaseShot("face_off_low", { side: "A" });
  return <FightMarquee nodes={nodes} text="FACE-OFF" />;
}

interface FaceOffProps {
  feed: FightFeed;
  fight: FightRow;
  sheets: Record<Side, Champion>;
  phaseStartedAt: number | null;
  nodes: ArenaNodes | null;
}

function FaceOff({ feed, fight, sheets, phaseStartedAt, nodes }: FaceOffProps) {
  const services = useStage();
  const [startedAt] = useState(() => phaseStartedAt ?? services.clock.now);
  const elapsed = useRef(() => (services.clock.now - startedAt) / 1000).current;
  const plan = FACE_OFF_PLAN;
  const [mountedAt] = useState(() => elapsed());
  const arena = fight.arena;

  // Where each fighter enters from and stands.
  const sizes = useMemo(() => ({ A: sizeOf(sheets.A), B: sizeOf(sheets.B) }), [sheets]);
  const heights = useMemo(() => ({ A: sizes.A.height, B: sizes.B.height }), [sizes]);
  const slots = useMemo(() => {
    const slot = (id: string) => feed.fighters.find((fighter) => fighter.id === id)?.slot ?? null;
    return { A: slot(fight.a), B: slot(fight.b) };
  }, [feed.fighters, fight.a, fight.b]);
  const walks = useMemo(() => {
    const out = {} as Record<Side, WalkPath>;
    for (const side of SIDES) {
      const to = spawnOf(arena, side).position;
      const sign = side === "A" ? -1 : 1;
      let from = rosterMarkOf(nodes, slots[side]) ?? ([sign * 2.9, 0, 1.1] as [number, number, number]);
      if (Math.hypot(from[0] - to[0], from[2] - to[2]) < 0.5) from = [to[0] + sign * 1.3, 0, to[2] + 0.9];
      const control: Vector3Tuple = [(from[0] + to[0]) / 2, 0, Math.max(from[2], to[2]) + 0.9];
      out[side] = { from, control, to, window: plan.walk[side], restYaw: spawnOf(arena, side).yaw };
    }
    return out;
  }, [arena, nodes, slots, plan]);

  const drivers = useMemo<Record<Side, CreatureDriver>>(
    () => ({ A: createDriver([...walks.A.from], 0), B: createDriver([...walks.B.from], 0) }),
    // The drivers live for the face-off; walks only change if the set reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const chest = useMemo(() => {
    const point = { A: new Vector3(), B: new Vector3() };
    return {
      A: () => point.A.set(drivers.A.position[0], drivers.A.position[1] + heights.A * 0.55, drivers.A.position[2]),
      B: () => point.B.set(drivers.B.position[0], drivers.B.position[1] + heights.B * 0.55, drivers.B.position[2]),
    };
  }, [drivers, heights]);

  // Where the cards hang this frame (NotesWall lays them out per camera); the low shots focus there.
  const cards = useMemo(() => new Vector3(0, 0.9, 0), []);
  const cardsFocus = useMemo(() => () => cards, [cards]);

  const title = fight.isFinal ? "THE FINAL" : fight.isThirdPlace ? "THIRD PLACE" : "FACE-OFF";
  useFaceOffDirection({ plan, elapsed, chest, cardsFocus });

  // The Voice: as the slam lands, each walk-on line in turn (or the call
  // while the matchup is still out; late walk-ons follow whatever was said).
  const voiced = useRef({ placed: new Set<string>(), endMs: 0 });
  useEffect(() => {
    const voice = services.voice;
    const voiceFight = voiceFightOf(feed, fight);
    if (!voiceFight) return;
    const said = voiced.current;
    const from = Math.max(startedAt + plan.callAt * 1000, said.endMs, services.clock.now + 250);
    const lines = faceOffLines(voice.voice.faceOff(voiceFight), fight.isFinal || fight.isThirdPlace);
    const { timed, endMs } = chainFaceOffLines(lines, said.placed, from);
    if (timed.length > 0) {
      for (const line of timed) said.placed.add(line.key);
      said.endMs = endMs;
      voice.schedule(timed);
    }
    const opening = voice.voice.fightStart(fight);
    if (opening) voice.prefetch([opening]);
    // Once per fight, and again when the walk-on lines arrive with the matchup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, fight.id, fight.walkOn, startedAt, plan]);

  return (
    <>
      <FightMarquee nodes={nodes} text={title} />
      {SIDES.map((side) => (
        <WalkingFighter key={side} champion={sheets[side]} driver={drivers[side]} walk={walks[side]} elapsed={elapsed} seed={side === "A" ? 11 : 23} />
      ))}
      {/* Each side's colour as the phones show it, on the floor under its fighter. */}
      {SIDES.map((side) => (
        <SideMarker key={side} side={side} champion={sheets[side]} arena={arena} root={chest[side]} height={heights[side]} chevron={false} />
      ))}
      {/* Own boundaries: cards and tokens arriving later (with new text) must not hide the walkers. */}
      <Suspense fallback={null}>
        <NotesWall fight={fight} sheets={sheets} plan={plan} mountedAt={mountedAt} elapsed={elapsed} drivers={drivers} sizes={sizes} centre={cards} />
      </Suspense>
      {SIDES.map((side) => (
        <Suspense key={side} fallback={null}>
          <Backers feed={feed} fight={fight} side={side} mark={walks[side].to} nodes={nodes} />
        </Suspense>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

/**
 * The low face-off from the first frame (the stage's slam covers the cut),
 * framing both champions and the cards; once they stand it cuts to the other
 * side's angle every few seconds.
 */
function useFaceOffDirection({
  plan,
  elapsed,
  chest,
  cardsFocus,
}: {
  plan: FaceOffPlan;
  elapsed: () => number;
  chest: Record<Side, () => Vector3>;
  /** The hanging cards' centre: the low shots focus on them, so the notes read. */
  cardsFocus: () => Vector3;
}) {
  const services = useStage();
  const framing = useMemo(
    () => (side: Side): ShotRequest => ({ side, targets: [chest.A, chest.B, cardsFocus], focus: 2 }),
    [chest, cardsFocus],
  );
  const opening = useMemo(() => framing("A"), [framing]);
  const supersede = useBaseShot("face_off_low", opening);
  // The bars close in with the low face-off (not on a late open).
  useEffect(() => {
    if (elapsed() < 1.5) stageSfx(services).play("letterbox", { intensity: 0.6 });
  }, [services, elapsed]);
  const state = useRef({ side: "A" as Side, swapAt: plan.standAt + SIDE_SWAP_S });
  useFrame(() => {
    const t = elapsed();
    const s = state.current;
    if (t < s.swapAt || services.transitions.isPlaying()) return;
    s.side = s.side === "A" ? "B" : "A";
    s.swapAt = t + SIDE_SWAP_S;
    supersede();
    services.director.setBase("face_off_low", framing(s.side));
  }, -40);
}

// ---------------------------------------------------------------------------
// Walk-ons
// ---------------------------------------------------------------------------

function WalkingFighter({
  champion,
  driver,
  walk,
  elapsed,
  seed,
}: {
  champion: Champion;
  driver: CreatureDriver;
  walk: WalkPath;
  elapsed: () => number;
  seed: number;
}) {
  const services = useStage();
  const state = useRef({ arrived: false, smugUntil: 0 });
  useFrame((_, realDelta) => {
    const t = elapsed();
    const s = state.current;
    const u = walkAt(walk, t, tmpP, tmpV);
    driver.position[0] = tmpP.x;
    driver.position[1] = 0;
    driver.position[2] = tmpP.z;
    driver.velocity[0] = tmpV.x;
    driver.velocity[1] = 0;
    driver.velocity[2] = tmpV.z;
    const speed = Math.hypot(tmpV.x, tmpV.z);
    if (u <= 0) {
      // Waiting for its entrance: facing the room.
      driver.yaw = MathUtils.damp(driver.yaw, 0, 6, realDelta);
    } else if (u < 1) {
      if (speed > 0.05) driver.yaw = dampAngle(driver.yaw, Math.atan2(tmpV.x, tmpV.z), 10, realDelta);
    } else {
      driver.yaw = dampAngle(driver.yaw, walk.restYaw, 7, realDelta);
      if (!s.arrived) {
        s.arrived = true;
        s.smugUntil = t + 1.3;
        // Only a fresh arrival makes a sound (not the instant placement of a late open).
        if (t - walk.window[1] < 0.3) stageSfx(services).play("tap", { intensity: 0.5 });
      }
    }
    driver.anim = { locomotion: speed > 0.05 ? "walk" : "stand", speed, intent: s.arrived ? "idle" : "approach" };
    driver.expression = s.arrived && t < s.smugUntil ? "smug" : null;
  }, -45);
  return <Creature champion={champion} driver={driver} seed={seed} specularMinLight={STAGE_SPECULAR_MIN_LIGHT} />;
}

/** Damp an angle along the short way round. */
function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * (1 - Math.exp(-lambda * dt));
}

// ---------------------------------------------------------------------------
// The hazard card and the matchup notes
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** Dev builds: the matchup cards' last layout (screenshots and console pokes). */
    __slopNotes?: { spans: Record<Side, ScreenSpan>; gap: CardGap; scale: number; perScale: number; comfy: number; readable: number };
  }
}

/** Usable NDC heights for the cards: under the top letterbox (0.744) with room for their tilt and bob, above The Voice's caption. */
const CARDS_NDC_TOP = 0.62;
const CARDS_NDC_BOTTOM = -0.34;
/**
 * The two-column grid's on-screen width (NDC, of 2): the narrowest that keeps
 * its body text readable on a TV (about 14 px at 1080p), and a comfortable
 * one. A smaller grid scales these by its width.
 */
const CARDS_READABLE_NDC = 0.45;
const CARDS_COMFY_NDC = 0.7;
const CARDS_MAX_SCALE = 1.05;
const FULL_GRID_WIDTH = cardGrid(2).width;

interface FighterSize {
  height: number;
  /** The body's [minX, maxX, minZ, maxZ] in its own frame (x to its side, z forward). */
  box: readonly [number, number, number, number];
}

const tmpCorner = new Vector3();
const tmpView = new Vector3();
const tmpForward = new Vector3();
const tmpRight = new Vector3();
const tmpUp = new Vector3();
const tmpPoint = new Vector3();

/** A fighter's NDC x span and depth for this camera (its body box, turned to its facing). */
function screenSpan(camera: PerspectiveCamera, driver: CreatureDriver, size: FighterSize): ScreenSpan {
  let minX = Infinity;
  let maxX = -Infinity;
  const [x, y, z] = driver.position;
  // Local z (forward) is (sin yaw, cos yaw) in the world; local x is (cos yaw, -sin yaw).
  const sin = Math.sin(driver.yaw);
  const cos = Math.cos(driver.yaw);
  const [x0, x1, z0, z1] = size.box;
  for (const lx of [x0, x1]) {
    for (const lz of [z0, z1]) {
      for (const dy of [0, 1.05]) {
        tmpCorner.set(x + lx * cos + lz * sin, y + dy * size.height, z - lx * sin + lz * cos);
        tmpView.copy(tmpCorner).applyMatrix4(camera.matrixWorldInverse);
        if (tmpView.z > -0.05) continue;
        tmpCorner.project(camera);
        minX = Math.min(minX, tmpCorner.x);
        maxX = Math.max(maxX, tmpCorner.x);
      }
    }
  }
  tmpView.set(x, y + size.height * 0.5, z).applyMatrix4(camera.matrixWorldInverse);
  const depth = Math.max(0.1, -tmpView.z);
  return minX > maxX ? { minX: 0, maxX: 0, depth } : { minX, maxX, depth };
}

/** A spotlit note is this many view heights wide; the hazard card this wide. */
const SPOT_NOTE_W = 0.62;
const SPOT_HAZARD_W = 0.84;
/** The spotlight's centre: this high (NDC; between the top bar and The Voice's caption)... */
const SPOT_Y_NDC = 0.14;
/** ...and toward the open space between the fighters, at most this far off centre (NDC). */
const SPOT_X_NDC = 0.3;
/** Spotlit cards draw over the set from here (each takes 10), under the caption (950). */
const SPOT_ORDER = 700;
/** After the wall is placed (0.52) and its cards face the camera (0.55), before the slam (0.6). */
const SPOT_PRIORITY = 0.56;

interface WallCard {
  key: string;
  /** Its slot on the wall (grid space). */
  slot: Vector3Tuple;
  width: number;
  height: number;
  accent: string;
  title: string;
  body: string;
  bodySize: number;
  /** Its spotlight [at, until] (phase seconds), or null when it goes straight to the wall (a late open). */
  window: [number, number] | null;
  /** Its fighter (a note slides in from that side of the frame); null for the hazard (drops in). */
  side: Side | null;
  seed: number;
}

const tmpSlot = new Vector3();
const tmpScale = new Vector3();

/**
 * The hazard card and the matchup notes. Each takes the spotlight in turn:
 * slammed in big in the middle of the frame (camera-fixed, over the set,
 * toward the open space between the fighters), held long enough to read
 * (spotlightTimes), then flown onto its slot on the wall: one camera-facing
 * grid hung in the open space between the fighters. Every frame the wall is
 * placed for the camera on air (on the far side of the big foreground
 * fighter of a low face-off shot, between the two when it fits), sized to
 * that gap, and kept under the letterbox and above The Voice's caption. It
 * eases with the slow push and jumps only on a cut. `centre` gets the
 * wall's middle (the shot focuses there).
 */
function NotesWall({
  fight,
  sheets,
  plan,
  mountedAt,
  elapsed,
  drivers,
  sizes,
  centre,
}: {
  fight: FightRow;
  sheets: Record<Side, Champion>;
  plan: FaceOffPlan;
  mountedAt: number;
  elapsed: () => number;
  drivers: Record<Side, CreatureDriver>;
  sizes: Record<Side, FighterSize>;
  centre: Vector3;
}) {
  const services = useStage();
  const hazard = useMemo(() => relevantHazard(fight.arena, sheets.A, sheets.B), [fight.arena, sheets]);
  const notes = useMemo(() => notesOf(fight).slice(0, 4), [fight]);
  const pending = fight.matchup === "PENDING";
  const grid = useMemo(() => cardGrid(pending ? 1 : notes.length), [pending, notes.length]);
  const sfx = stageSfx(services);

  // When the notes were first seen: the mount, or the moment the matchup call finished.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const notesSeenAt = useMemo(() => Math.max(mountedAt, elapsed()), [pending]);
  const cards = useMemo<WallCard[]>(() => {
    // The hazard right after the slam; the notes with it, or once they are in (the matchup call can finish mid-face-off).
    const windows = spotlightPlan(
      hazard ? `${hazard.title} ${hazard.card}` : null,
      pending ? null : notes.map((note) => `${sheets[note.side].name} ${note.line}`),
      plan.cardsAt,
      notesSeenAt,
    );
    const out: WallCard[] = [];
    if (hazard) {
      out.push({
        key: "hazard",
        slot: grid.hazard,
        width: HAZARD_W,
        height: HAZARD_H,
        // The house's plum, like The Voice: teal and gold always mean a side.
        accent: UI_COLORS.plum,
        title: hazard.title,
        body: hazard.card,
        bodySize: cardBodySize(hazard.card, HAZARD_W, HAZARD_H, 0.056),
        window: windows.hazard,
        side: null,
        seed: 3,
      });
    }
    notes.forEach((note, index) => {
      const window = windows.notes[index];
      if (!window) return;
      out.push({
        key: note.key,
        slot: grid.notes[index]!,
        width: NOTE_W,
        height: NOTE_H,
        accent: SIDE_COLORS[note.side],
        title: sheets[note.side].name,
        body: note.line,
        bodySize: cardBodySize(note.line, NOTE_W, NOTE_H, 0.058),
        window,
        side: note.side,
        seed: 7 + index,
      });
    });
    // A spotlight already over when the wall mounted (a late open): straight to the wall.
    for (const card of out) if (card.window && card.window[1] + SPOTLIGHT_OUT_S <= mountedAt) card.window = null;
    return out;
  }, [hazard, pending, notes, notesSeenAt, mountedAt, grid, sheets, plan.cardsAt]);
  const hazardWindow = cards[0]?.key === "hazard" ? cards[0].window : null;
  const hazardLands = hazardWindow ? hazardWindow[1] + SPOTLIGHT_OUT_S : plan.cardsAt;
  // When a card shows on the wall: as its spotlight lands (keyed by that, so a re-planned window remounts it), else (a late open) in a quick stagger.
  const landsAt = (card: WallCard) => (card.window ? card.window[1] + SPOTLIGHT_OUT_S : null);
  const wallDelay = (card: WallCard, index: number) => {
    const lands = landsAt(card);
    return lands !== null ? Math.max(0, lands - elapsed()) : 0.15 * index;
  };

  const layout = useRef<Group>(null);
  const spotRoot = useRef<Group>(null);
  const spots = useRef<Record<string, Group | null>>({});
  const slots = useRef<Record<string, Group | null>>({});
  const placed = useRef({ snap: true, position: new Vector3(), yaw: 0, scale: 1, kind: null as GapKind | null, gapX: 0, spotX: 0, spotSnap: true });
  const beats = useRef(new Map<string, { in: boolean; landed: boolean }>());
  // Which side of the wall each fighter is on screen (notes slide in from their fighter's side).
  const sideOf = useRef<Record<Side, number>>({ A: -1, B: 1 });
  useEffect(
    () =>
      services.events.on("cut", () => {
        placed.current.snap = true;
        placed.current.spotSnap = true;
        placed.current.kind = null;
      }),
    [services],
  );
  useFrame((state, realDelta) => {
    const node = layout.current;
    if (!node) return;
    const camera = state.camera as PerspectiveCamera;
    const spans = { A: screenSpan(camera, drivers.A, sizes.A), B: screenSpan(camera, drivers.B, sizes.B) };
    const tanH = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const aspect = camera.aspect || 16 / 9;
    const depth = MathUtils.clamp((spans.A.depth + spans.B.depth) / 2, 1.5, 14);
    // The grid's NDC width at scale 1, and the sizes it may take on screen.
    const perScale = grid.width / (depth * tanH * aspect);
    const share = grid.width / FULL_GRID_WIDTH;
    const readable = CARDS_READABLE_NDC * share;
    const comfy = Math.max(readable, Math.min(perScale * CARDS_MAX_SCALE, CARDS_COMFY_NDC * share));
    // Between the fighters (or beyond the far one) at a comfortable size, else shrunk to fit there, before covering the far fighter.
    const gap = cardGap(spans.A, spans.B, comfy, readable / 0.94, placed.current.kind);
    placed.current.kind = gap.kind;
    const fitV = ((CARDS_NDC_TOP - CARDS_NDC_BOTTOM) * depth * tanH) / grid.height;
    const minScale = Math.min(CARDS_MAX_SCALE, readable / perScale);
    const scale = Math.min(fitV, MathUtils.clamp(((gap.to - gap.from) * 0.94) / perScale, minScale, CARDS_MAX_SCALE));
    const cx = (gap.from + gap.to) / 2;
    const cy = (CARDS_NDC_TOP + CARDS_NDC_BOTTOM) / 2;
    if (process.env.NODE_ENV !== "production") window.__slopNotes = { spans, gap, scale, perScale, comfy, readable };
    camera.getWorldDirection(tmpForward);
    tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    tmpPoint
      .copy(camera.position)
      .addScaledVector(tmpForward, depth)
      .addScaledVector(tmpRight, cx * depth * tanH * aspect)
      .addScaledVector(tmpUp, cy * depth * tanH);
    centre.copy(tmpPoint);
    const yaw = Math.atan2(camera.position.x - tmpPoint.x, camera.position.z - tmpPoint.z);
    tmpPoint.y -= grid.centreY * scale;
    const p = placed.current;
    const ease = p.snap ? 1 : 1 - Math.exp(-realDelta * 5);
    p.snap = false;
    p.position.lerp(tmpPoint, ease);
    p.yaw += shortAngle(yaw - p.yaw) * ease;
    p.scale += (scale - p.scale) * ease;
    p.gapX = cx;
    node.position.copy(p.position);
    node.rotation.set(0, p.yaw, 0);
    node.scale.setScalar(p.scale);
    for (const side of SIDES) sideOf.current[side] = (spans[side].minX + spans[side].maxX) / 2 >= cx ? 1 : -1;
  }, 0.52);

  // The spotlight: camera-fixed (1 unit = the view height), each card slammed in, held, then flown onto its slot.
  useFrame((state, realDelta) => {
    const root = spotRoot.current;
    if (!root) return;
    const camera = state.camera as PerspectiveCamera;
    const t = elapsed();
    placeOnScreen(root, camera, screenDepth(camera, services.fx));
    const aspect = camera.aspect || 16 / 9;
    const tanH = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const p = placed.current;
    const spotX = (MathUtils.clamp(p.gapX, -SPOT_X_NDC, SPOT_X_NDC) * aspect) / 2;
    p.spotX = p.spotSnap ? spotX : MathUtils.damp(p.spotX, spotX, 6, realDelta);
    p.spotSnap = false;
    const spotY = SPOT_Y_NDC / 2;
    for (const card of cards) {
      const node = spots.current[card.key];
      if (!node) continue;
      const window = card.window;
      if (!window || t < window[0] || t >= window[1] + SPOTLIGHT_OUT_S) {
        node.visible = false;
        continue;
      }
      node.visible = true;
      const [at, until] = window;
      const big = (card.side ? SPOT_NOTE_W : SPOT_HAZARD_W) / card.width;
      let beat = beats.current.get(card.key);
      if (!beat) {
        beat = { in: false, landed: false };
        beats.current.set(card.key, beat);
      }
      if (t < until) {
        // Slam in: from its fighter's side (the hazard from above), big, smashing down to size with a little overshoot.
        const k = clamp01((t - at) / SPOTLIGHT_IN_S);
        const slide = 1 - easeOutCubic(k);
        const from = card.side ? sideOf.current[card.side] : 0;
        node.position.set(p.spotX + from * 0.55 * slide, spotY + (card.side ? 0 : 0.3 * slide), 0);
        node.scale.setScalar(big * (1 + 0.45 * (1 - easeOutBack(k, 2.2))));
        node.rotation.set(0, 0, -0.05 * from * slide + 0.012 * Math.sin(t * 1.7 + card.seed));
        if (!beat.in) {
          beat.in = true;
          sfx.play("tap", { intensity: 0.7, gain: 0.7 });
          sfx.play("trickWhiff", { intensity: 0.3, gain: 0.4 });
        }
        continue;
      }
      // Fly onto its slot: where the wall's card shows on screen now, at its size there.
      const slot = slots.current[card.key];
      const k = easeInOutCubic(clamp01((t - until) / SPOTLIGHT_OUT_S));
      let tx = p.spotX;
      let ty = spotY;
      let ts = big;
      if (slot) {
        const world = slot.getWorldScale(tmpScale).x;
        slot.getWorldPosition(tmpSlot).applyMatrix4(camera.matrixWorldInverse);
        const unit = 1 / (2 * Math.max(0.2, -tmpSlot.z) * tanH);
        tx = tmpSlot.x * unit;
        ty = tmpSlot.y * unit;
        ts = world * unit;
      }
      node.position.set(MathUtils.lerp(p.spotX, tx, k), MathUtils.lerp(spotY, ty, k) + Math.sin(Math.PI * k) * 0.04, 0);
      node.scale.setScalar(MathUtils.lerp(big, ts, k));
      node.rotation.set(0, 0, 0.04 * Math.sin(Math.PI * k));
      if (!beat.landed && k >= 0.98) {
        beat.landed = true;
        sfx.play("confirm", { intensity: 0.5, gain: 0.65 });
      }
    }
  }, SPOT_PRIORITY);

  return (
    <>
      <group ref={layout} name="matchup-cards">
        {cards.map((card, index) => (
          <group
            key={`${card.key}@${landsAt(card)?.toFixed(2) ?? "late"}`}
            position={card.slot}
            ref={(group) => {
              slots.current[card.key] = group;
            }}
          >
            <FaceCamera amount={0.4}>
              <Card
                width={card.width}
                height={card.height}
                accent={card.accent}
                title={card.title}
                body={card.body}
                bodySize={card.bodySize}
                enter={card.window ? "none" : "pop"}
                delay={wallDelay(card, index)}
                seed={card.seed}
                sound={!card.window}
              />
            </FaceCamera>
          </group>
        ))}
        <FaceCamera position={grid.thinking} amount={0.4}>
          <ThinkingCard leaving={!pending} delay={Math.max(0, hazardLands - mountedAt)} />
        </FaceCamera>
      </group>
      <group ref={spotRoot} name="matchup-spotlight">
        {cards.map((card, index) =>
          card.window ? (
            <group
              key={card.key}
              visible={false}
              ref={(group) => {
                spots.current[card.key] = group;
              }}
            >
              <Card
                width={card.width}
                height={card.height}
                accent={card.accent}
                title={card.title}
                body={card.body}
                bodySize={card.bodySize}
                enter="none"
                idle={0}
                realtime
                seed={card.seed}
                sound={false}
                overlay={SPOT_ORDER + index * 10}
              />
            </group>
          ) : null,
        )}
      </group>
    </>
  );
}

function shortAngle(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** While the matchup call runs: a card with "the Voice is thinking..." and a light sweeping across it. */
function ThinkingCard({ leaving, delay }: { leaving: boolean; delay: number }) {
  const sweep = useRef<Group>(null);
  const services = useStage();
  const width = NOTE_W;
  useFrame(() => {
    const node = sweep.current;
    if (!node) return;
    const t = services.clock.realElapsed;
    node.position.x = (((t * 0.7) % 1.4) - 0.7) * width;
  });
  return (
    <Card width={width} height={NOTE_H} title="MATCHUP NOTES" body="the Voice is thinking..." bodySize={0.062} accent={UI_COLORS.plum} enter="pop" leaving={leaving} delay={delay} seed={5}>
      <group ref={sweep} position={[0, -0.06, faceZ() + 0.002]}>
        <mesh material={uiToon("#fff6dc", { glow: 0.9 })} rotation={[0, 0, 0.35]}>
          <planeGeometry args={[0.06, NOTE_H * 0.7]} />
        </mesh>
      </group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

const TOKEN_GAP = 0.29;
const TOKENS_PER_ROW = 4;
/** Backers stand on the floor just downstage of their fighter (in frame in the low side shots). */
const TOKEN_Y = 0.14;
const TOKEN_DOWNSTAGE = 0.42;

/** The world position of a crowd member for a player (a stable pick), lifted to its head. */
function crowdSpot(nodes: ArenaNodes | null, playerId: string): Vector3Tuple {
  const crowd = nodes?.crowd ?? [];
  if (crowd.length === 0) return [0, 2.5, -6];
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  const member = crowd[hash % crowd.length]!;
  const point = member.getWorldPosition(new Vector3());
  return [point.x, point.y + 1.1, point.z];
}

/** One side's backers: an avatar token per bet, landed at the fighter's feet like a fan club, and the count. */
function Backers({
  feed,
  fight,
  side,
  mark,
  nodes,
}: {
  feed: FightFeed;
  fight: FightRow;
  side: Side;
  mark: Vector3Tuple;
  nodes: ArenaNodes | null;
}) {
  const ids = fight.bets[side];
  const [seen] = useState(() => new Set(ids));
  const count = ids.length;
  const spot = (index: number): Vector3Tuple => {
    const row = Math.floor(index / TOKENS_PER_ROW);
    const inRow = Math.min(TOKENS_PER_ROW, count - row * TOKENS_PER_ROW);
    const column = index % TOKENS_PER_ROW;
    return [mark[0] + (column - (inRow - 1) / 2) * TOKEN_GAP, TOKEN_Y, mark[2] + TOKEN_DOWNSTAGE + row * TOKEN_GAP];
  };
  return (
    <>
      {ids.map((id, index) => {
        const name = playerName(feed, id) ?? "?";
        // Bets already placed when the stage opened just pop in; new ones fly from the crowd.
        const fresh = !seen.has(id);
        return (
          <AvatarToken
            key={id}
            name={name}
            radius={0.12}
            position={spot(index)}
            flyFrom={fresh ? crowdSpot(nodes, id) : null}
            arcHeight={1.4}
            enter="pop"
            delay={fresh ? 0 : 0.12 * index}
            landSound={fresh ? "betPlaced" : null}
            seed={index + (side === "A" ? 1 : 11)}
          />
        );
      })}
      {count > 0 && (
        <FaceCamera position={[mark[0], TOKEN_Y + 0.26, mark[2] + TOKEN_DOWNSTAGE]}>
          <Chip key={count} label={`${count} BET${count === 1 ? "" : "S"}`} position={[0, 0, 0]} color={UI_COLORS.gold} textColor={UI_COLORS.ink} size={0.075} sound />
        </FaceCamera>
      )}
    </>
  );
}
