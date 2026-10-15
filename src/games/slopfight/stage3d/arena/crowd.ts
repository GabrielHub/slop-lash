// Grounded breathing and weight shifts at rest; anticipation, a hop, and a
// soft landing when the room cheers. Each authored node keeps its own facing.
// Absolute reaction times make the motion identical at 30, 60 and 120 Hz.

import { Euler, Quaternion, Vector3, type Object3D } from "three";
import { hash01 } from "../director/noise";

interface Reaction {
  at: number;
  height: number;
  anticipation: number;
  flight: number;
  recovery: number;
}

interface Member {
  object: Object3D;
  base: Vector3;
  baseScale: Vector3;
  facing: Quaternion;
  phase: number;
  rate: number;
  delay: number;
  reactions: Reaction[];
}

const GRAVITY = 14;
const TAU = Math.PI * 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const endOf = (r: Reaction) => r.at + r.anticipation + r.flight + r.recovery;

export class CrowdController {
  /** 0..1 excitement, available to presentation consumers. */
  energy = 0;
  private members: Member[] = [];
  private time = 0;
  private cheerIndex = 0;
  private tilt = new Euler();
  private rotation = new Quaternion();

  bind(objects: readonly Object3D[]): void {
    this.reset();
    this.members = objects.map((object, index) => ({
      object,
      base: object.position.clone(),
      baseScale: object.scale.clone(),
      facing: object.quaternion.clone(),
      phase: hash01(index, 11) * TAU,
      rate: 0.22 + hash01(index, 12) * 0.16,
      delay: hash01(index, 13) * 0.32,
      reactions: [],
    }));
  }

  reset(): void {
    for (const m of this.members) {
      m.object.position.copy(m.base);
      m.object.scale.copy(m.baseScale);
      m.object.quaternion.copy(m.facing);
    }
    this.members = [];
    this.time = 0;
    this.energy = 0;
    this.cheerIndex = 0;
  }

  get size(): number {
    return this.members.length;
  }

  /** A staggered response, with a second smaller hop from a few enthusiasts. */
  cheer(strength = 1): void {
    const s = Math.min(1, Math.max(0, strength));
    if (s === 0) return;
    this.energy = Math.min(1, this.energy + s * 0.6);
    const sequence = this.cheerIndex++;
    this.members.forEach((m, index) => {
      const roll = hash01(index + sequence * 97, 21);
      if (roll > 0.3 + 0.7 * s) return;
      // Do not interrupt an airborne spectator or queue an endless celebration.
      if (m.reactions.some((r) => endOf(r) > this.time)) return;
      const reaction: Reaction = {
        at: this.time + m.delay,
        height: (0.12 + 0.22 * s) * (0.75 + roll * 0.5),
        anticipation: 0.14 + hash01(index, 22) * 0.07,
        flight: 0,
        recovery: 0.22 + hash01(index, 23) * 0.1,
      };
      reaction.flight = 2 * Math.sqrt((2 * reaction.height) / GRAVITY);
      m.reactions = [reaction];
      if (s > 0.75 && roll < 0.3) {
        const height = reaction.height * 0.55;
        m.reactions.push({
          ...reaction,
          at: endOf(reaction) + 0.15 + roll * 0.5,
          height,
          flight: 2 * Math.sqrt((2 * height) / GRAVITY),
        });
      }
    });
  }

  /** Presentation seconds: a hit stop also freezes the audience. */
  update(delta: number): void {
    if (delta <= 0) return;
    this.time += delta;
    this.energy = Math.max(0, this.energy - delta * 0.18);
    for (const m of this.members) {
      const phase = this.time * m.rate * TAU + m.phase;
      const breath = Math.sin(phase) * 0.009;
      let y = 0;
      let stretch = 0;
      let cheerLean = 0;
      const r = m.reactions.find((reaction) => this.time >= reaction.at && this.time <= endOf(reaction));
      if (r) {
        const age = this.time - r.at;
        const crouch = 0.07 + r.height * 0.15;
        if (age < r.anticipation) {
          stretch = -crouch * smooth(age / r.anticipation);
        } else if (age < r.anticipation + r.flight) {
          const u = (age - r.anticipation) / r.flight;
          y = 4 * r.height * u * (1 - u);
          stretch = -crouch * (1 - smooth(Math.min(1, u / 0.32))) + 0.075 * Math.sin(Math.PI * u);
        } else {
          const u = (age - r.anticipation - r.flight) / r.recovery;
          stretch = -crouch * Math.sin(Math.PI * u) ** 2;
        }
        cheerLean = Math.sin((Math.PI * age) / (endOf(r) - r.at)) * 0.035;
      }
      // Feet stay at their authored height at rest. Breathing changes the body
      // about its foot origin instead of making everyone hover or pogo.
      const sy = 1 + breath + stretch;
      const width = 1 / Math.sqrt(sy);
      m.object.position.set(m.base.x, m.base.y + y, m.base.z);
      m.object.scale.set(m.baseScale.x * width, m.baseScale.y * sy, m.baseScale.z * width);
      this.tilt.set(
        Math.sin(phase * 0.73) * 0.012 - cheerLean,
        Math.sin(phase * 0.47) * 0.035,
        Math.sin(phase * 0.61) * 0.018,
      );
      m.object.quaternion.copy(m.facing).multiply(this.rotation.setFromEuler(this.tilt));
    }
  }
}
