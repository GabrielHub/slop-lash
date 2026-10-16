// Resolve impact magnitudes from the same pre-hit fighter state. The fight
// queues these records before applying any damage, so simultaneous blows stay
// simultaneous. These functions consume only the attacker's named RNG stream.
// Finishes scale a hit locally: the part that delivered it (attackFinish) and
// the part it landed on (guardFinish), both exactly 1 for vinyl.
import type { ArenaGeometry } from "../arenas";
import { FINISH_EFFECTS } from "../finishes";
import type { Finish, MoveType } from "../vocab";
import { com, edgeGradient, flatDir } from "./collision";
import { clamp } from "./dmath";
import type { Fighter } from "./fighter";
import * as K from "./tuning";
import type { StaggerCause } from "./types";
import type { V3 } from "./vec";

export interface HitRecord {
  att: Fighter;
  def: Fighter;
  move: number;
  type: MoveType;
  kind: "strike" | "counter" | "poke" | "throw";
  damage: number;
  dv: number;
  dir: V3;
  point: V3;
  miracle: boolean;
  forceStagger: StaggerCause | null;
  staggerMul: number;
  staggerMs: number;
  /** What the attacker's part that landed it is made of. */
  attackFinish: Finish;
  /** What the defender's part it landed on is made of. */
  guardFinish: Finish;
}

const baseDamage = (power: number) => K.DMG_BASE + K.DMG_PER_POWER * power;

export function moveHit(
  att: Fighter,
  def: Fighter,
  kind: "strike" | "counter" | "poke",
  impact: number,
  point: V3,
  attackFinish: Finish,
  guardFinish: Finish,
): HitRecord {
  const { index: move, type, effPower } = att.move!;
  const hitter = FINISH_EFFECTS[attackFinish];
  const guard = FINISH_EFFECTS[guardFinish];
  const broken = kind === "strike" && def.move?.type === "TRICK" && def.move.phase === "windup";
  const bonus =
    kind === "counter"
      ? K.COUNTER_BONUS
      : kind === "poke"
        ? K.POKE_FACTOR
        : broken
          ? K.TRICK_BROKEN_BONUS
          : 1;
  const miracle = att.rng.chance(
    K.MIRACLE_BASE + K.MIRACLE_PER_CHAOS * Math.min(1, att.profile.chaos),
  );
  const downed = def.mode === "stagger" || def.mode === "getup";
  const damage = Math.max(
    1,
    Math.round(
      baseDamage(effPower) *
        impact *
        att.mods.damageDealt *
        def.mods.damageTaken *
        bonus *
        (miracle ? K.MIRACLE_DAMAGE : 1) *
        (downed ? K.DOWNED_DAMAGE : 1) *
        (type === "STRIKE" ? K.STRIKE_DAMAGE : type === "TRICK" ? K.TRICK_DAMAGE : 1) *
        hitter.hitDamage *
        guard.guardDamage,
    ),
  );
  const immune = type === "STRIKE" && def.mods.strikeKnockbackImmune;
  const dv = immune
    ? 0
    : (K.KB_BASE + K.KB_PER_POWER * effPower) *
      impact *
      att.mods.knockbackDealt *
      def.mods.knockbackTaken *
      (miracle ? K.MIRACLE_KNOCKBACK : 1) *
      (kind === "poke" ? 0.6 : 1) *
      (downed ? K.DOWNED_KNOCKBACK : 1) *
      hitter.hitKnockback *
      guard.guardKnockback;
  const dir = flatDir(att, def);
  return {
    att,
    def,
    move,
    type,
    kind,
    damage,
    dv,
    dir: [dir[0], 0, dir[1]],
    point,
    miracle,
    forceStagger: broken ? "trickBroken" : null,
    staggerMul: kind === "counter" ? 0.6 : 1,
    staggerMs: 0,
    attackFinish,
    guardFinish,
  };
}

/** A throw: the grip's finish against the victim's core (the torso it was held by). */
export function throwHit(f: Fighter, foe: Fighter, geometry: ArenaGeometry): HitRecord {
  const m = f.move!;
  const attackFinish = m.finish;
  const guardFinish = foe.def.bodies[0]!.finishes[0]!;
  const hitter = FINISH_EFFECTS[attackFinish];
  const guard = FINISH_EFFECTS[guardFinish];
  // Throw away from the thrower, bent toward the victim's nearest drop.
  const forward = flatDir(f, foe);
  const c = com(foe);
  const edge = edgeGradient(geometry, c[0], c[2]);
  const pull = clamp((2.2 - foe.edgeDist) / 2.2, 0, 1) * K.THROW_EDGE_PULL;
  const dirX = forward[0] * (1 - pull) - edge[0] * pull;
  const dirZ = forward[1] * (1 - pull) - edge[1] * pull;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
  const bonus = m.victimInRecovery ? K.RECOVERY_GRAB_BONUS : 1;
  const miracle = f.rng.chance(K.MIRACLE_BASE + K.MIRACLE_PER_CHAOS * Math.min(1, f.profile.chaos));
  const damage = Math.max(
    1,
    Math.round(
      baseDamage(m.effPower) *
        K.THROW_DAMAGE *
        f.mods.damageDealt *
        foe.mods.damageTaken *
        bonus *
        (miracle ? K.MIRACLE_DAMAGE : 1) *
        hitter.hitDamage *
        guard.guardDamage,
    ),
  );
  const dv =
    (K.THROW_KB_BASE + K.THROW_KB_PER_POWER * m.effPower) *
    f.mods.knockbackDealt *
    foe.mods.knockbackTaken *
    bonus *
    (miracle ? K.MIRACLE_KNOCKBACK : 1) *
    hitter.hitKnockback *
    guard.guardKnockback;
  return {
    att: f,
    def: foe,
    move: m.index,
    type: "GRAPPLE",
    kind: "throw",
    damage,
    dv,
    dir: [dirX / len, 0, dirZ / len],
    point: c,
    miracle,
    forceStagger: "throw",
    staggerMul: 1,
    staggerMs: K.THROW_STAGGER_MS + 40 * m.effPower,
    attackFinish,
    guardFinish,
  };
}
