// The crowd: twenty blob spectators (Crowd_01..20) that murmur-bounce while
// idle and jump when the room cheers. `cheer(strength)` is the API scenes and
// Hype call. Animation moves each member's own node (position + squash), so
// it costs no draw calls and no shader work.

import { Vector3, type Object3D } from "three";
import { hash01 } from "../director/noise";

interface Member {
  object: Object3D;
  base: Vector3;
  baseScale: Vector3;
  phase: number;
  rate: number;
  /** Seconds of cheer delay for this member (the wave travels). */
  delay: number;
  height: number;
  /** Jump state: time into the current jump, or -1 when grounded. */
  jumpT: number;
  jumpHeight: number;
  /** Squash on landing, decays. */
  squash: number;
}

const GRAVITY = 14;

export class CrowdController {
  /** 0..1, how excited the room is; decays. Raises idle bounce and jump rate. */
  energy = 0;
  private members: Member[] = [];
  private pendingCheers: Array<{ at: number; strength: number }> = [];
  private time = 0;

  /** Bind to a set's Crowd_NN nodes (replaces any previous set's crowd). */
  bind(objects: readonly Object3D[]): void {
    this.reset();
    this.members = objects.map((object, index) => ({
      object,
      base: object.position.clone(),
      baseScale: object.scale.clone(),
      phase: hash01(index, 11) * Math.PI * 2,
      rate: 1.3 + hash01(index, 12) * 1.1,
      delay: hash01(index, 13) * 0.28,
      height: 0.012 + hash01(index, 14) * 0.02,
      jumpT: -1,
      jumpHeight: 0,
      squash: 0,
    }));
  }

  /** Put every member back where the set placed them. */
  reset(): void {
    for (const member of this.members) {
      member.object.position.copy(member.base);
      member.object.scale.copy(member.baseScale);
    }
    this.members = [];
    this.pendingCheers = [];
  }

  get size(): number {
    return this.members.length;
  }

  /** The crowd erupts: 0..1. Members jump in a ragged wave. */
  cheer(strength = 1): void {
    const s = Math.min(1, Math.max(0, strength));
    this.energy = Math.min(1, this.energy + s * 0.6);
    this.pendingCheers.push({ at: this.time, strength: s });
  }

  /** Advance by `delta` presentation seconds (freezes in hit stop with the world). */
  update(delta: number): void {
    if (delta <= 0) return;
    this.time += delta;
    const t = this.time;
    const cheers = this.pendingCheers;

    this.members.forEach((member, index) => {
      // Cheers launch members once their delay has passed.
      for (const cheer of cheers) {
        if (t - cheer.at >= member.delay && t - cheer.at - delta <= member.delay) {
          const roll = hash01(index + Math.floor(cheer.at * 100), 21);
          if (roll < 0.35 + 0.65 * cheer.strength) this.launch(member, (0.18 + 0.32 * cheer.strength) * (0.7 + roll * 0.6));
        }
      }
      // Excited idle: occasional small hops.
      if (member.jumpT < 0 && this.energy > 0.15 && hash01(Math.floor(t * 3) * 97 + index, 31) < this.energy * delta * 2.4) {
        this.launch(member, 0.08 + 0.12 * this.energy);
      }

      let y = 0;
      if (member.jumpT >= 0) {
        member.jumpT += delta;
        const v0 = Math.sqrt(2 * GRAVITY * member.jumpHeight);
        y = v0 * member.jumpT - 0.5 * GRAVITY * member.jumpT * member.jumpT;
        if (y <= 0) {
          y = 0;
          member.jumpT = -1;
          member.squash = Math.min(1, member.jumpHeight * 3);
        }
      }
      // Murmur: a soft bob, faster with energy.
      const bob = Math.max(0, Math.sin(t * member.rate * (1 + this.energy) * Math.PI * 2 + member.phase));
      y += bob * member.height * (1 + this.energy * 2);
      member.squash = Math.max(0, member.squash - delta * 5);

      const stretch = member.jumpT >= 0 ? 0.08 : -0.18 * member.squash;
      member.object.position.set(member.base.x, member.base.y + y, member.base.z);
      member.object.scale.set(
        member.baseScale.x * (1 - stretch * 0.5),
        member.baseScale.y * (1 + stretch),
        member.baseScale.z * (1 - stretch * 0.5),
      );
    });

    this.pendingCheers = cheers.filter((cheer) => t - cheer.at < 0.5);
    this.energy = Math.max(0, this.energy - delta * 0.18);
  }

  private launch(member: Member, height: number): void {
    if (member.jumpT >= 0) return;
    member.jumpT = 0;
    member.jumpHeight = height;
  }
}
