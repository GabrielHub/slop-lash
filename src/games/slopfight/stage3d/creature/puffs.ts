// Puffs, dust and finish bursts: small pools of toon-shaded shapes, one
// instanced mesh each, drawn only while something in them is alive. Parts
// landing during growth get a bright puff, and a finished part its own burst
// (sparks off metal, glints off crystal, embers off lava, goo off slime...);
// hops and heavy steps kick up a little dust. Kept sparse on purpose (spec:
// no particle spam). Every pool uses the instanced toon program the stage
// prepares ahead (program-cache.ts), so a first burst never stalls.

import {
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { createToonMaterial, type ToonMaterial } from "../look/toon";
import type { FinishBurst } from "./finish-look";

export type PuffKind = "puff" | "dust";

/** How a pool's particles orient: tumbling, stretched along their velocity, or lying flat. */
type Orient = "tumble" | "streak" | "flat";

interface Particle {
  pos: Vector3;
  vel: Vector3;
  spin: Vector3;
  age: number;
  life: number;
  size: number;
  /** Length over width (streaks, splinters). */
  stretch: number;
  gravity: number;
  drag: number;
  color: Color;
}

const PUFF_COLOR = new Color("#fff4e2");
const DUST_COLOR = new Color("#d9c4a1");
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpS = new Vector3();
const tmpV = new Vector3();
const UP = new Vector3(0, 1, 0);
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

/** One instanced pool; the live particles are packed at the front. */
class Pool {
  readonly mesh: InstancedMesh;
  private readonly items: Particle[];
  private live = 0;

  constructor(
    geometry: BufferGeometry,
    readonly material: ToonMaterial,
    capacity: number,
    private readonly orient: Orient,
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.setColorAt(0, PUFF_COLOR);
    this.items = Array.from({ length: capacity }, () => ({
      pos: new Vector3(),
      vel: new Vector3(),
      spin: new Vector3(),
      age: 0,
      life: 1,
      size: 0,
      stretch: 1,
      gravity: 0,
      drag: 0,
      color: new Color(),
    }));
  }

  /** A fresh particle (the oldest one when the pool is full). */
  take(): Particle {
    if (this.live < this.items.length) return this.items[this.live++]!;
    let oldest = 0;
    for (let i = 1; i < this.items.length; i += 1) {
      if (this.items[i]!.age / this.items[i]!.life > this.items[oldest]!.age / this.items[oldest]!.life) oldest = i;
    }
    return this.items[oldest]!;
  }

  update(dt: number) {
    if (this.live === 0) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }
    let n = 0;
    for (let i = 0; i < this.live; i += 1) {
      const item = this.items[i]!;
      item.age += dt;
      if (item.age >= item.life) continue;
      if (item.drag > 0) item.vel.multiplyScalar(Math.exp(-dt * item.drag));
      item.vel.y += item.gravity * dt;
      item.pos.addScaledVector(item.vel, dt);
      // Keep the live ones packed at the front.
      if (n !== i) {
        const swap = this.items[n]!;
        this.items[n] = item;
        this.items[i] = swap;
      }
      const t = item.age / item.life;
      this.mesh.setMatrixAt(n, this.matrix(item, t));
      this.mesh.setColorAt(n, item.color);
      n += 1;
    }
    this.live = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private matrix(item: Particle, t: number): Matrix4 {
    // Pop in over the first fifth, overshoot a touch, then shrink away.
    const grow = t < 0.2 ? 1 + 0.25 * Math.sin((t / 0.2) * Math.PI * 0.5) * (t / 0.2) : 1.25 - 1.25 * ((t - 0.2) / 0.8) ** 1.6;
    const s = item.size * Math.max(0, t < 0.2 ? (t / 0.2) * grow : grow);
    switch (this.orient) {
      case "streak": {
        const speed = item.vel.length();
        if (speed > 1e-4) tmpQ.setFromUnitVectors(UP, tmpV.copy(item.vel).divideScalar(speed));
        else tmpQ.identity();
        tmpS.set(s, s * item.stretch * (0.7 + Math.min(1.5, speed * 0.25)), s);
        break;
      }
      case "flat":
        tmpQ.copy(FLAT);
        // Rings spread out and thin.
        tmpS.set(item.size * (0.3 + t * 1.1), item.size * (0.3 + t * 1.1), item.size * (1 - t) * 1.2 + 0.001);
        break;
      default:
        tmpQ.setFromAxisAngle(UP, item.spin.y * item.age).multiply(tmpQ2.setFromAxisAngle(tmpV.set(1, 0, 0), item.spin.x * item.age));
        tmpS.set(s, s * item.stretch, s);
    }
    return tmpM.compose(item.pos, tmpQ, tmpS);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Every pool of one creature's growth beats and footfalls; add `group` to the creature root. */
export class PuffField {
  readonly group = new Group();
  private readonly blobs: Pool;
  private readonly streaks: Pool;
  private readonly glass: Pool;
  private readonly chips: Pool;
  private readonly rings: Pool;
  private readonly pools: readonly Pool[];
  private seed = 1;

  constructor(capacity = 48) {
    const blob = createToonMaterial({ vertexColors: false, color: "#ffffff", rim: 0.2, specular: 0, translucency: 0.5 });
    this.blobs = new Pool(new IcosahedronGeometry(1, 1), blob, capacity, "tumble");
    // Sparks and embers glow hot (HDR, so they catch the bloom).
    const hot = createToonMaterial({ vertexColors: false, color: "#ffffff", emissive: "#ffb347", specular: 0, rim: 0, shade: 0.8 });
    hot.emissiveIntensity = 1.7;
    this.streaks = new Pool(new OctahedronGeometry(1, 0), hot, 24, "streak");
    // Crystal and ice shards: glossy, faintly lit from within.
    const glass = createToonMaterial({ vertexColors: false, color: "#ffffff", emissive: "#eaf6ff", specular: 1.2, specularSize: 0.96, rim: 0.5, translucency: 0.7, shade: 0.7 });
    glass.emissiveIntensity = 0.25;
    this.glass = new Pool(new OctahedronGeometry(1, 0), glass, 20, "tumble");
    // Wood splinters and stone chips: matte.
    const chip = createToonMaterial({ vertexColors: false, color: "#ffffff", specular: 0, rim: 0.15, translucency: 0.1 });
    this.chips = new Pool(new OctahedronGeometry(1, 0), chip, 20, "tumble");
    // The glow ring: emissive in the part's own colour.
    const ring = createToonMaterial({ vertexColors: false, color: "#ffffff", emissive: "#ffffff", specular: 0, rim: 0 });
    ring.emissiveIntensity = 1.8;
    this.rings = new Pool(new TorusGeometry(1, 0.07, 6, 32), ring, 4, "flat");
    this.pools = [this.blobs, this.streaks, this.glass, this.chips, this.rings];
    for (const pool of this.pools) this.group.add(pool.mesh);
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private spawn(
    pool: Pool,
    at: Vector3,
    init: { vel: Vector3; life: number; size: number; color: Color | string; gravity?: number; drag?: number; stretch?: number; spin?: number },
  ) {
    const item = pool.take();
    item.pos.copy(at);
    item.vel.copy(init.vel);
    item.age = 0;
    item.life = init.life;
    item.size = init.size;
    item.stretch = init.stretch ?? 1;
    item.gravity = init.gravity ?? 0;
    item.drag = init.drag ?? 0;
    const spin = init.spin ?? 0;
    if (spin > 0) item.spin.set((this.random() - 0.5) * spin, (this.random() - 0.5) * spin, 0);
    else item.spin.set(0, 0, 0);
    if (typeof init.color === "string") item.color.set(init.color);
    else item.color.copy(init.color);
  }

  /** A ring of blobs around `position` (parent space), sized to `radius`. */
  emit(position: Vector3, radius: number, kind: PuffKind = "puff", count = kind === "puff" ? 6 : 5) {
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + this.random() * 0.8;
      const up = kind === "puff" ? 0.4 + this.random() * 0.8 : 0.15 + this.random() * 0.2;
      const speed = radius * (kind === "puff" ? 2.6 : 2.2) * (0.7 + this.random() * 0.6);
      tmpV.set(position.x + Math.cos(a) * radius * 0.5, position.y, position.z + Math.sin(a) * radius * 0.5);
      this.spawn(this.blobs, tmpV, {
        vel: new Vector3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed),
        life: kind === "puff" ? 0.45 + this.random() * 0.2 : 0.5 + this.random() * 0.25,
        size: radius * (kind === "puff" ? 0.32 : 0.26) * (0.75 + this.random() * 0.5),
        color: kind === "puff" ? PUFF_COLOR : DUST_COLOR,
        gravity: -0.4,
        drag: 5,
      });
    }
  }

  /** A finished part's burst at `position`: its own particles in `colors` (sRGB hex), a few at most. */
  burst(position: Vector3, radius: number, kind: FinishBurst, colors: readonly string[]) {
    const color = (k: number) => colors[k % colors.length] ?? "#ffffff";
    const out = (a: number, up: number, speed: number) => new Vector3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed);
    const ring = (count: number, fn: (a: number, k: number) => void) => {
      for (let k = 0; k < count; k += 1) fn((k / count) * Math.PI * 2 + this.random() * 0.9, k);
    };
    switch (kind) {
      case "sparks":
        ring(10, (a, k) =>
          this.spawn(this.streaks, position, {
            vel: out(a, 0.5 + this.random() * 1.1, radius * (5 + this.random() * 3)),
            life: 0.32 + this.random() * 0.2,
            size: radius * 0.07,
            stretch: 3.2,
            color: color(k),
            gravity: -7,
            drag: 1.5,
          }),
        );
        break;
      case "embers":
        ring(9, (a, k) =>
          this.spawn(this.streaks, position, {
            vel: out(a, 0.9 + this.random() * 0.9, radius * (1.6 + this.random() * 1.8)),
            life: 0.7 + this.random() * 0.4,
            size: radius * (0.06 + this.random() * 0.04),
            stretch: 1.6,
            color: color(k),
            gravity: 1.2,
            drag: 2.2,
          }),
        );
        break;
      case "glints":
      case "frost":
        ring(kind === "glints" ? 8 : 7, (a, k) =>
          this.spawn(this.glass, position, {
            vel: out(a, 0.4 + this.random() * 0.9, radius * (2.6 + this.random() * 1.6)),
            life: 0.5 + this.random() * 0.25,
            size: radius * (0.1 + this.random() * 0.06),
            stretch: kind === "glints" ? 1.6 : 2.2,
            color: color(k),
            gravity: -2.5,
            drag: 3,
            spin: 14,
          }),
        );
        if (kind === "frost") this.mist(position, radius, colors, 4);
        break;
      case "dust":
        ring(6, (a, k) =>
          this.spawn(this.chips, position, {
            vel: out(a, 0.6 + this.random() * 0.6, radius * (2.4 + this.random() * 1.4)),
            life: 0.5 + this.random() * 0.2,
            size: radius * (0.08 + this.random() * 0.05),
            color: color(k),
            gravity: -8,
            drag: 1,
            spin: 12,
          }),
        );
        this.mist(position, radius, colors, 4);
        break;
      case "splinters":
        ring(7, (a, k) =>
          this.spawn(this.chips, position, {
            vel: out(a, 0.6 + this.random() * 0.8, radius * (2.8 + this.random() * 1.8)),
            life: 0.5 + this.random() * 0.25,
            size: radius * 0.06,
            stretch: 3.4,
            color: color(k),
            gravity: -8,
            drag: 1,
            spin: 18,
          }),
        );
        break;
      case "goo":
        ring(6, (a, k) =>
          this.spawn(this.blobs, position, {
            vel: out(a, 0.7 + this.random() * 0.8, radius * (2.4 + this.random() * 1.2)),
            life: 0.55 + this.random() * 0.2,
            size: radius * (0.16 + this.random() * 0.08),
            stretch: 0.8,
            color: color(k),
            gravity: -6,
            drag: 2,
          }),
        );
        break;
      case "ring": {
        this.rings.material.emissive.set(color(0));
        for (const [delay, size] of [
          [0, 1.3],
          [0.08, 1.9],
        ] as const) {
          this.spawn(this.rings, position, { vel: new Vector3(0, radius * 0.4, 0), life: 0.55 + delay, size: radius * size, color: "#ffffff" });
        }
        ring(4, (a) =>
          this.spawn(this.glass, position, {
            vel: out(a, 1 + this.random(), radius * 1.6),
            life: 0.6,
            size: radius * 0.07,
            color: color(0),
            gravity: 0.6,
            drag: 2,
            spin: 8,
          }),
        );
        break;
      }
    }
  }

  /** A few soft blobs in the burst's colours (frost mist, stone dust). */
  private mist(position: Vector3, radius: number, colors: readonly string[], count: number) {
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + this.random();
      const speed = radius * (1.6 + this.random());
      this.spawn(this.blobs, position, {
        vel: new Vector3(Math.cos(a) * speed, speed * 0.4, Math.sin(a) * speed),
        life: 0.55 + this.random() * 0.2,
        size: radius * 0.22,
        color: colors[(k + 1) % colors.length] ?? "#ffffff",
        gravity: -0.3,
        drag: 4,
      });
    }
  }

  update(dt: number) {
    for (const pool of this.pools) pool.update(dt);
  }

  dispose() {
    for (const pool of this.pools) pool.dispose();
  }
}
