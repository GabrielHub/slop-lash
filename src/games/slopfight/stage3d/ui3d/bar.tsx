"use client";

// <Bar>: a mesh bar (the fight's floating health bars). The fill drops at
// once; the lost part stays behind as a pale "chunk" for a beat, then crunches
// off: it breaks away as its own piece that tumbles and falls, and the bar
// shakes. Set `value` (0..1), or drive it per frame through the handle
// (`ref.current.set(value)`), which skips React renders.
//
//   <FaceCamera mode="full"><Bar ref={bar} value={hp / max} color="#e8553d" label="Raccoon" /></FaceCamera>
//
// The bar is centred on its origin, `width` long along +X, facing +Z.

import { useFrame } from "@react-three/fiber";
import { forwardRef, Suspense, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Group, Mesh } from "three";
import { useStage } from "../services";
import { slabGeometry } from "./geometry";
import { darkOf, lightOf, UI_COLORS, uiOutline, uiToon } from "./materials";
import { clamp01 } from "./motion";
import { stageSfx } from "./sound";
import { StageText } from "./text";

/** How long the chunk lingers before it crunches off. */
export const CHUNK_DELAY_S = 0.32;
const PIECES = 4;

export interface BarHandle {
  /** Set the value (0..1) without a React render. A drop leaves a chunk that crunches off. */
  set(value: number): void;
  /** A shake without a value change (0..1). */
  shake(strength?: number): void;
  readonly value: number;
}

export interface BarProps {
  value: number;
  width?: number;
  height?: number;
  color?: string;
  /** The lingering chunk's colour (defaults to a pale version of `color`). */
  chunkColor?: string;
  trackColor?: string;
  /** A label above the bar (the fighter's name). */
  label?: string | null;
  labelColor?: string;
  /** Mirror so the bar drains toward its outer end (B side). */
  flip?: boolean;
  /** Called when a chunk crunches off (for extra effects); the crunch sound plays itself. */
  onChunk?: (lost: number) => void;
  sound?: boolean;
  position?: [number, number, number];
}

interface Piece {
  mesh: Mesh | null;
  t: number;
  vx: number;
  vy: number;
  spin: number;
  active: boolean;
}

export const Bar = forwardRef<BarHandle, BarProps>(function Bar(
  {
    value,
    width = 1.1,
    height = 0.12,
    color = "#7fc45a",
    chunkColor,
    trackColor = UI_COLORS.track,
    label = null,
    labelColor = UI_COLORS.bone,
    flip = false,
    onChunk,
    sound = true,
    position,
  },
  ref,
) {
  const services = useStage();
  const shakeGroup = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const chunk = useRef<Mesh>(null);
  const pieceRefs = useRef<Piece[]>(Array.from({ length: PIECES }, () => ({ mesh: null, t: 0, vx: 0, vy: 0, spin: 0, active: false })));
  const state = useRef({ value: clamp01(value), chunkFrom: clamp01(value), chunkT: -1, shake: 0, shakeT: 0, next: 0 });
  const callbacks = useRef({ onChunk });
  callbacks.current = { onChunk };

  const inset = height * 0.16;
  const inner = width - inset * 2;
  const innerHeight = height - inset * 2;
  const track = slabGeometry(width, height, height * 0.5, height * 0.4);
  // Unit-wide fills scaled along X, anchored at their left end.
  const fillGeometry = useMemo(() => slabGeometry(1, innerHeight, height * 0.3, innerHeight * 0.3).clone().translate(0.5, 0, 0), [innerHeight, height]);
  useEffect(() => () => fillGeometry.dispose(), [fillGeometry]);

  const handle = useMemo<BarHandle>(
    () => ({
      set(next: number) {
        const s = state.current;
        const v = clamp01(next);
        if (v < s.value - 1e-4) {
          // Keep the highest un-crunched value as the chunk's top.
          if (s.chunkT < 0) s.chunkFrom = s.value;
          s.chunkT = 0;
        } else if (v > s.value) {
          s.chunkFrom = Math.max(s.chunkFrom, v);
        }
        s.value = v;
      },
      shake(strength = 0.6) {
        state.current.shake = Math.max(state.current.shake, strength);
        state.current.shakeT = 0;
      },
      get value() {
        return state.current.value;
      },
    }),
    [],
  );
  useImperativeHandle(ref, () => handle, [handle]);
  useEffect(() => handle.set(value), [handle, value]);

  useFrame(() => {
    const s = state.current;
    const dt = services.clock.delta;
    const sign = flip ? -1 : 1;
    const left = -inner / 2;
    // The chunk lingers, then crunches off as a falling piece.
    if (s.chunkT >= 0) {
      s.chunkT += dt;
      if (s.chunkT >= CHUNK_DELAY_S) {
        const lost = s.chunkFrom - s.value;
        if (lost > 0.002) {
          const piece = pieceRefs.current[s.next % PIECES]!;
          s.next += 1;
          if (piece.mesh) {
            piece.active = true;
            piece.t = 0;
            piece.vx = sign * (0.35 + Math.random() * 0.3);
            piece.vy = 0.9 + Math.random() * 0.4;
            piece.spin = (Math.random() - 0.5) * 9;
            piece.mesh.visible = true;
            piece.mesh.scale.set(Math.max(0.001, lost * inner), 1, 1);
            piece.mesh.position.set(sign * (left + s.value * inner), 0, 0.01);
            piece.mesh.rotation.set(0, 0, 0);
          }
          s.shake = Math.max(s.shake, Math.min(1, 0.35 + lost * 3));
          s.shakeT = 0;
          if (sound) stageSfx(services).play("healthCrunch", { intensity: Math.min(1, 0.3 + lost * 2.5) });
          callbacks.current.onChunk?.(lost);
        }
        s.chunkFrom = s.value;
        s.chunkT = -1;
      }
    }
    for (const piece of pieceRefs.current) {
      if (!piece.active || !piece.mesh) continue;
      piece.t += dt;
      piece.vy -= 5.5 * dt;
      piece.mesh.position.x += piece.vx * dt;
      piece.mesh.position.y += piece.vy * dt;
      piece.mesh.rotation.z += piece.spin * dt;
      if (piece.t > 1.1) {
        piece.active = false;
        piece.mesh.visible = false;
      }
    }
    if (fill.current) {
      fill.current.scale.set(Math.max(0.0001, s.value * inner) * sign, 1, 1);
      fill.current.position.x = sign * left;
    }
    if (chunk.current) {
      const lost = Math.max(0, s.chunkFrom - s.value);
      chunk.current.visible = lost > 0.001;
      chunk.current.scale.set(Math.max(0.0001, lost * inner) * sign, 1, 1);
      chunk.current.position.x = sign * (left + s.value * inner);
    }
    const group = shakeGroup.current;
    if (group) {
      s.shakeT += dt;
      const amount = s.shake * Math.exp(-s.shakeT * 9);
      group.position.set(Math.sin(s.shakeT * 71) * 0.03 * amount, Math.sin(s.shakeT * 53 + 1) * 0.04 * amount, 0);
      group.rotation.z = Math.sin(s.shakeT * 47) * 0.05 * amount;
      if (amount < 0.002) s.shake = 0;
    }
  });

  const pale = chunkColor ?? lightOf(color, 0.75);
  return (
    <group position={position}>
      <group ref={shakeGroup}>
        <mesh geometry={track} material={[uiToon(trackColor, { glow: 0.05 }), uiToon(darkOf(trackColor, 0.3))]} castShadow />
        <mesh geometry={track} material={uiOutline(trackColor, 2)} />
        <mesh ref={chunk} geometry={fillGeometry} material={uiToon(pale, { glow: 0.35 })} position={[0, 0, height * 0.12]} />
        <mesh ref={fill} geometry={fillGeometry} material={uiToon(color, { glow: 0.22, specular: 0.5 })} position={[0, 0, height * 0.14]} />
        {pieceRefs.current.map((piece, index) => (
          <mesh
            key={index}
            ref={(mesh) => {
              piece.mesh = mesh;
            }}
            visible={false}
            geometry={fillGeometry}
            material={uiToon(pale, { glow: 0.35 })}
          />
        ))}
        {label && (
          <Suspense fallback={null}>
            <StageText size={height * 1.05} color={labelColor} outline={0.1} glow={0.15} position={[0, height * 1.25, 0]} castShadow={false}>
              {label}
            </StageText>
          </Suspense>
        )}
      </group>
    </group>
  );
});
