// Every tunable number in the fight sim, in one place. Units: lengths in
// world units (a standard fighter is 1 tall), time in ms unless named _S,
// speeds in units/s, masses in kg-ish, impulses in N*s-ish.
//
// Changing any value here changes every fight's outcome for a given seed;
// stored outcomes are only replayable by the build that produced them.

import type { BodyPlan } from "../vocab";

export const STEP_HZ = 60;
export const DT = 1 / STEP_HZ;
export const STEP_MS = 1000 / STEP_HZ;
export const GRAVITY = 12;
export const SOLVER_ITERATIONS = 4;
/** Inner PGS passes per solver iteration: light limbs on heavy torsos jitter without them. */
export const PGS_ITERATIONS = 2;

// --- Bodies -----------------------------------------------------------------
/** Total mass = MASS_BASE * (MASS_HEFT_BASE + MASS_PER_HEFT * heft) * scale * plan factor. */
export const MASS_BASE = 8;
export const MASS_HEFT_BASE = 0.8;
export const MASS_PER_HEFT = 0.07;
export const PLAN_MASS: Record<BodyPlan, number> = {
  BIPED: 1,
  QUADRUPED: 1,
  MULTIPED: 1,
  HOPPER: 1.08,
  SLITHER: 0.95,
  FLIER: 0.7,
};
/** The torso carries at least this share of the volume-based split (the limb floor below can lower it for many-limbed bodies). */
export const TORSO_MASS_SHARE_MIN = 0.5;
export const BODY_MASS_SHARE_MIN = 0.015;
/** Every limb weighs at least this fraction of the torso; bigger mass ratios make joints bounce. */
export const LIMB_MASS_RATIO_MIN = 0.15;
/** At most this many rigid bodies per fighter; deeper bones weld onto their nearest bodied ancestor. */
export const MAX_BODIES = 18;
export const FIGHTER_FRICTION = 0.7;
export const SLITHER_FRICTION = 0.35;
export const FIGHTER_RESTITUTION = 0.05;
export const ARENA_FRICTION = 0.85;
export const LINEAR_DAMPING = 0.15;
export const ANGULAR_DAMPING = 0.6;

// --- Active ragdoll servos (velocity-level, per-step blend toward a target) --
export const KP_ROT = 9; // 1/s: torso orientation error -> angular velocity
export const A_ROT = 0.35;
export const MAX_SERVO_ANGVEL = 14;
export const KP_LIN = 1; // locomotion velocity blend is direct
export const A_LIN = 0.22;
/** pushImmune fighters hold their line against shoves with a firmer velocity servo (hits still knock them back). */
export const A_LIN_PUSH_IMMUNE = 0.35;
export const KP_HEIGHT = 9; // 1/s: height error -> vertical velocity
export const A_HEIGHT = 0.35;
export const MAX_LIFT_SPEED = 3;
export const KP_LIMB = 12;
export const A_LIMB = 0.45;
export const KP_STRIKE = 22;
export const A_STRIKE = 0.8;
export const MAX_LIMB_ANGVEL = 16;
/** Legs clear the floor by this much while the torso floats at stance height. */
export const STANCE_CLEARANCE = 0.025;
export const FLIER_HOVER = 0.5;
/** A swooping flier rises at most this far above its hover height to meet a taller foe. */
export const FLIER_SWOOP_MAX_RISE = 0.3;
/** Torso strength while staggered and the floppy limb stiffness then. */
export const STAGGER_STRENGTH = 0.02;
export const RAGDOLL_LIMB_STRENGTH = 0.08;
export const GETUP_MS = 420;
/** Grabs can't land on a fighter this soon after it gets up. */
export const WAKE_PROTECT_MS = 700;
/** Ragdoll joint friction: per-step blend of a limb's spin toward its parent's. */
export const RAGDOLL_JOINT_DAMPING = 0.12;
/** Ragdoll limbs blend this much toward moving rigidly with their parent (kills joint jitter). */
export const RAGDOLL_LIMB_LIN = 0.15;
/** A downed ragdoll on the floor loses this share of its horizontal speed per step (rolling friction). */
export const RAGDOLL_FLOOR_DRAG = 0.07;
/** ...and this share of any upward bounce. */
export const RAGDOLL_BOUNCE_DAMP = 0.3;
/** No floor drag for this long after a launch or knockback, so throws still fly. */
export const DRAG_GRACE_MS = 280;
/** Knockback on a fighter that is already down or getting up. */
export const DOWNED_KNOCKBACK = 0.5;
/** ...and damage: kicking a fighter while it is down is allowed but weak, and never re-staggers. */
export const DOWNED_DAMAGE = 0.6;
export const FLIER_STAGGER_GRAVITY = 0.12;
export const FLIER_STAGGER_MAX_MS = 700;
/** A staggered flier loses this share of its horizontal speed per step (after the drag grace). */
export const FLIER_AIR_DRAG = 0.05;
/** A torso this far past the platform edge (or a pit rim) still stands on its feet. */
export const SUPPORT_MARGIN = 0.12;

// --- Locomotion -------------------------------------------------------------
/** Speed (locomotion and move timing) lost per Heft point above 3, gained per point below. */
export const HEFT_SLOW = 0.12;
/** Bounds on a fighter's overall speed multiplier (traits x size x Heft). */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 1.45;
export const BASE_SPEED = 1.55;
export const PLAN_SPEED: Record<BodyPlan, number> = {
  BIPED: 1,
  QUADRUPED: 1.02,
  MULTIPED: 0.78,
  HOPPER: 1.05,
  SLITHER: 0.88,
  FLIER: 1.05,
};
/** Turn rate, rad/s. Multipeds are stable and slow to turn. */
export const PLAN_TURN: Record<BodyPlan, number> = {
  BIPED: 7,
  QUADRUPED: 5.5,
  MULTIPED: 2.2,
  HOPPER: 6,
  SLITHER: 5,
  FLIER: 6.5,
};
/** Gait stride per unit of fighter height. */
export const STRIDE = 0.55;
export const HOP_VY = 2.9;
export const HOP_RECOVER_MS = 150;
export const HOP_SPEED = 1.35;
/** A fighter on its feet drifts with a push (wind, slope) at this many units/s per unit/s^2. */
export const PUSH_DRIFT = 0.3;
/** Pounce (hopper strike) aim error, radians-ish, scaled by 0.4 + chaos. */
export const HOP_AIM_ERROR = 0.35;
/** A limb reaching less than this far past the torso's front surface strikes and grabs together with the body. */
export const BURIED_LIMB = 0.06;
/** Turn-rate multiplier while turning the back for a tail swing. */
export const REAR_TURN_BOOST = 2.2;

// --- Moves ------------------------------------------------------------------
/** Effective move power (power + trait and note bonuses) above this counts at POWER_OVER_CAP per point. */
export const POWER_SOFT_CAP = 4;
export const POWER_OVER_CAP = 0.5;
export const STRIKE_WINDUP_MS = 300;
export const STRIKE_WINDUP_PER_POWER = 30;
export const STRIKE_ACTIVE_MS = 190;
export const STRIKE_RECOVER_MS = 300;
export const STRIKE_RECOVER_PER_POWER = 40;
/** Strike windup and recovery stretch by this share per effective Reach point above 3 (and shrink below). */
export const REACH_TIMING = 0.08;
export const STRIKE_LUNGE = 1.7;
export const STRIKE_LUNGE_PER_REACH = 0.12;
export const BODY_LUNGE = 2.4;
export const GRAPPLE_APPROACH_MS = 520;
export const GRAPPLE_APPROACH_SPEED = 1.6;
export const GRAPPLE_HOLD_MS = 480;
export const GRAPPLE_MISS_RECOVER_MS = 560;
export const GRAPPLE_THROW_RECOVER_MS = 260;
export const TRICK_SETUP_MS = 220;
export const TRICK_ACTIVE_MS = 360;
export const TRICK_RECOVER_MS = 260;
export const DODGE_SPEED = 2.6;
export const MOVE_COOLDOWN_MS = 900;
export const MOVE_COOLDOWN_PER_POWER = 180;

// Ranges.
export const HIT_MARGIN = 0.05;
export const HIT_MARGIN_PER_REACH = 0.01;
export const LUNGE_REACH = 0.14;
export const LUNGE_REACH_PER_REACH = 0.025;
export const GRAB_MARGIN = 0.05;
export const GRAB_MARGIN_PER_REACH = 0.012;
export const GRAB_START_RANGE = 0.55;
export const COUNTER_RANGE = 0.35;

// --- Damage, knockback, stagger -----------------------------------------------
export const DMG_BASE = 2.2;
export const DMG_PER_POWER = 2.3;
/** Throws always land in full, so they hit a little softer than a clean strike. */
export const THROW_DAMAGE = 0.7;
/** Strikes are the risky, physical move (they must connect): a little extra damage. */
export const STRIKE_DAMAGE = 1.25;
/** Counters and pokes land often and cleanly, so they hit a little softer. */
export const TRICK_DAMAGE = 0.85;
/** How hard a throw bends toward the victim's nearest drop when it is close to one (0..1). */
export const THROW_EDGE_PULL = 0.3;
/** Slithers are low and hard to grapple: a grab on one slips this often, and brains rate grabbing one this much. */
export const SLITHER_SLIP = 0.3;
export const SLITHER_GRAB_APPEAL = 0.75;
/** Relative speed at contact that counts as a full-strength impact. */
export const IMPACT_REF_SPEED = 4;
export const IMPACT_MIN = 0.6;
export const IMPACT_MAX = 1.15;
/** Knockback delta-v for a standard-mass target: KB_BASE + KB_PER_POWER * power (units/s). */
export const KB_BASE = 0.5;
export const KB_PER_POWER = 0.38;
export const KB_UP = 0.35;
export const KB_MASS_REF = 8;
export const THROW_KB_BASE = 0.45;
export const THROW_KB_PER_POWER = 0.24;
export const THROW_UP = 0.55;
export const THROW_STAGGER_MS = 850;
/** A held fighter is lifted at most this high, whoever holds it. */
export const HELD_LIFT_MAX = 0.3;
export const COUNTER_BONUS = 1;
export const TRICK_BROKEN_BONUS = 1.35;
export const RECOVERY_GRAB_BONUS = 1.25;
export const RECOVERY_GRAB_RANGE = 1.6;
export const POKE_FACTOR = 0.6;
export const STAGGER_BASE = 4;
export const STAGGER_PER_HEFT = 0.5;
export const STAGGER_MIN_MS = 500;
export const STAGGER_MAX_MS = 1500;
/** A hit this big is flagged `big` even without a stagger. */
export const BIG_HIT_DAMAGE = 11;
/** Chaos miracles: chance per landed hit = base + per * chaos01; multipliers on damage and knockback. */
export const MIRACLE_BASE = 0.02;
export const MIRACLE_PER_CHAOS = 0.3;
export const MIRACLE_DAMAGE = 2;
export const MIRACLE_KNOCKBACK = 1.5;
/** Chaos aim error at the strike or grab target, units at chaos01 = 1. */
export const AIM_ERROR = 0.18;
/** Chance per strike or grab of a wild swing, per unit of chaos01, and how far off target it goes. */
export const WILD_CHANCE = 0.16;
export const WILD_AIM = 0.9;

// --- Brain ------------------------------------------------------------------
export const THINK_MS = 250;
export const THINK_MS_PER_AGGRESSION = 110;
export const THINK_MS_MIN = 90;
export const AGGRESSION_RAMP = 0.9;
export const SLOW_STARTER_MS = 2800;
export const LOW_HEALTH = 0.35;
export const SHOWBOAT_MS = 700;
export const SHOWBOAT_MS_PER = 600;
export const EDGE_WARN = 0.4;
export const EDGE_WARN_MS = 300;
export const EDGE_REARM = 0.8;
export const EDGE_AVOID = 0.95;

// --- Fight ------------------------------------------------------------------
export const HEALTH_SAMPLE_MS = 250;
export const CONTACT_GAP_MS = 400;
/** A torso this far below the platform top inside a pit has fallen in. */
export const PIT_DROP = 0.25;
/** In the finale a hurt fighter flies farther: knockback x (1 + this x finale strength x share of health lost). */
export const FINALE_HURT_KNOCKBACK = 1;
/** In the flood, a torso this far past the waterline is swept away (a hovering flier is not). */
export const FLOOD_SWEEP = 0.1;
/** Near the edge, a winner moving outward faster than this (m/s) holds the bell. */
export const BELL_SLIDE_SPEED = 0.1;
