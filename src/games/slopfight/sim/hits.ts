// Resolve impact magnitudes from the same pre-hit fighter state. The fight
// queues these records before applying any damage, so simultaneous blows stay
// simultaneous. These functions consume only the attacker's named RNG stream.
import type { ArenaGeometry } from "../arenas";
import type { MoveType } from "../vocab";
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
}

const baseDamage = (power: number) => K.DMG_BASE + K.DMG_PER_POWER * power;

export function moveHit(
  att: Fighter,
  def: Fighter,
  kind: "strike" | "counter" | "poke",
  impact: number,
  point: V3,
): HitRecord {
  const { index: move, type, effPower } = att.move!;
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
        (type === "STRIKE" ? K.STRIKE_DAMAGE : type === "TRICK" ? K.TRICK_DAMAGE : 1),
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
      (downed ? K.DOWNED_KNOCKBACK : 1);
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
  };
}

export function throwHit(f: Fighter, foe: Fighter, geometry: ArenaGeometry): HitRecord {
  const m = f.move!;
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
        (miracle ? K.MIRACLE_DAMAGE : 1),
    ),
  );
  const dv =
    (K.THROW_KB_BASE + K.THROW_KB_PER_POWER * m.effPower) *
    f.mods.knockbackDealt *
    foe.mods.knockbackTaken *
    bonus *
    (miracle ? K.MIRACLE_KNOCKBACK : 1);
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
  };
}
