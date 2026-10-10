"use client";

// Small parts for card faces: <Chip> (a trait chip), <PipRow> (a stat as
// five pips), <MoveRow> (a move's type glyph, name and power) and
// <MoveGlyph> (STRIKE / GRAPPLE / TRICK as modelled meshes, never emoji).
// They are static meshes placed by their parent (a card); give them
// `appearDelay` to pop in one after another as the card lands.

import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import { MOVE_TYPE_INFO, type MoveType } from "../../vocab";
import { useStage } from "../services";
import { glyphGeometry, pillGeometry, pipGeometry } from "./geometry";
import { darkOf, isLightColor, textGlowOn, textOn, UI_COLORS, uiOutline, uiToon } from "./materials";
import { clamp01, ringDown, springTo1 } from "./motion";
import { stageSfx } from "./sound";
import { StageText } from "./text";

/** Rough Fredoka advance per character, in ems (as fitTextSize). */
const EM_ADVANCE = 0.58;

/** Colours per move type (warm strike, cool grapple, purple trick). */
export const MOVE_COLORS: Record<MoveType, string> = {
  STRIKE: "#e8553d",
  GRAPPLE: "#2f6fb0",
  TRICK: "#7b4fa8",
};

/** Pops a group in at `delay` seconds (squash, overshoot, settle), with an optional tick sound. */
function usePopIn(delay: number, sound: boolean) {
  const services = useStage();
  const ref = useRef<Group>(null);
  const t = useRef(-delay);
  const popped = useRef(false);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    t.current += services.clock.delta;
    const time = t.current;
    if (time < 0) {
      group.scale.setScalar(0.0001);
      return;
    }
    if (!popped.current) {
      popped.current = true;
      if (sound) stageSfx(services).play("tap", { intensity: 0.2, gain: 0.35 });
    }
    if (time > 1.2) {
      group.scale.setScalar(1);
      return;
    }
    const s = Math.max(0.0001, springTo1(time, 3.2, 0.42));
    const squash = ringDown(time, 0.2, 4, 7);
    group.scale.set(s * (1 - squash * 0.5), s * (1 + squash), s);
  });
  return ref;
}

export interface ChipProps {
  label: string;
  position?: [number, number, number];
  /** Pill colour. */
  color?: string;
  textColor?: string;
  /** Text em size; the pill sizes itself to the label. */
  size?: number;
  appearDelay?: number;
  sound?: boolean;
}

/** The pill width for a label at a text size. */
export function chipWidth(label: string, size = 0.085): number {
  return label.length * EM_ADVANCE * size + size * 1.5;
}

/** A trait chip: a chunky pill with its label. */
export function Chip({ label, position, color = "#f28b30", textColor, size = 0.085, appearDelay = 0, sound = false }: ChipProps) {
  const ref = usePopIn(appearDelay, sound);
  const width = chipWidth(label, size);
  const height = size * 1.75;
  const geometry = pillGeometry(width, height, height * 0.35);
  // Ink or bone, whichever contrasts more with the pill; bone glows so it stays bright in shade.
  const ink = textColor ?? textOn(color);
  const lightText = isLightColor(ink);
  return (
    <group ref={ref} position={position}>
      <mesh geometry={geometry} material={[uiToon(color, { glow: 0.1 }), uiToon(darkOf(color, 0.3))]} castShadow />
      <mesh geometry={geometry} material={uiOutline(color, 1.8)} />
      <Suspense fallback={null}>
        <StageText
          size={size}
          color={ink}
          outlineColor={darkOf(color, 0.6)}
          outline={lightText ? 0.05 : 0}
          glow={lightText ? textGlowOn(color) : 0.1}
          position={[0, -size * 0.04, height * 0.18 + 0.004]}
          castShadow={false}
        >
          {label}
        </StageText>
      </Suspense>
    </group>
  );
}

export interface PipRowProps {
  label: string;
  /** 1..5 filled. */
  value: number;
  max?: number;
  position?: [number, number, number];
  /** Total width of the row (label left, pips right). */
  width?: number;
  color?: string;
  emptyColor?: string;
  labelColor?: string;
  /** Text em size; pips scale with it. */
  size?: number;
  appearDelay?: number;
  sound?: boolean;
}

/** A stat: its label on the left, five pips on the right, filled up to `value`. */
export function PipRow({
  label,
  value,
  max = 5,
  position,
  width = 1,
  color = "#e8553d",
  emptyColor = "#d9c9b0",
  labelColor = UI_COLORS.ink,
  size = 0.08,
  appearDelay = 0,
  sound = false,
}: PipRowProps) {
  const ref = usePopIn(appearDelay, sound);
  const pipRadius = size * 0.42;
  const gap = pipRadius * 2.5;
  const pipsWidth = gap * (max - 1);
  const filled = Math.round(clamp01(value / max) * max);
  return (
    <group ref={ref} position={position}>
      <Suspense fallback={null}>
        <StageText size={size} color={labelColor} outline={0} glow={0.08} anchorX="left" position={[-width / 2, 0, 0.004]} castShadow={false}>
          {label}
        </StageText>
      </Suspense>
      {Array.from({ length: max }, (_, index) => {
        const on = index < filled;
        return (
          <mesh
            key={index}
            geometry={pipGeometry(pipRadius)}
            material={uiToon(on ? color : emptyColor, { glow: on ? 0.16 : 0.04, specular: on ? 0.5 : 0.1 })}
            position={[width / 2 - pipsWidth - pipRadius + index * gap, 0, pipRadius * 0.3]}
            scale={on ? 1 : 0.8}
          />
        );
      })}
    </group>
  );
}

export interface MoveGlyphProps {
  type: MoveType;
  size?: number;
  position?: [number, number, number];
  /** Spin and bob a little (alive on the card). */
  alive?: boolean;
  /** Idle phase variation. */
  seed?: number;
}

/** STRIKE (an impact burst), GRAPPLE (chain links), TRICK (a swirl) as small modelled meshes. */
export function MoveGlyph({ type, size = 0.12, position, alive = true, seed = 0 }: MoveGlyphProps) {
  const services = useStage();
  const ref = useRef<Group>(null);
  const phase = (seed + type.length) * 1.913;
  useFrame(() => {
    const group = ref.current;
    if (!group || !alive) return;
    const t = services.clock.elapsed + phase;
    group.rotation.z = Math.sin(t * 1.3) * (type === "TRICK" ? 0.35 : 0.12) + (type === "TRICK" ? t * 0.6 : 0);
    group.rotation.y = Math.sin(t * 0.9) * 0.25;
  });
  const color = MOVE_COLORS[type];
  const geometry = glyphGeometry(type, size);
  return (
    <group position={position}>
      <group ref={ref}>
        <mesh geometry={geometry} material={uiToon(color, { glow: 0.18, specular: 0.5 })} castShadow />
        <mesh geometry={geometry} material={uiOutline(color, 1.6)} />
      </group>
    </group>
  );
}

export interface MoveRowProps {
  name: string;
  type: MoveType;
  /** 1..5: shown as small pips after the name. */
  power?: number;
  position?: [number, number, number];
  width?: number;
  size?: number;
  textColor?: string;
  appearDelay?: number;
  sound?: boolean;
}

/** One move: its type glyph, its name, and its power as small pips. */
export function MoveRow({
  name,
  type,
  power,
  position,
  width = 1.1,
  size = 0.075,
  textColor = UI_COLORS.ink,
  appearDelay = 0,
  sound = false,
}: MoveRowProps) {
  const ref = usePopIn(appearDelay, sound);
  const glyph = size * 1.7;
  const pip = size * 0.26;
  const powerWidth = power ? pip * 2.4 * 5 : 0;
  const nameWidth = width - glyph - powerWidth - size * 0.6;
  const fitted = Math.min(size, nameWidth / Math.max(1, name.length * EM_ADVANCE));
  return (
    <group ref={ref} position={position}>
      <MoveGlyph type={type} size={glyph} position={[-width / 2 + glyph / 2, 0, glyph * 0.2]} seed={name.length} />
      <Suspense fallback={null}>
        <StageText
          size={fitted}
          color={textColor}
          outline={0}
          glow={0.08}
          anchorX="left"
          position={[-width / 2 + glyph + size * 0.35, 0, 0.004]}
          castShadow={false}
        >
          {name}
        </StageText>
      </Suspense>
      {power !== undefined &&
        Array.from({ length: 5 }, (_, index) => (
          <mesh
            key={index}
            geometry={pipGeometry(pip)}
            material={uiToon(index < power ? MOVE_COLORS[type] : "#d9c9b0", { glow: 0.1 })}
            position={[width / 2 - powerWidth + pip + index * pip * 2.4, 0, pip * 0.3]}
          />
        ))}
    </group>
  );
}

/** The player-facing label of a move type ("Strike"). */
export const moveTypeLabel = (type: MoveType) => MOVE_TYPE_INFO[type].label;
