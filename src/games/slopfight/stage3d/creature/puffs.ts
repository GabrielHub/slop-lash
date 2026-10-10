// Puffs and dust: a small pool of toon-shaded blobs drawn as one instanced
// mesh. Parts landing during growth get a bright puff; hops and heavy steps
// kick up a little dust. Kept sparse on purpose (spec: no particle spam).

import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { createToonMaterial } from "../look/toon";

interface Puff {
  pos: Vector3;
  vel: Vector3;
  age: number;
  life: number;
  size: number;
  active: boolean;
}

export type PuffKind = "puff" | "dust";

const PUFF_COLOR = new Color("#fff4e2");
const DUST_COLOR = new Color("#d9c4a1");
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0);

export class PuffField {
  readonly mesh: InstancedMesh;
  private items: Puff[];
  private next = 0;
  private seed = 1;

  constructor(capacity = 48) {
    const material = createToonMaterial({ vertexColors: false, color: "#ffffff", rim: 0.2, specular: 0, translucency: 0.5 });
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.items = Array.from({ length: capacity }, () => ({
      pos: new Vector3(),
      vel: new Vector3(),
      age: 0,
      life: 1,
      size: 0,
      active: false,
    }));
    for (let i = 0; i < capacity; i += 1) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, PUFF_COLOR);
    }
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** A ring of blobs around `position` (parent space), sized to `radius`. */
  emit(position: Vector3, radius: number, kind: PuffKind = "puff", count = kind === "puff" ? 6 : 5) {
    for (let k = 0; k < count; k += 1) {
      const item = this.items[this.next]!;
      this.next = (this.next + 1) % this.items.length;
      const a = (k / count) * Math.PI * 2 + this.random() * 0.8;
      const up = kind === "puff" ? 0.4 + this.random() * 0.8 : 0.15 + this.random() * 0.2;
      item.pos.copy(position);
      item.pos.x += Math.cos(a) * radius * 0.5;
      item.pos.z += Math.sin(a) * radius * 0.5;
      const speed = radius * (kind === "puff" ? 2.6 : 2.2) * (0.7 + this.random() * 0.6);
      item.vel.set(Math.cos(a) * speed, up * speed, Math.sin(a) * speed);
      item.age = 0;
      item.life = kind === "puff" ? 0.45 + this.random() * 0.2 : 0.5 + this.random() * 0.25;
      item.size = radius * (kind === "puff" ? 0.32 : 0.26) * (0.75 + this.random() * 0.5);
      item.active = true;
      this.mesh.setColorAt(this.items.indexOf(item), kind === "puff" ? PUFF_COLOR : DUST_COLOR);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    let any = false;
    this.items.forEach((item, i) => {
      if (!item.active) return;
      item.age += dt;
      if (item.age >= item.life) {
        item.active = false;
        this.mesh.setMatrixAt(i, ZERO);
        any = true;
        return;
      }
      item.vel.multiplyScalar(Math.exp(-dt * 5));
      item.vel.y -= dt * 0.4;
      item.pos.addScaledVector(item.vel, dt);
      const t = item.age / item.life;
      const grow = t < 0.2 ? 1 + 0.25 * Math.sin((t / 0.2) * Math.PI * 0.5) * (t / 0.2) : 1.25 - 1.25 * ((t - 0.2) / 0.8) ** 1.6;
      const s = item.size * Math.max(0, t < 0.2 ? (t / 0.2) * grow : grow);
      tmpM.compose(item.pos, tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(i, tmpM);
      any = true;
    });
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as { dispose(): void }).dispose();
    this.mesh.dispose();
  }
}
