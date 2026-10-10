// Pose -> creature: maps one fighter's sampled sim state onto a <Creature>
// driver every frame.
//
// The procedural rig places the creature by a ground point and a yaw; the sim
// gives the torso body. The ground point is the torso's head minus its rest
// offset turned by the facing, so the rendered body sits where the physics
// body is. Fliers and hoppers get their height from the physics (the rig's
// own hover lift is cancelled, and its procedural hop is switched off so the
// creature hops exactly when and as high as the proxy does, with a squash on
// launch and landing). The ragdoll weight ramps quickly toward the sim's
// (1 - motor strength), so a stagger or a KO turns the creature into its
// proxy bodies and a get-up springs it back. Expressions follow the events:
// wide then annoyed when hit, smug after landing one, wide on the edge,
// eyes closed on a KO.

import { buildProxyDef } from "../../sim";
import type { FightEvent, Side } from "../../sim";
import type { Champion } from "../../sheet";
import type { BodyPlan } from "../../vocab";
import { createDriver, type CreatureDriver, type Expression } from "../creature/animator";
import type { SampledFighter } from "./recording";

/** The sim's spawn clearance for legged fighters (sim/tuning STANCE_CLEARANCE). */
const STANCE_CLEARANCE = 0.025;
/** The rig's mean hover lift for fliers, as a fraction of height (creature/animator). */
const RIG_FLIER_LIFT = 0.3;

const RAGDOLL_RISE_S = 0.035;
const RAGDOLL_FALL_S = 0.1;

interface TimedFace {
  expression: Expression;
  until: number;
}

export class PoseDriver {
  readonly driver: CreatureDriver;
  readonly side: Side;
  readonly plan: BodyPlan;
  /** Rig height (the skeleton's standing height). */
  readonly height: number;
  /** Squash for the creature handle this frame (+ squash on landing, - stretch on launch); read and clear. */
  squash = 0;
  /** Jiggle strength for the creature handle this frame; read and clear. */
  jiggle = 0;
  /** A hopper just landed this frame (dust puff). */
  landed = false;

  private readonly head: readonly [number, number, number];
  private ragdoll = 0;
  private time = 0;
  private faces: TimedFace[] = [];
  private wasAirborne = false;
  private readonly anim: NonNullable<CreatureDriver["anim"]>;

  constructor(champion: Champion, side: Side) {
    const def = buildProxyDef(champion);
    const torso = def.bodies[0];
    this.head = torso ? [torso.head[0], torso.head[1], torso.head[2]] : [0, 0.5, 0];
    this.height = def.height;
    this.plan = champion.bodyPlan;
    this.side = side;
    this.driver = createDriver([0, 0, 0], side === "A" ? Math.PI / 2 : -Math.PI / 2);
    this.anim = {};
    this.driver.anim = this.anim;
  }

  /** Map this frame's sample onto the driver. `dt` is presentation seconds (0 in a hit stop). */
  update(sample: SampledFighter, dt: number): void {
    this.time += dt;
    const driver = this.driver;
    const root = sample.root;
    const yaw = sample.facing;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const [hx, hy, hz] = this.head;
    // Ground point under the creature origin: torso head minus its rest offset, turned by the yaw.
    driver.position[0] = root.p[0] - (hx * cos + hz * sin);
    driver.position[2] = root.p[2] - (-hx * sin + hz * cos);
    let y = root.p[1] - hy;
    if (this.plan === "FLIER") y -= RIG_FLIER_LIFT * this.height;
    else if (this.plan !== "HOPPER" && this.plan !== "SLITHER") y -= STANCE_CLEARANCE;
    driver.position[1] = y;
    driver.yaw = yaw;

    const hopper = this.plan === "HOPPER";
    driver.velocity[0] = hopper ? 0 : sample.velocity[0];
    driver.velocity[1] = sample.velocity[1];
    driver.velocity[2] = hopper ? 0 : sample.velocity[2];

    // Hops come from the physics: squash on launch and landing.
    const airborne = sample.live.airborne;
    this.landed = false;
    if (hopper && dt > 0) {
      if (airborne && !this.wasAirborne) this.squash = Math.min(this.squash, -0.16);
      if (!airborne && this.wasAirborne) {
        this.squash = Math.max(this.squash, 0.3);
        this.landed = true;
      }
    }
    if (dt > 0) this.wasAirborne = airborne;

    // Ragdoll weight: rise fast (a hit), fall a little slower (the get-up spring).
    const target = sample.anim.ragdoll;
    if (dt > 0) {
      const tau = target > this.ragdoll ? RAGDOLL_RISE_S : RAGDOLL_FALL_S;
      this.ragdoll += (target - this.ragdoll) * (1 - Math.exp(-dt / tau));
      if (target >= 0.97 && this.ragdoll > 0.9) this.ragdoll = Math.max(this.ragdoll, target);
      if (target <= 0.001 && this.ragdoll < 0.01) this.ragdoll = 0;
    }

    const anim = this.anim;
    const source = sample.anim;
    anim.locomotion = hopper ? "stand" : source.locomotion;
    anim.phase = source.phase;
    anim.speed = hopper ? 0 : source.speed;
    anim.intent = source.intent;
    anim.move = source.move;
    anim.moveType = source.moveType;
    anim.movePhase = source.movePhase;
    anim.progress = source.progress;
    anim.ragdoll = this.ragdoll;
    anim.reachTarget = source.reachTarget;
    driver.pose = sample;

    driver.expression = this.expressionFor(sample);
  }

  /** React to this fighter's part in an event (as attacker or target). */
  onEvent(event: FightEvent): void {
    const now = this.time;
    switch (event.kind) {
      case "hit":
      case "throw": {
        if (event.side === this.side) {
          this.face("smug", now + 0.25, now + 1.0);
        } else {
          const heavy = event.kind === "throw" || (event.kind === "hit" && event.big);
          this.faces = [
            { expression: "wide", until: now + (heavy ? 0.55 : 0.35) },
            { expression: "annoyed", until: now + (heavy ? 1.6 : 1.2) },
          ];
          this.jiggle = Math.max(this.jiggle, Math.min(1, 0.45 + event.damage / 25));
        }
        break;
      }
      case "selfDamage":
        if (event.side === this.side) {
          this.faces = [{ expression: "wide", until: now + 0.5 }];
          this.jiggle = Math.max(this.jiggle, 0.6);
        }
        break;
      case "whiff":
        if (event.side === this.side && event.reason !== "miss") this.face("annoyed", now, now + 0.8);
        break;
      case "dodge":
        if (event.side === this.side) this.face("smug", now, now + 0.7);
        break;
      default:
        break;
    }
  }

  private face(expression: Expression, from: number, until: number): void {
    // A delayed face waits behind whatever shows now.
    const head = this.faces.filter((face) => face.until > this.time && face.until <= from);
    this.faces = [...head, { expression, until }];
  }

  private expressionFor(sample: SampledFighter): Expression | null {
    const intent = sample.anim.intent;
    if (intent === "ko") return "closed";
    // A ring-out: eyes wide all the way down, shut once it lands.
    if (intent === "out") return sample.live.airborne ? "wide" : "closed";
    while (this.faces.length > 0 && this.faces[0]!.until <= this.time) this.faces.shift();
    const timed = this.faces[0]?.expression ?? null;
    if (timed === "wide") return timed;
    if (sample.live.onEdge && intent !== "showboat") return "wide";
    return timed;
  }
}
