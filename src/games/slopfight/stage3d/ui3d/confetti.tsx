"use client";

// <Confetti>: one instanced mesh of paper scraps (a fixed pool, one draw
// call) with a burst API. Scraps fly out of the burst point, tumble and
// flutter down with drag, then shrink away. Mount it once in a scene and fire
// bursts through the handle:
//
//   const confetti = useRef<ConfettiHandle>(null);
//   <Confetti ref={confetti} />
//   confetti.current?.burst({ origin: [0, 1.4, -0.4], count: 160, colors: palette });
//
// Colours default to a party mix of toy colours; pass the winner's palette.

import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3, type Vector3Tuple } from "three";
import { TOY_COLOR_VALUES } from "../../vocab";
import { createToonMaterial } from "../look/toon";
import { useStage } from "../services";

export const CONFETTI_COLORS = [
  TOY_COLOR_VALUES.tomato.hex,
  TOY_COLOR_VALUES.butter.hex,
  TOY_COLOR_VALUES.mint.hex,
  TOY_COLOR_VALUES.sky.hex,
  TOY_COLOR_VALUES.bubblegum.hex,
  TOY_COLOR_VALUES.grape.hex,
];

export interface ConfettiBurst {
  origin: Vector3Tuple;
  /** Scraps in this burst (the pool recycles the oldest). Default 120. */
  count?: number;
  colors?: readonly string[];
  /** Launch speed in m/s. Default 4. */
  speed?: number;
  /** Cone half-angle from straight up, in radians (PI/2: a flat ring). Default 0.75. */
  spread?: number;
  /** Launch direction (default straight up). */
  direction?: Vector3Tuple;
  /** Scrap size in metres. Default 0.06. */
  size?: number;
}

export interface ConfettiHandle {
  burst(options: ConfettiBurst): void;
  /** Remove every scrap now. */
  clear(): void;
}

export interface ConfettiProps {
  /** Pool size (one draw call). Default 600. */
  capacity?: number;
  /** Seconds a scrap lives. Default 4.5. */
  life?: number;
  /** Real time (keeps falling through hit stop). Default false. */
  realtime?: boolean;
}

interface Scrap {
  alive: boolean;
  age: number;
  p: Vector3;
  v: Vector3;
  axis: Vector3;
  spin: number;
  angle: number;
  flutter: number;
  size: number;
}

const GRAVITY = 3.2;
const DRAG = 1.6;
const hidden = new Matrix4().makeScale(0, 0, 0);
const tmpMatrix = new Matrix4();
const tmpQ = new Quaternion();
const tmpScale = new Vector3();
const tmpColor = new Color();
const tmpDir = new Vector3();
const up = new Vector3(0, 1, 0);
const tmpBasis = new Quaternion();

// The scrap's shape: a small rectangle (double sided, lit by the rig).
const scrapGeometry = new PlaneGeometry(1, 0.62);

export const Confetti = forwardRef<ConfettiHandle, ConfettiProps>(function Confetti({ capacity = 600, life = 4.5, realtime = false }, ref) {
  const services = useStage();
  const mesh = useRef<InstancedMesh>(null);
  const scraps = useMemo<Scrap[]>(
    () =>
      Array.from({ length: capacity }, () => ({
        alive: false,
        age: 0,
        p: new Vector3(),
        v: new Vector3(),
        axis: new Vector3(1, 0, 0),
        spin: 0,
        angle: 0,
        flutter: 0,
        size: 0.06,
      })),
    [capacity],
  );
  const cursor = useRef(0);
  const active = useRef(0);
  const material = useMemo(() => {
    const m = createToonMaterial({ vertexColors: false, color: "#ffffff", specular: 0.15, rim: 0.15, translucency: 0.35, shade: 0.55 });
    m.side = DoubleSide;
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    // A passive effect can run after the first frame. Prepare both the hidden
    // matrices and instanceColor before drawing, so mount never flashes scraps
    // or compiles an uncoloured shader variant that no burst will use.
    for (let index = 0; index < capacity; index += 1) {
      instanced.setMatrixAt(index, hidden);
      instanced.setColorAt(index, tmpColor.set("#ffffff"));
    }
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [capacity]);

  const handle = useMemo<ConfettiHandle>(
    () => ({
      burst({ origin, count = 120, colors = CONFETTI_COLORS, speed = 4, spread = 0.75, direction, size = 0.06 }) {
        const instanced = mesh.current;
        if (!instanced) return;
        tmpDir.set(...(direction ?? [0, 1, 0])).normalize();
        tmpBasis.setFromUnitVectors(up, tmpDir);
        const n = Math.min(count, capacity);
        for (let k = 0; k < n; k += 1) {
          const index = cursor.current;
          cursor.current = (cursor.current + 1) % capacity;
          const scrap = scraps[index]!;
          if (!scrap.alive) active.current += 1;
          scrap.alive = true;
          scrap.age = -Math.random() * 0.08;
          scrap.p.set(origin[0], origin[1], origin[2]);
          // A random direction inside the cone, launched at a varied speed.
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(1 - Math.random() * (1 - Math.cos(spread)));
          const s = speed * (0.45 + Math.random() * 0.75);
          scrap.v.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).applyQuaternion(tmpBasis).multiplyScalar(s);
          scrap.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          scrap.spin = (4 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1);
          scrap.angle = Math.random() * Math.PI * 2;
          scrap.flutter = Math.random() * Math.PI * 2;
          scrap.size = size * (0.7 + Math.random() * 0.6);
          instanced.setColorAt(index, tmpColor.set(colors[Math.floor(Math.random() * colors.length)] ?? "#ffffff"));
        }
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      },
      clear() {
        const instanced = mesh.current;
        for (let index = 0; index < scraps.length; index += 1) {
          scraps[index]!.alive = false;
          instanced?.setMatrixAt(index, hidden);
        }
        active.current = 0;
        if (instanced) instanced.instanceMatrix.needsUpdate = true;
      },
    }),
    [capacity, scraps],
  );
  useImperativeHandle(ref, () => handle, [handle]);

  useFrame(() => {
    const instanced = mesh.current;
    if (!instanced || active.current === 0) return;
    const dt = realtime ? services.clock.realDelta : services.clock.delta;
    if (dt <= 0) return;
    let alive = 0;
    for (let index = 0; index < scraps.length; index += 1) {
      const scrap = scraps[index]!;
      if (!scrap.alive) continue;
      scrap.age += dt;
      if (scrap.age >= life) {
        scrap.alive = false;
        instanced.setMatrixAt(index, hidden);
        continue;
      }
      alive += 1;
      if (scrap.age < 0) {
        instanced.setMatrixAt(index, hidden);
        continue;
      }
      // Drag toward a slow flutter-down terminal speed, with a sideways sway.
      const drag = Math.exp(-DRAG * dt);
      scrap.v.x *= drag;
      scrap.v.z *= drag;
      scrap.v.y = scrap.v.y * drag - GRAVITY * dt;
      if (scrap.v.y < -0.9) scrap.v.y = -0.9;
      scrap.flutter += dt * 5;
      scrap.p.x += (scrap.v.x + Math.sin(scrap.flutter) * 0.35) * dt;
      scrap.p.y += scrap.v.y * dt;
      scrap.p.z += (scrap.v.z + Math.cos(scrap.flutter * 0.8) * 0.25) * dt;
      if (scrap.p.y < 0.01) {
        scrap.p.y = 0.01;
        scrap.v.set(0, 0, 0);
        scrap.spin *= 0.9;
      }
      scrap.angle += scrap.spin * dt;
      tmpQ.setFromAxisAngle(scrap.axis, scrap.angle);
      const fade = Math.min(1, (life - scrap.age) / 0.6, scrap.age / 0.05);
      tmpScale.setScalar(scrap.size * Math.max(0, fade));
      tmpMatrix.compose(scrap.p, tmpQ, tmpScale);
      instanced.setMatrixAt(index, tmpMatrix);
    }
    active.current = alive;
    instanced.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[scrapGeometry, material, capacity]} frustumCulled={false} castShadow={false} />;
});
