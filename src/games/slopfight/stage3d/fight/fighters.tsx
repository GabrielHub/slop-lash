"use client";

// The two fighters on stage: each a <Creature> driven from the fight player's
// pose driver (so the rendered body is where its physics proxy is), with its
// hit jiggle and hop squash applied through the creature handle, and a
// floating health bar with its name, billboarded above it.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type Group, type Material, type Mesh, type Object3D, type PerspectiveCamera } from "three";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { TOY_COLOR_VALUES } from "../../vocab";
import { Creature, type CreatureEvent, type CreatureHandle } from "../creature/creature";
import { createOutlineMaterial } from "../look/outline";
import { createToonMaterial } from "../look/toon";
import { useStage, useStageClock } from "../services";
import { Bar, type BarHandle } from "../ui3d/bar";
import { slabGeometry } from "../ui3d/geometry";
import { darkOf, lightOf, UI_COLORS, uiOutline, uiToon } from "../ui3d/materials";
import { fitTextSize, StageText } from "../ui3d/text";
import { FaceCamera } from "../ui3d/tokens";
import type { FightPlayer } from "./player";

/** The rig's highlights: only the stage key and rims leave a vinyl highlight on a creature. */
export const STAGE_SPECULAR_MIN_LIGHT = 1.3;

/**
 * The presentation clock's time scale for the creatures, as React state that
 * changes only when the scale moves by a step (hit stop, slow-mo ramps), so
 * the creatures freeze and slow with the world without re-rendering per frame.
 */
export function useClockScale(): number {
  const clock = useStageClock();
  const [scale, setScale] = useState(1);
  const current = useRef(1);
  useFrame(() => {
    const quantized = clock.frozen || clock.paused ? 0 : Math.round(clock.scale * 10) / 10;
    if (quantized !== current.current) {
      current.current = quantized;
      setScale(quantized);
    }
  }, -90);
  return scale;
}

export interface FightCreatureProps {
  player: FightPlayer;
  side: Side;
  timeScale: number;
  onCreatureEvent?: (side: Side, event: CreatureEvent) => void;
  /** Hide (a fighter that fell out of the scene after a ring-out). */
  visible?: boolean;
  handleRef?: (side: Side, handle: CreatureHandle | null) => void;
}

export function FightCreature({ player, side, timeScale, onCreatureEvent, visible = true, handleRef }: FightCreatureProps) {
  const handle = useRef<CreatureHandle | null>(null);
  const driver = player.drivers[side];
  const champion = player.champion(side);
  useFrame(() => {
    const creature = handle.current;
    if (!creature) return;
    if (driver.jiggle > 0) {
      creature.jiggle(driver.jiggle);
      driver.jiggle = 0;
    }
    if (driver.squash !== 0) {
      creature.squash(driver.squash);
      driver.squash = 0;
    }
  });
  useEffect(() => {
    handleRef?.(side, handle.current);
    return () => handleRef?.(side, null);
  }, [handleRef, side]);
  return (
    <group visible={visible}>
      <Creature
        ref={handle}
        champion={champion}
        driver={driver.driver}
        seed={side === "A" ? 11 : 23}
        timeScale={timeScale}
        specularMinLight={STAGE_SPECULAR_MIN_LIGHT}
        onEvent={onCreatureEvent ? (event) => onCreatureEvent(side, event) : undefined}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Health bars
// ---------------------------------------------------------------------------

const BAR_WIDTH = 1.18;
const BAR_HEIGHT = 0.15;

/** A readable bar colour from the palette: the primary, lifted off dark tones. */
export function barColor(champion: Champion): string {
  const primary = TOY_COLOR_VALUES[champion.palette.primary].hex;
  const value = Number.parseInt(primary.slice(1), 16);
  const luminance = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  if (luminance < 70) return TOY_COLOR_VALUES[champion.palette.secondary].hex;
  return primary;
}

export interface HealthBarProps {
  player: FightPlayer;
  side: Side;
  name: string;
  /** Owner's name beside the champion's (null for a house champion). */
  owner?: string | null;
  /** How shown, 0..1, read every frame (the rise-in and the flick-off after a ring-out). */
  shown?: { current: number };
  /** ON THE EDGE, 0..1 per side, read every frame (a red tag under the bar). */
  edge?: Record<Side, number>;
  /** Keeps the two bars apart on screen and inside the frame (it then places the bar). */
  stack?: BarStack;
}

const ALWAYS = { current: 1 };

/**
 * The bars draw over the set: no depth test, and in the transparent pass with
 * a higher order than a creature's eye and mouth decals (transparent, 2-3), so
 * neither a fighter's head, a tusk, a ledge nor an eye hides one. Each part
 * has a fixed order from this base, side B's whole bar over side A's. They
 * hide while a title slams (they would cover it), and The Voice's caption
 * text stays on top (952).
 */
const BAR_ORDER: Record<Side, number> = { A: 10, B: 18 };

const hudCache = new Map<string, Material>();

/** A bar part in the kit's card look (ui3d/materials uiToon's settings), drawn over the set as above. Cached; do not mutate. */
function hudToon(color: string, glow = 0.06, specular = 0.25): Material {
  const key = `toon|${color}|${glow}|${specular}`;
  let material = hudCache.get(key);
  if (!material) {
    const toon = createToonMaterial({ vertexColors: false, color, emissive: color, specular, rim: 0.22, translucency: 0.2, shade: 0.5 });
    toon.emissiveIntensity = glow;
    toon.depthTest = false;
    toon.fog = false;
    toon.transparent = true;
    material = toon;
    hudCache.set(key, material);
  }
  return material;
}

/** uiOutline's inverted hull, drawn over the set as above. */
function hudOutline(color: string, width: number): Material {
  const key = `outline|${color}|${width}`;
  let material = hudCache.get(key);
  if (!material) {
    const outline = createOutlineMaterial({ color: darkOf(color, 0.62), width });
    outline.depthTest = false;
    outline.fog = false;
    outline.transparent = true;
    material = outline;
    hudCache.set(key, material);
  }
  return material;
}

/**
 * The kit Bar's materials (ui3d/bar.tsx: the track's face, sides and outline,
 * the chunk and the fill) mapped to their over-the-set twins and draw order.
 * A material missing from the map (the kit changed) is left as it is.
 */
function barOverlay(color: string, base: number): Map<Material, [Material, number]> {
  const track = UI_COLORS.track;
  const pale = lightOf(color, 0.75);
  return new Map<Material, [Material, number]>([
    [uiOutline(track, 2), [hudOutline(track, 2), base + 1]],
    [uiToon(track, { glow: 0.05 }), [hudToon(track, 0.05), base + 2]],
    [uiToon(darkOf(track, 0.3)), [hudToon(darkOf(track, 0.3)), base + 2]],
    [uiToon(pale, { glow: 0.35 }), [hudToon(pale, 0.35), base + 3]],
    [uiToon(color, { glow: 0.22, specular: 0.5 }), [hudToon(color, 0.22, 0.5), base + 4]],
  ]);
}

/** Swaps every mapped material under `root` for its overlay twin (idempotent: run each frame, it catches remounted meshes). */
function applyOverlay(root: Object3D, twins: Map<Material, [Material, number]>): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) {
      if (!material.some((entry) => twins.has(entry))) return;
      let order = mesh.renderOrder;
      mesh.material = material.map((entry) => {
        const twin = twins.get(entry);
        if (!twin) return entry;
        order = twin[1];
        return twin[0];
      });
      mesh.renderOrder = order;
      return;
    }
    const twin = twins.get(material);
    if (!twin) return;
    mesh.material = twin[0];
    mesh.renderOrder = twin[1];
  });
}

/** The nameplate's extent above and below the bar's centre, in bar units (before the distance scale). */
function plateExtent(nameSize: number, owner: boolean): { top: number; bottom: number } {
  return { top: BAR_HEIGHT / 2 + nameSize * 1.45 + 0.03, bottom: -BAR_HEIGHT / 2 - (owner ? 0.15 : 0.05) };
}

/**
 * A floating health bar above one fighter: the kit's <Bar> (the fill drops at
 * once, the chunk holds for a beat, then crunches off with a shake and its
 * sound), billboarded, with the champion's name and the owner on a dark
 * nameplate (readable over any stand), drawn over the set (BAR_ORDER). It
 * follows the torso with a little lag
 * (clamped above the floor) so a tumbling ragdoll does not throw it about, and
 * shows a red ON THE EDGE tag at the brink. With a `stack`, the two bars stack
 * instead of overlapping when the fighters line up on screen.
 */
export function HealthBar({ player, side, name, owner = null, shown = ALWAYS, edge, stack }: HealthBarProps) {
  const group = useRef<Group>(null);
  const tag = useRef<Group>(null);
  const scaler = useRef<Group>(null);
  const bar = useRef<BarHandle>(null);
  const champion = player.champion(side);
  const color = useMemo(() => barColor(champion), [champion]);
  const state = useRef({ position: new Vector3(), init: false, rise: 0, tag: 0 });
  const height = player.drivers[side].height;
  const target = useMemo(() => new Vector3(), []);
  const nameSize = fitTextSize(name, BAR_WIDTH * 1.15, 0.15);
  const extent = plateExtent(nameSize, owner !== null);
  const order = BAR_ORDER[side];
  const barRoot = useRef<Group>(null);
  const twins = useMemo(() => barOverlay(color, order), [color, order]);

  useFrame((frame, realDelta) => {
    const node = group.current;
    if (!node) return;
    if (barRoot.current) applyOverlay(barRoot.current, twins);
    const s = state.current;
    const max = Math.max(1, player.maxHealth[side]);
    bar.current?.set(Math.max(0, player.health[side]) / max);
    const sample = player.samples?.[side];
    if (sample) {
      target.set(sample.root.p[0], Math.max(sample.root.p[1], 0.2) + height * 0.62 + 0.46, sample.root.p[2]);
      if (!s.init) {
        s.position.copy(target);
        s.init = true;
      } else {
        s.position.lerp(target, 1 - Math.exp(-realDelta * 9));
      }
    }
    s.rise = MathUtils.damp(s.rise, shown.current, 9, realDelta);
    node.position.copy(s.position);
    node.position.y += (1 - s.rise) * -0.25;
    node.scale.setScalar(Math.max(0.0001, s.rise));
    // Readable in the wide shot, never filling a close-up: grow with camera distance.
    const distance = frame.camera.position.distanceTo(s.position);
    const scale = MathUtils.clamp(distance / 6.5, 0.62, 1.55);
    scaler.current?.scale.setScalar(scale);
    node.visible = s.rise > 0.01;
    // ON THE EDGE: a red tag that pulses under the bar.
    const onEdge = edge ? edge[side] : 0;
    s.tag = MathUtils.damp(s.tag, onEdge > 0.5 ? 1 : 0, 14, realDelta);
    const t = tag.current;
    if (t) {
      t.visible = s.tag > 0.02;
      const pulse = 1 + 0.06 * Math.sin(frame.clock.elapsedTime * 14);
      t.scale.setScalar(Math.max(0.0001, s.tag * pulse));
    }
    if (stack) {
      const size = scale * Math.max(0.0001, s.rise);
      const bottom = extent.bottom - (s.tag > 0.02 ? 0.17 : 0);
      stack.report(side, node, node.position, { top: extent.top * size, bottom: bottom * size, half: (BAR_WIDTH / 2 + 0.06) * size }, node.visible);
    }
  });

  const plateHeight = extent.top - extent.bottom;
  return (
    <group ref={group}>
      <FaceCamera mode="full">
        <group ref={scaler}>
          <mesh
            geometry={slabGeometry(BAR_WIDTH + 0.12, plateHeight, 0.03, 0.07)}
            material={hudToon(UI_COLORS.plum, 0.3)}
            renderOrder={order}
            position={[0, (extent.top + extent.bottom) / 2, -0.06]}
          />
          <group ref={barRoot}>
            <Bar ref={bar} value={1} width={BAR_WIDTH} height={BAR_HEIGHT} color={color} flip={side === "B"} />
          </group>
          <StageText
            position={[0, BAR_HEIGHT / 2 + nameSize * 0.75, 0.01]}
            size={nameSize}
            color={UI_COLORS.bone}
            outlineColor={UI_COLORS.plumEdge}
            outline={0.14}
            glow={0.35}
            overlay
            renderOrder={order + 5}
            castShadow={false}
          >
            {name}
          </StageText>
          {owner && (
            <StageText
              position={[0, -BAR_HEIGHT / 2 - 0.075, 0.01]}
              size={0.085}
              color={lightOf(color, 0.6)}
              outlineColor={UI_COLORS.plumEdge}
              outline={0.22}
              glow={0.25}
              weight={600}
              overlay
              renderOrder={order + 5}
              castShadow={false}
            >
              {owner}
            </StageText>
          )}
          <group ref={tag} position={[0, -BAR_HEIGHT / 2 - (owner ? 0.24 : 0.14), 0.02]} visible={false}>
            <mesh geometry={slabGeometry(0.66, 0.14, 0.03, 0.05)} material={hudToon(EDGE_RED, 0.6)} renderOrder={order + 1} />
            <StageText position={[0, 0, 0.02]} size={0.09} color={UI_COLORS.bone} outline={0} glow={0.4} overlay renderOrder={order + 6} castShadow={false}>
              ON THE EDGE
            </StageText>
          </group>
        </group>
      </FaceCamera>
    </group>
  );
}

const EDGE_RED = "#e8402f";

// ---------------------------------------------------------------------------
// Keeping the bars apart
// ---------------------------------------------------------------------------

interface StackEntry {
  node: Group;
  /** Where the bar wants to be this frame (world). */
  anchor: Vector3;
  /** Extent above/below its centre and half width, world units. */
  top: number;
  bottom: number;
  half: number;
  visible: boolean;
  /** The stacking push, NDC (eased). */
  push: number;
  fresh: boolean;
}

/** Highest the top of a bar may sit (NDC y), clear of the frame's top edge. */
const STACK_TOP = 0.9;
/** Gap between stacked bars, in NDC. */
const STACK_GAP = 0.025;
/** How far (NDC) the other bar's anchor must rise above the one on top before they swap. */
const STACK_SWAP = 0.08;

const tmpNdc = new Vector3();
const tmpUpAxis = new Vector3();

/**
 * Screen-space layout for the two health bars, run once per frame after the
 * camera is placed: a bar never pokes out of the top of the frame, and when
 * the fighters line up on screen the two nameplates stack (the one whose
 * bar is higher on screen goes on top, and stays there until the other is
 * clearly higher) instead of printing over each other. The top clamp follows
 * the camera at once (a fast push-in cannot shove a bar out of frame); the
 * stacking push eases, and snaps on a cut.
 */
export class BarStack {
  private readonly entries: Partial<Record<Side, StackEntry>> = {};
  private snap = true;
  private upper: Side | null = null;

  report(side: Side, node: Group, anchor: Vector3, size: { top: number; bottom: number; half: number }, visible: boolean): void {
    const entry = this.entries[side] ?? { node, anchor: new Vector3(), top: 0, bottom: 0, half: 0, visible: false, push: 0, fresh: false };
    entry.node = node;
    entry.anchor.copy(anchor);
    entry.top = size.top;
    entry.bottom = size.bottom;
    entry.half = size.half;
    entry.visible = visible;
    entry.fresh = true;
    this.entries[side] = entry;
  }

  /** The next resolve places the bars without easing (after a cut). */
  cut(): void {
    this.snap = true;
  }

  /** Place both bars for this frame's camera. */
  resolve(camera: PerspectiveCamera, realDelta: number): void {
    const fovScale = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    tmpUpAxis.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const shown: Array<{ side: Side; entry: StackEntry; depth: number; cx: number; cy: number; top: number; bottom: number; half: number; shift: number; push: number }> = [];
    for (const side of ["A", "B"] as const) {
      const entry = this.entries[side];
      if (!entry || !entry.fresh) continue;
      entry.fresh = false;
      tmpNdc.copy(entry.anchor).applyMatrix4(camera.matrixWorldInverse);
      const depth = -tmpNdc.z;
      if (!entry.visible || depth <= 0.05) {
        entry.node.position.copy(entry.anchor);
        entry.push = 0;
        continue;
      }
      const unit = 1 / (depth * fovScale);
      tmpNdc.copy(entry.anchor).project(camera);
      shown.push({ side, entry, depth, cx: tmpNdc.x, cy: tmpNdc.y, top: entry.top * unit, bottom: entry.bottom * unit, half: (entry.half * unit) / camera.aspect, shift: 0, push: 0 });
    }
    // Inside the frame's top.
    for (const bar of shown) bar.shift = Math.min(0, STACK_TOP - (bar.cy + bar.top));
    // Stack when the plates overlap: the bar higher on screen on top, kept
    // there until the other is clearly higher (no swapping through each other).
    if (this.snap) this.upper = null;
    if (shown.length === 2) {
      const [first, second] = shown as [(typeof shown)[0], (typeof shown)[0]];
      const top = (bar: (typeof shown)[0]) => bar.cy + bar.top;
      let upper = top(first) >= top(second) ? first : second;
      const kept = shown.find((bar) => bar.side === this.upper);
      const other = kept === first ? second : first;
      if (kept && top(other) - top(kept) < STACK_SWAP) upper = kept;
      this.upper = upper.side;
      const lower = upper === first ? second : first;
      const overlapX = Math.abs(upper.cx - lower.cx) < upper.half + lower.half;
      const need = upper.cy + upper.shift + upper.bottom - (lower.cy + lower.shift + lower.top) - STACK_GAP;
      if (overlapX && need < 0) {
        // Split the push, but never past the top edge: the lower plate takes the rest.
        const up = Math.min(-need / 2, Math.max(0, STACK_TOP - (upper.cy + upper.shift + upper.top)));
        upper.push = up;
        lower.push = need + up;
      }
    } else {
      this.upper = null;
    }
    const snap = this.snap;
    this.snap = false;
    for (const bar of shown) {
      // Quick to part (an overlap reads as a bug), slower to close up.
      const parting = Math.abs(bar.push) > Math.abs(bar.entry.push);
      const ease = snap ? 1 : 1 - Math.exp(-realDelta * (parting ? 24 : 8));
      bar.entry.push += (bar.push - bar.entry.push) * ease;
      const offset = (bar.shift + bar.entry.push) * bar.depth * fovScale;
      bar.entry.node.position.copy(bar.entry.anchor).addScaledVector(tmpUpAxis, offset);
    }
  }
}

/** Runs the stack after the camera rig (0.5) and before the bars billboard (0.55); snaps on cuts. */
export function BarStackResolver({ stack }: { stack: BarStack }) {
  const services = useStage();
  useEffect(() => services.events.on("cut", () => stack.cut()), [services, stack]);
  useFrame((state) => stack.resolve(state.camera as PerspectiveCamera, services.clock.realDelta), 0.52);
  return null;
}
