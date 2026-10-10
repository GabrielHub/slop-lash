"use client";

// Small particle effects for the scenes: <Sparks> (gold streaks that shoot up
// and fall, one instanced mesh) and <Puffs> (cartoon smoke balls that pop up,
// drift and shrink away; solid toon spheres, no transparency). Both are pools
// fired through a handle; positions are world space.

import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { BoxGeometry, Color, InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3, type Vector3Tuple } from "three";
import { createToonMaterial } from "../look/toon";
import { useStage } from "../services";

const hidden = new Matrix4().makeScale(0, 0, 0);
const tmpMatrix = new Matrix4();
const tmpQ = new Quaternion();
const tmpScale = new Vector3();
const tmpPos = new Vector3();
const tmpDir = new Vector3();
const UP = new Vector3(0, 1, 0);
const tmpColor = new Color();

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  p: Vector3;
  v: Vector3;
  size: number;
}

function makePool(count: number): Particle[] {
  return Array.from({ length: count }, () => ({ alive: false, age: 0, life: 1, p: new Vector3(), v: new Vector3(), size: 1 }));
}

export interface SparksHandle {
  /** Shoot `count` sparks from `origin` (a ring of `radius` when given). */
  emit(origin: Vector3Tuple, count?: number, options?: { radius?: number; speed?: number; color?: string }): void;
}

const sparkGeometry = new BoxGeometry(0.018, 0.09, 0.018);

export const Sparks = forwardRef<SparksHandle, { capacity?: number }>(function Sparks({ capacity = 96 }, ref) {
  const services = useStage();
  const mesh = useRef<InstancedMesh>(null);
  const pool = useMemo(() => makePool(capacity), [capacity]);
  const cursor = useRef(0);
  const material = useMemo(() => {
    const m = createToonMaterial({ vertexColors: false, color: "#ffffff", emissive: "#ffd36b", specular: 0, rim: 0 });
    m.emissiveIntensity = 1.4;
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    for (let index = 0; index < capacity; index += 1) {
      instanced.setMatrixAt(index, hidden);
      instanced.setColorAt(index, tmpColor.set("#ffd36b"));
    }
    instanced.instanceMatrix.needsUpdate = true;
  }, [capacity]);
  useImperativeHandle(
    ref,
    () => ({
      emit(origin, count = 8, options = {}) {
        const instanced = mesh.current;
        const radius = options.radius ?? 0;
        const speed = options.speed ?? 2.4;
        for (let k = 0; k < count; k += 1) {
          const particle = pool[cursor.current]!;
          const index = cursor.current;
          cursor.current = (cursor.current + 1) % capacity;
          const angle = Math.random() * Math.PI * 2;
          particle.alive = true;
          particle.age = 0;
          particle.life = 0.45 + Math.random() * 0.35;
          particle.p.set(origin[0] + Math.cos(angle) * radius, origin[1], origin[2] + Math.sin(angle) * radius);
          const out = 0.35 + Math.random() * 0.5;
          particle.v.set(Math.cos(angle) * out, 0.8 + Math.random() * 0.6, Math.sin(angle) * out).normalize().multiplyScalar(speed * (0.6 + Math.random() * 0.6));
          particle.size = 0.7 + Math.random() * 0.6;
          if (instanced && options.color) instanced.setColorAt(index, tmpColor.set(options.color));
        }
        if (instanced?.instanceColor && options.color) instanced.instanceColor.needsUpdate = true;
      },
    }),
    [capacity, pool],
  );
  useFrame(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const dt = services.clock.delta;
    let any = false;
    for (let index = 0; index < pool.length; index += 1) {
      const particle = pool[index]!;
      if (!particle.alive) continue;
      any = true;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.alive = false;
        instanced.setMatrixAt(index, hidden);
        continue;
      }
      particle.v.y -= 6 * dt;
      particle.p.addScaledVector(particle.v, dt);
      // Streak along the velocity, shrinking as it dies.
      tmpDir.copy(particle.v).normalize();
      tmpQ.setFromUnitVectors(UP, tmpDir);
      const k = 1 - particle.age / particle.life;
      tmpScale.set(k * particle.size, (0.6 + particle.v.length() * 0.35) * k * particle.size, k * particle.size);
      tmpMatrix.compose(particle.p, tmpQ, tmpScale);
      instanced.setMatrixAt(index, tmpMatrix);
    }
    if (any) instanced.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[sparkGeometry, material, capacity]} frustumCulled={false} />;
});

export interface PuffsHandle {
  /** A ring of puffs around `origin`. */
  emit(origin: Vector3Tuple, count?: number, options?: { radius?: number; size?: number; rise?: number }): void;
}

const puffGeometry = new SphereGeometry(1, 12, 8);

export const Puffs = forwardRef<PuffsHandle, { capacity?: number; color?: string }>(function Puffs({ capacity = 32, color = "#fff4e2" }, ref) {
  const services = useStage();
  const mesh = useRef<InstancedMesh>(null);
  const pool = useMemo(() => makePool(capacity), [capacity]);
  const cursor = useRef(0);
  const material = useMemo(() => {
    const m = createToonMaterial({ vertexColors: false, color, emissive: color, specular: 0.1, rim: 0.3, translucency: 0.4, shade: 0.7 });
    m.emissiveIntensity = 0.25;
    return m;
  }, [color]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    for (let index = 0; index < capacity; index += 1) instanced.setMatrixAt(index, hidden);
    instanced.instanceMatrix.needsUpdate = true;
  }, [capacity]);
  useImperativeHandle(
    ref,
    () => ({
      emit(origin, count = 5, options = {}) {
        const radius = options.radius ?? 0.25;
        const size = options.size ?? 0.1;
        const rise = options.rise ?? 0.5;
        for (let k = 0; k < count; k += 1) {
          const particle = pool[cursor.current]!;
          cursor.current = (cursor.current + 1) % capacity;
          const angle = (k / count) * Math.PI * 2 + Math.random() * 0.6;
          particle.alive = true;
          particle.age = 0;
          particle.life = 0.55 + Math.random() * 0.3;
          particle.p.set(origin[0] + Math.cos(angle) * radius, origin[1], origin[2] + Math.sin(angle) * radius);
          particle.v.set(Math.cos(angle) * 0.6, rise * (0.7 + Math.random() * 0.6), Math.sin(angle) * 0.6);
          particle.size = size * (0.7 + Math.random() * 0.6);
        }
      },
    }),
    [capacity, pool],
  );
  useFrame(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const dt = services.clock.delta;
    let any = false;
    for (let index = 0; index < pool.length; index += 1) {
      const particle = pool[index]!;
      if (!particle.alive) continue;
      any = true;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.alive = false;
        instanced.setMatrixAt(index, hidden);
        continue;
      }
      const drag = Math.exp(-3.5 * dt);
      particle.v.multiplyScalar(drag);
      particle.p.addScaledVector(particle.v, dt);
      const t = particle.age / particle.life;
      // Pop up fast, linger, shrink away.
      const s = particle.size * (t < 0.25 ? 0.4 + (t / 0.25) * 0.8 : 1.2 * (1 - (t - 0.25) / 0.75));
      tmpPos.copy(particle.p);
      tmpQ.identity();
      tmpScale.setScalar(Math.max(0, s));
      tmpMatrix.compose(tmpPos, tmpQ, tmpScale);
      instanced.setMatrixAt(index, tmpMatrix);
    }
    if (any) instanced.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[puffGeometry, material, capacity]} frustumCulled={false} castShadow={false} />;
});
