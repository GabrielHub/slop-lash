"use client";

// Fight VFX in the house style: chunky, toon-lit shapes in the fighters'
// palettes, never generic particles. One pooled instanced mesh per shape:
//
// - spark: a comic hit burst at the contact point: a hot core star plus
//   blade-shaped petals in the attacker's colours, flat to the camera,
//   punching out and thinning (a big hit adds more, longer petals and a
//   shock ring);
// - puff: low-poly dust balls for landings and slams, tinted to the floor;
// - sweat: teardrops flicked off a fighter that just took one;
// - drop: splash droplets for a water ring-out;
// - ring: a flat shock ring (big hits, splashes).
//
// Everything runs on the presentation clock, so a hit stop freezes the burst
// on the impact frame and slow motion slows it. KO stars orbit a knocked-out
// head until the scene ends.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
} from "three";
import { createToonMaterial, type ToonMaterial } from "../look/toon";
import { useStageClock } from "../services";

type Kind = "core" | "petal" | "puff" | "sweat" | "drop" | "ring";

interface Particle {
  alive: boolean;
  kind: Kind;
  age: number;
  life: number;
  p: Vector3;
  v: Vector3;
  gravity: number;
  drag: number;
  /** Screen-plane angle (petals, rings) or spin. */
  angle: number;
  size: number;
  /** Petals: length multiplier. */
  stretch: number;
  color: Color;
  /** Billboard to the camera (petals, cores, rings). */
  facing: boolean;
  /** Rings lie flat on the floor instead of facing the camera. */
  flat: boolean;
}

const POOL: Record<Kind, number> = { core: 24, petal: 160, puff: 90, sweat: 40, drop: 80, ring: 16 };

function petalGeometry(): BufferGeometry {
  // A blade: narrow at the root, fat a third of the way out, pointed at the tip (+Y).
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.16, 0.38);
  shape.lineTo(0, 1);
  shape.lineTo(-0.16, 0.38);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  geometry.translate(0, 0, -0.02);
  geometry.computeVertexNormals();
  return geometry;
}

function starGeometry(points = 5, inner = 0.45): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();
const tmpV = new Vector3();
const Z = new Vector3(0, 0, 1);
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/** A tiny deterministic noise source (VFX only; never touches the sim). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface SparkOptions {
  /** Petal colours (the attacker's palette). */
  colors: readonly string[];
  big?: boolean;
  /** 0..1 */
  strength?: number;
}

export class FxSystem {
  readonly particles: Record<Kind, Particle[]>;
  private random = rng(7);

  constructor() {
    const make = (kind: Kind, count: number): Particle[] =>
      Array.from({ length: count }, () => ({
        alive: false,
        kind,
        age: 0,
        life: 1,
        p: new Vector3(),
        v: new Vector3(),
        gravity: 0,
        drag: 0,
        angle: 0,
        size: 1,
        stretch: 1,
        color: new Color(),
        facing: false,
        flat: false,
      }));
    this.particles = {
      core: make("core", POOL.core),
      petal: make("petal", POOL.petal),
      puff: make("puff", POOL.puff),
      sweat: make("sweat", POOL.sweat),
      drop: make("drop", POOL.drop),
      ring: make("ring", POOL.ring),
    };
  }

  private take(kind: Kind): Particle {
    const pool = this.particles[kind];
    let best = pool[0]!;
    for (const particle of pool) {
      if (!particle.alive) return particle;
      if (particle.age / particle.life > best.age / best.life) best = particle;
    }
    return best;
  }

  private spawn(kind: Kind, init: Partial<Omit<Particle, "p" | "v" | "color">> & { p: Vector3; v?: Vector3; color: string }): Particle {
    const particle = this.take(kind);
    particle.alive = true;
    particle.kind = kind;
    particle.age = 0;
    particle.life = init.life ?? 0.3;
    particle.p.copy(init.p);
    particle.v.copy(init.v ?? tmpV.set(0, 0, 0));
    particle.gravity = init.gravity ?? 0;
    particle.drag = init.drag ?? 0;
    particle.angle = init.angle ?? 0;
    particle.size = init.size ?? 1;
    particle.stretch = init.stretch ?? 1;
    particle.color.set(init.color);
    particle.facing = init.facing ?? false;
    particle.flat = init.flat ?? false;
    return particle;
  }

  /** A comic hit burst at `point`. */
  spark(point: Vector3, options: SparkOptions): void {
    const r = this.random;
    const big = options.big === true;
    const strength = Math.min(1, Math.max(0.15, options.strength ?? 0.5));
    const petals = big ? 11 : 6 + Math.round(strength * 3);
    const offset = r() * Math.PI * 2;
    this.spawn("core", { p: point, life: big ? 0.2 : 0.13, size: (big ? 0.42 : 0.26) * (0.8 + strength * 0.4), color: "#fff6d8", facing: true, angle: offset });
    for (let i = 0; i < petals; i += 1) {
      const angle = offset + (i / petals) * Math.PI * 2 + (r() - 0.5) * 0.45;
      const color = options.colors[i % options.colors.length] ?? "#ffd76a";
      this.spawn("petal", {
        p: point,
        life: (big ? 0.3 : 0.22) * (0.85 + r() * 0.3),
        size: (big ? 0.5 : 0.32) * (0.75 + r() * 0.5) * (0.8 + strength * 0.4),
        stretch: big ? 1.5 : 1.1,
        angle,
        color,
        facing: true,
      });
    }
    if (big) this.spawn("ring", { p: point, life: 0.32, size: 0.9, color: "#fff2c8", facing: true });
  }

  /** Dust balls at a landing. */
  puff(point: Vector3, options: { color: string; count?: number; size?: number; spread?: number }): void {
    const r = this.random;
    const count = options.count ?? 6;
    const size = options.size ?? 0.16;
    const spread = options.spread ?? 1;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + r() * 0.6;
      const speed = (0.7 + r() * 0.8) * spread;
      this.spawn("puff", {
        p: tmpP.set(point.x + Math.cos(a) * 0.08, Math.max(point.y, -40) + 0.04, point.z + Math.sin(a) * 0.08),
        v: tmpV.set(Math.cos(a) * speed, 0.25 + r() * 0.5, Math.sin(a) * speed),
        drag: 4.2,
        gravity: -0.5,
        life: 0.5 + r() * 0.25,
        size: size * (0.7 + r() * 0.6),
        color: options.color,
        angle: r() * Math.PI,
      });
    }
  }

  /** Sweat drops flicked off a fighter that just took a hit. */
  sweat(point: Vector3, away: Vector3): void {
    const r = this.random;
    for (let i = 0; i < 3; i += 1) {
      tmpV.set(away.x + (r() - 0.5) * 0.9, 1.4 + r() * 0.9, away.z + (r() - 0.5) * 0.9);
      this.spawn("sweat", {
        p: point,
        v: tmpV.multiplyScalar(1.3),
        gravity: -9,
        life: 0.55,
        size: 0.06 + r() * 0.03,
        color: "#bfe7ff",
      });
    }
  }

  /** A water ring-out: a crown of droplets and a ring on the surface. */
  splash(point: Vector3, color = "#d6f3f0"): void {
    const r = this.random;
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.3;
      const speed = 1.2 + r() * 1.8;
      this.spawn("drop", {
        p: point,
        v: tmpV.set(Math.cos(a) * speed, 3 + r() * 3.5, Math.sin(a) * speed),
        gravity: -11,
        life: 0.9,
        size: 0.05 + r() * 0.05,
        color,
      });
    }
    this.spawn("ring", { p: point, life: 0.7, size: 1.4, color, flat: true });
    this.spawn("ring", { p: point, life: 1.0, size: 2.2, color, flat: true });
  }

  /** Electric zap (self-damage): yellow petals around a point. */
  zap(point: Vector3): void {
    this.spark(point, { colors: ["#ffe14d", "#fff6b0", "#7fe3ff"], strength: 0.6 });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (const pool of Object.values(this.particles)) {
      for (const particle of pool) {
        if (!particle.alive) continue;
        particle.age += dt;
        if (particle.age >= particle.life) {
          particle.alive = false;
          continue;
        }
        if (particle.drag > 0) particle.v.multiplyScalar(Math.exp(-particle.drag * dt));
        particle.v.y += particle.gravity * dt;
        particle.p.addScaledVector(particle.v, dt);
      }
    }
  }
}

function particleMatrix(particle: Particle, camera: Quaternion, out: Matrix4): Matrix4 {
  const u = particle.age / particle.life;
  let sx = particle.size;
  let sy = particle.size;
  let sz = particle.size;
  tmpP.copy(particle.p);
  switch (particle.kind) {
    case "core": {
      // Pops to full in a frame, then collapses.
      const s = u < 0.15 ? u / 0.15 : 1 - ((u - 0.15) / 0.85) ** 1.5;
      sx = sy = sz = particle.size * (0.4 + 0.9 * s);
      tmpQ.copy(camera).multiply(tmpQ2.setFromAxisAngle(Z, particle.angle + u * 0.6));
      break;
    }
    case "petal": {
      // Punch out, then thin and fly on.
      const out = 0.12 + 0.7 * (1 - (1 - Math.min(1, u * 1.6)) ** 3);
      const length = particle.size * particle.stretch * (u < 0.2 ? 0.4 + 3 * u : 1 - 0.55 * (u - 0.2));
      const width = particle.size * (1 - u * 0.85);
      tmpQ.copy(camera).multiply(tmpQ2.setFromAxisAngle(Z, particle.angle - Math.PI / 2));
      // Offset along the petal's own axis (its local +Y) from the contact point.
      tmpV.set(0, out * particle.size * 1.2, 0).applyQuaternion(tmpQ);
      tmpP.add(tmpV);
      sx = width;
      sy = length;
      sz = particle.size;
      break;
    }
    case "puff": {
      const s = u < 0.25 ? 0.5 + 2 * u : 1 - ((u - 0.25) / 0.75) ** 2;
      sx = sy = sz = particle.size * s;
      tmpQ.setFromAxisAngle(Y, particle.angle + u);
      break;
    }
    case "sweat":
    case "drop": {
      const speed = particle.v.length();
      if (speed > 0.01) tmpQ.setFromUnitVectors(Y, tmpV.copy(particle.v).divideScalar(speed));
      else tmpQ.identity();
      const shrink = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      sx = sz = particle.size * shrink;
      sy = particle.size * shrink * (1.6 + Math.min(1.2, speed * 0.12));
      break;
    }
    case "ring": {
      const s = 0.25 + (1 - (1 - u) ** 2.2);
      sx = sy = particle.size * s;
      sz = particle.size * (1 - u) * 0.9 + 0.05;
      if (particle.flat) tmpQ.setFromAxisAngle(X, -Math.PI / 2);
      else tmpQ.copy(camera);
      break;
    }
  }
  return out.compose(tmpP, tmpQ, tmpS.set(sx, sy, sz));
}

function useFxMaterial(options: { emissive?: string; glow?: number; specular?: number }): ToonMaterial {
  const material = useMemo(() => {
    const material = createToonMaterial({
      vertexColors: false,
      color: "#ffffff",
      emissive: options.emissive ?? "#ffffff",
      specular: options.specular ?? 0.35,
      rim: 0.35,
      translucency: 0.35,
      shade: 0.62,
    });
    material.emissiveIntensity = options.glow ?? 0.15;
    return material;
    // Materials are built once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function Pool({ system, kind, geometry, material }: { system: FxSystem; kind: Kind; geometry: BufferGeometry; material: ToonMaterial }) {
  const mesh = useMemo(() => {
    const instanced = new InstancedMesh(geometry, material, POOL[kind]);
    instanced.frustumCulled = false;
    instanced.count = 0;
    instanced.castShadow = false;
    instanced.receiveShadow = false;
    // Allocate per-instance colours.
    instanced.setColorAt(0, new Color());
    return instanced;
  }, [geometry, material, kind]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    let count = 0;
    for (const particle of system.particles[kind]) {
      if (!particle.alive) continue;
      mesh.setMatrixAt(count, particleMatrix(particle, camera.quaternion, tmpM));
      mesh.setColorAt(count, particle.color);
      count += 1;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** Renders and advances an FxSystem on the presentation clock. */
export function FightFx({ system }: { system: FxSystem }) {
  const clock = useStageClock();
  const geometries = useMemo(
    () => ({
      core: starGeometry(8, 0.42),
      petal: petalGeometry(),
      puff: new IcosahedronGeometry(1, 1),
      drop: new SphereGeometry(1, 10, 8),
      ring: new TorusGeometry(1, 0.08, 6, 36),
    }),
    [],
  );
  const hot = useFxMaterial({ emissive: "#fff3c4", glow: 1.6, specular: 0.2 });
  const petal = useFxMaterial({ emissive: "#fff0c0", glow: 0.55 });
  const dust = useFxMaterial({ emissive: "#000000", glow: 0, specular: 0.1 });
  const water = useFxMaterial({ emissive: "#d8f6ff", glow: 0.45, specular: 0.9 });
  const ring = useFxMaterial({ emissive: "#fff6dc", glow: 1.1, specular: 0.2 });
  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries]);
  useFrame(() => system.update(clock.delta), -10);
  return (
    <>
      <Pool system={system} kind="core" geometry={geometries.core} material={hot} />
      <Pool system={system} kind="petal" geometry={geometries.petal} material={petal} />
      <Pool system={system} kind="puff" geometry={geometries.puff} material={dust} />
      <Pool system={system} kind="sweat" geometry={geometries.drop} material={water} />
      <Pool system={system} kind="drop" geometry={geometries.drop} material={water} />
      <Pool system={system} kind="ring" geometry={geometries.ring} material={ring} />
    </>
  );
}

/** Gold stars circling a knocked-out head. */
export function KoStars({ head, visible }: { head: () => Vector3 | null; visible: () => boolean }) {
  const group = useRef<Group>(null);
  const clock = useStageClock();
  const geometry = useMemo(() => starGeometry(5, 0.48), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useFxMaterial({ emissive: "#ffd34d", glow: 0.7 });
  const spin = useRef(0);
  const appear = useRef(0);
  useFrame((_, realDelta) => {
    const node = group.current;
    if (!node) return;
    appear.current = Math.min(1, Math.max(0, appear.current + (visible() ? realDelta * 3 : -realDelta * 4)));
    const point = head();
    node.visible = appear.current > 0.01 && point !== null;
    if (!point || !node.visible) return;
    spin.current += Math.max(clock.delta, realDelta * 0.25) * 3.2;
    node.position.set(point.x, point.y + 0.28, point.z);
    node.children.forEach((child, i) => {
      const a = spin.current + (i / node.children.length) * Math.PI * 2;
      child.position.set(Math.cos(a) * 0.32, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.32);
      child.rotation.set(0, -a, a * 0.5);
      const pop = appear.current < 1 ? appear.current * (1.25 - 0.25 * appear.current) : 1;
      child.scale.setScalar(0.085 * pop);
    });
  });
  return (
    <group ref={group} visible={false}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={geometry} material={material} />
      ))}
    </group>
  );
}
