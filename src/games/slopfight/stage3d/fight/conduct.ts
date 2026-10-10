// The fight's conductor: every frame it presents the sim at the presentation
// clock's time and turns each event it crosses into the beat the room sees
// and hears, at that event's presentation time:
//
// - hits: hit stop (four frozen frames), the impact frame, shake scaled by
//   damage, a spark burst in the attacker's colours, sweat off the target,
//   the move family's sound, the crowd; a big hit adds slow motion (0.3x for
//   half a second) with `slowmo_orbit` (rationed: the first big hit, then
//   only heavy ones at least four seconds apart, and the finishing blow),
//   then `ragdoll_follow` if the target flies;
// - first contact: a hard cut close; fighters within reach: `fight_close`;
//   presentation debt past ~0.9 s: a cut that repays it;
// - ON THE EDGE: the floor lights on that side flash red, `edge_drama` shows
//   the drop (it cuts over a ragdoll follow), the edge alarm sounds;
// - ring-out (signature #4): the victim goes over in the edge shot if that
//   is up, the camera follows the drop, a long falling scream, the arena's
//   landing (splash, clang, thud), two beats of silence with an iris on the
//   victim (a deep drop cuts down to a clear angle on it; the rooftop's long
//   fall cuts there just before the landing), then the crowd erupts with
//   RING OUT;
// - KO, DECISION and SUDDEN DEATH title slams; KO stars; the winner's
//   showboat close-up in the outro.
//
// Plain class (no React); FightStage owns one per fight.

import { Vector3 } from "three";
import { ARENAS, windFor, windStrengthAt, type ArenaId } from "../../arenas";
import { sfx, type SfxName, type SfxOptions } from "../../audio";
import type { Side } from "../../modifiers";
import { STEP_MS, type FightEvent } from "../../sim";
import { TOY_COLOR_VALUES } from "../../vocab";
import type { EdgeAlerts, StageServices } from "../services";
import { ClearShotSearch, type ClearShot } from "./clearance";
import type { FxSystem } from "./fx";
import type { FightPlayer, SkippedSpan } from "./player";
import type { SampledFighter } from "./recording";

const other = (side: Side): Side => (side === "A" ? "B" : "A");
const SIDES: readonly Side[] = ["A", "B"];

/** Debt (ms behind the server) that asks for a repaying cut. */
const DEBT_CUT_MS = 900;
/** Real seconds after a big hit before checking whether the target is flying. */
const RAGDOLL_CHECK_S = 0.8;
/** Ring-out: silence after the landing before the crowd erupts (two beats). */
const RINGOUT_SILENCE_MS = 900;
/** A long fall (the rooftop's) lands late: its silence shrinks, down to this. */
const RINGOUT_SILENCE_MIN_MS = 450;
/** The iris closing on the ring-out victim (it holds until the eruption, then opens under the slam). */
const RINGOUT_IRIS_CLOSE_MS = 320;
/**
 * The latest sim time after the end (ms) for RING OUT! to slam: the phase ends
 * FIGHT_OUTRO_MS (3.5 s) after the end, so the slam is seen whole (a tail of
 * it may ride into RESULT). A fall that has not landed by then erupts anyway.
 */
const RINGOUT_ERUPT_LATEST_MS = 2_600;
/** A landing deeper than this (m) below the platform is out of the set camera's sight: the landing cuts down to it. */
const DEEP_DROP = 5;
/** Real seconds the RING OUT! slam owns the screen before the winner's outro close-up. */
const RINGOUT_SLAM_HOLD_S = 1.4;
/** fight_close on one target: camera distance and height above it, aim above it (director/shots.ts). */
const CLOSE_DISTANCE = 3.59;
const CLOSE_HEIGHT = 1.05;
const CLOSE_AIM = 0.45;
/** The zone in front of the lens the RING OUT! title needs clear (director/slam.tsx draws it 2.2 m out). */
const TITLE_CLEAR = { depth: 2.4, halfWidth: 0.95, halfHeight: 0.35 };
/** Wall ms per frame for the deep-drop camera search. */
const DEEP_SEARCH_BUDGET_MS = 2.5;
/**
 * A long fall (the rooftop's 30 m) cuts down to its landing shot this long
 * (sim ms) before it lands: from up on the set, the buildings' ledges hide
 * the end of the drop, so the camera waits at the bottom and the victim drops
 * into the frame.
 */
const DEEP_PRECUT_MS = 500;
/** Only falls longer than this (sim ms) cut early; a shorter one (the kitchen's) is followed down. */
const DEEP_PRECUT_MIN_FALL_MS = 1_800;
/** A ring-out that starts in the edge shot stays in it this long (real s) so the victim goes over in frame. */
const RINGOUT_EDGE_HOLD_S = 0.45;
/** Slow motion is rationed: real seconds between slow-mo moments... */
const SLOWMO_GAP_S = 4;
/** ...and after the first, only for a hit this heavy (or a miracle, or one that leaves the target low). */
const SLOWMO_DAMAGE = 12;
const SLOWMO_LOW_HEALTH = 0.3;
/** The finishing blow still gets its slow-mo this soon after another. */
const SLOWMO_FINISH_GAP_S = 1.5;
/** An edge shot cuts in over a ragdoll follow or a stale fight shot, but not twice for one side this close together (real s). */
const EDGE_FORCE_GAP_S = 3;

export interface ConductorOptions {
  services: StageServices;
  player: FightPlayer;
  fx: FxSystem;
  arena: ArenaId;
  startsAt: number;
  /** Sounds play (a live room). */
  live: boolean;
  names: Record<Side, string>;
  /** Spark colours per attacker (its palette). */
  colors: Record<Side, string[]>;
  /** The floor's dust colour. */
  dust: string;
  /** Head position of a fighter (the creature's face), for sweat and KO stars. */
  head: (side: Side, out: Vector3) => Vector3;
  /** The method slam (K.O.!, RING OUT!, DECISION) played, so RESULT need not repeat it. */
  onMethodShown?: () => void;
}

interface Pending {
  atReal: number;
  run: () => void;
}

export class FightConductor {
  readonly torso: Record<Side, Vector3> = { A: new Vector3(), B: new Vector3() };
  /** The KO'd fighter, once down (KO stars). */
  koSide: Side | null = null;
  /** A fighter that left the stage (its bar flicks off). */
  outSide: Side | null = null;
  /** Edge flash per side, 0..1 (the bar's ON THE EDGE tag). */
  readonly edge: Record<Side, number> = { A: 0, B: 0 };
  /** The method slam has played (RESULT skips it). */
  methodShown = false;

  private readonly o: ConductorOptions;
  private realTime = 0;
  private pending: Pending[] = [];
  private skipped: SkippedSpan | null = null;
  private started = false;
  private firstContact = false;
  private hits = 0;
  private lastHitSide: Side | null = null;
  private readonly fall: Record<Side, number> = { A: 0, B: 0 };
  private readonly wasStaggered: Record<Side, boolean> = { A: false, B: false };
  private readonly edgeUntil: Record<Side, number> = { A: 0, B: 0 };
  private ringOut: { side: Side; t: number; landed: boolean; erupted: boolean; eruptedAt: number; point: Vector3 } | null = null;
  private outroCut = false;
  private lastSlowmo = -Infinity;
  private slowmos = 0;
  private readonly lastEdgeShot: Record<Side, number> = { A: -Infinity, B: -Infinity };
  /** The clear-angle search for a deep drop's landing shot (started when the fall begins). */
  private deep: { side: Side; search: ClearShotSearch } | null = null;
  private readonly deepTarget = new Vector3();
  /** A long fall's early cut to its landing shot happened. */
  private deepCut = false;
  private readonly wind;
  private readonly unsubscribe: Array<() => void> = [];
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly targetA = new Vector3();
  private readonly targetB = new Vector3();

  constructor(options: ConductorOptions) {
    this.o = options;
    this.wind = options.arena === "ROOFTOP" ? windFor(options.player.input.seed) : null;
  }

  // --- lifecycle -------------------------------------------------------------

  attach(): void {
    const { services } = this.o;
    this.unsubscribe.push(
      services.events.on("resync", ({ droppedMs }) => {
        const from = this.o.player.t;
        this.skipped = { fromMs: from, toMs: from + droppedMs };
      }),
    );
  }

  detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    const { services } = this.o;
    for (const key of Object.keys(services.edgeAlerts) as Array<keyof EdgeAlerts>) services.edgeAlerts[key] = 0;
    services.wind.driven = false;
  }

  /** The base shot's targets: both torsos, held over the platform when one falls away. */
  readonly targets = [
    () => this.clampTarget(this.torso.A, this.targetA),
    () => this.clampTarget(this.torso.B, this.targetB),
  ];

  private clampTarget(source: Vector3, out: Vector3): Vector3 {
    const half = ARENAS[this.o.arena].geometry.halfSize + 0.4;
    out.set(Math.max(-half, Math.min(half, source.x)), Math.max(0, Math.min(2.5, source.y)), Math.max(-half, Math.min(half, source.z)));
    return out;
  }

  // --- sound -------------------------------------------------------------------

  private play(name: SfxName, options: SfxOptions = {}): void {
    if (!this.o.live) return;
    try {
      sfx.play(name, options);
    } catch {
      // Audio is decoration: never break a frame.
    }
  }

  /** Stereo pan for a world point, from the camera. */
  private pan(point: Vector3): number {
    const camera = this.o.services.camera;
    if (!camera) return 0;
    const ndc = this.tmp2.copy(point).project(camera);
    return Math.max(-0.8, Math.min(0.8, ndc.x * 0.8));
  }

  private later(seconds: number, run: () => void): void {
    this.pending.push({ atReal: this.realTime + seconds, run });
  }

  // --- the frame -------------------------------------------------------------

  /** Present the fight at the clock's time. Call once per frame, after the clock ticks. */
  frame(realDelta: number): void {
    const { services, player, startsAt } = this.o;
    this.realTime += realDelta;
    if (!player.ready) return;
    const clock = services.clock;
    const target = clock.now - startsAt;
    if (!this.started) {
      this.started = true;
      // A late open: what already happened is past (no effects).
      if (target > 250) {
        player.seek(target);
        this.catchUpState(target);
      }
    }
    const played = player.update(target, clock.delta, this.skipped);
    this.skipped = null;
    const samples = player.samples;
    if (samples) {
      for (const side of SIDES) {
        const p = samples[side].root.p;
        this.torso[side].set(p[0], p[1], p[2]);
      }
    }
    for (const { event, fresh } of played) this.onEvent(event, fresh);
    this.continuous(realDelta);
    if (this.pending.length > 0) {
      const due = this.pending.filter((item) => item.atReal <= this.realTime);
      this.pending = this.pending.filter((item) => item.atReal > this.realTime);
      for (const item of due) item.run();
    }
  }

  /** After a late open, set the state the skipped events would have left. */
  private catchUpState(t: number): void {
    const events = this.o.player.recording?.events ?? [];
    for (const event of events) {
      if (event.t > t) break;
      if (event.kind === "contact") this.firstContact = true;
      if (event.kind === "ko") this.koSide = event.side;
      if (event.kind === "ringout") this.outSide = event.side;
      if (event.kind === "end") this.methodShown = true;
    }
  }

  private continuous(realDelta: number): void {
    const { services, player } = this.o;
    const samples = player.samples;
    if (!samples) return;
    const director = services.director;
    const clock = services.clock;
    const t = player.t;

    // ON THE EDGE in the floor lights: pulse the edge nearest each fighter on it.
    const alerts: EdgeAlerts = { N: 0, E: 0, S: 0, W: 0 };
    for (const side of SIDES) {
      const live = samples[side].live;
      const onEdge = live.onEdge && side !== this.outSide && this.koSide !== side;
      const flashing = onEdge || this.realTime < this.edgeUntil[side];
      const target = flashing ? 0.6 + 0.4 * Math.abs(Math.sin(this.realTime * 11)) : 0;
      this.edge[side] += (target - this.edge[side]) * (1 - Math.exp(-realDelta * (flashing ? 30 : 6)));
      if (this.edge[side] > 0.01) {
        const code = this.edgeCode(this.torso[side]);
        alerts[code] = Math.max(alerts[code], this.edge[side]);
      }
    }
    for (const key of Object.keys(alerts) as Array<keyof EdgeAlerts>) services.edgeAlerts[key] = alerts[key];

    // The rooftop's gusts move the laundry with the sim's wind.
    if (this.wind) {
      services.wind.x = this.wind.direction[0];
      services.wind.z = this.wind.direction[1];
      services.wind.strength = windStrengthAt(this.wind, Math.max(0, t));
      services.wind.driven = true;
    }

    // Ragdoll thuds: a staggered body's fall that suddenly stops.
    for (const side of SIDES) {
      const sample = samples[side];
      const vy = sample.velocity[1];
      const staggered = sample.live.staggered || sample.anim.ragdoll > 0.6;
      if (clock.delta > 0) {
        if (vy < -1.6) this.fall[side] = Math.min(this.fall[side], vy);
        else if (this.fall[side] < -1.6 && vy > -0.4) {
          if (staggered && side !== this.outSide && this.torso[side].y > -0.3) {
            const strength = Math.min(1, -this.fall[side] / 6);
            this.play("ragdollThud", { intensity: 0.35 + strength * 0.5, pan: this.pan(this.torso[side]) });
            this.o.fx.puff(this.tmp.set(this.torso[side].x, 0, this.torso[side].z), {
              color: this.o.dust,
              count: 5 + Math.round(strength * 5),
              size: 0.12 + strength * 0.08,
            });
            if (strength > 0.5) director.shake(0.15 + strength * 0.2);
          }
          this.fall[side] = 0;
        }
      }
      // Hopper landings kick up dust too.
      if (player.drivers[side].landed) {
        this.o.fx.puff(this.tmp.set(this.torso[side].x, 0, this.torso[side].z), { color: this.o.dust, count: 4, size: 0.1 });
        this.play("boing", { intensity: 0.25, pan: this.pan(this.torso[side]), gain: 0.6 });
      }
      this.wasStaggered[side] = staggered;
    }

    // Camera: close when within reach, keep cutting to repay the presentation debt.
    const decided = this.koSide !== null || this.outSide !== null;
    if (!decided && director.shot === director.baseShot && director.shotAge > 2.2 && t > 0) {
      const distance = Math.hypot(this.torso.A.x - this.torso.B.x, this.torso.A.z - this.torso.B.z);
      if (distance < 1.45) director.request("fight_close", { targets: this.targets, priority: 1, hold: 2.4 });
    }
    if (clock.debtMs > DEBT_CUT_MS && clock.settled && director.shotAge > 1.3 && !this.ringOut) {
      if (director.shot === "fight_close") director.request("fight_wide", { targets: this.targets, priority: 1 });
      else director.request("fight_close", { targets: this.targets, priority: 1, hold: 1.8 });
    }

    // The outro: once the dust settles, a close-up of the winner showboating
    // (after a ring-out, only once RING OUT! has had the screen).
    const result = player.result;
    const settledDust = this.ringOut ? this.ringOut.erupted && this.realTime >= this.ringOut.eruptedAt + RINGOUT_SLAM_HOLD_S : result !== null && t > result.endMs + 1500;
    if (result && !this.outroCut && settledDust) {
      this.outroCut = true;
      const winner = result.winner;
      director.request("fight_close", { targets: [() => this.torso[winner]], priority: 4, hold: 3, force: true });
    }

    // A deep drop's landing shot: search the set for a clear angle while the victim falls.
    if (this.deep && !this.deep.search.done) this.deep.search.step(DEEP_SEARCH_BUDGET_MS);
    this.deepPrecut(t);

    // Ring-out: the landing, the silence (real time, so a catch-up cannot
    // squash it), the eruption; a fall too long for the phase erupts anyway.
    const ring = this.ringOut;
    if (ring && !ring.erupted) {
      const landingMs = player.landingMs[ring.side] ?? ring.t + 1200;
      const latest = (result?.endMs ?? ring.t) + RINGOUT_ERUPT_LATEST_MS;
      if (!ring.landed && t >= landingMs) {
        ring.landed = true;
        const silenceMs = Math.max(RINGOUT_SILENCE_MIN_MS, Math.min(RINGOUT_SILENCE_MS, latest - t));
        this.landing(ring.side, silenceMs);
        this.later(silenceMs / 1000, () => this.ringErupt());
      } else if (!ring.landed && t >= latest) {
        this.ringErupt();
      }
    }
  }

  /** RING OUT!: the slam lands as the iris opens off the victim. */
  private ringErupt(): void {
    const ring = this.ringOut;
    if (!ring || ring.erupted) return;
    ring.erupted = true;
    ring.landed = true;
    ring.eruptedAt = this.realTime;
    this.erupt("RING OUT!", ring.side);
  }

  private edgeCode(p: Vector3): keyof EdgeAlerts {
    const geometry = ARENAS[this.o.arena].geometry;
    // The kitchen sink is upstage: a fighter near it is on the N side.
    for (const pit of geometry.pits) {
      const dx = Math.max(pit.minX - p.x, 0, p.x - pit.maxX);
      const dz = Math.max(pit.minZ - p.z, 0, p.z - pit.maxZ);
      if (Math.hypot(dx, dz) < 0.7) return "N";
    }
    if (Math.abs(p.x) > Math.abs(p.z)) return p.x > 0 ? "E" : "W";
    return p.z > 0 ? "S" : "N";
  }

  // --- events ----------------------------------------------------------------

  private onEvent(event: FightEvent, fresh: boolean): void {
    const { services, fx } = this.o;
    const director = services.director;
    switch (event.kind) {
      case "start":
        if (fresh) {
          this.play("crowdCheer", { intensity: 0.45, gain: 0.7 });
          services.cheer(0.5);
        }
        break;
      case "contact":
        if (!this.firstContact) {
          this.firstContact = true;
          if (fresh) {
            director.request("fight_close", {
              targets: this.targets,
              priority: 2,
              hold: 2.2,
              force: director.shotAge > 0.6,
            });
          }
        }
        break;
      case "hit":
        this.hit(event, fresh);
        break;
      case "throw":
        this.throwHit(event, fresh);
        break;
      case "grab":
        if (fresh) this.play("grappleLift", { intensity: 0.6, pan: this.pan(this.torso[event.side]) });
        break;
      case "whiff":
        if (fresh) this.play("trickWhiff", { intensity: event.reason === "dodged" ? 0.6 : 0.3, pan: this.pan(this.torso[event.side]) });
        break;
      case "dodge":
        if (fresh) {
          this.play("trickWhiff", { intensity: 0.55, pan: this.pan(this.torso[event.side]) });
          fx.puff(this.tmp.set(this.torso[event.side].x, 0, this.torso[event.side].z), { color: this.o.dust, count: 3, size: 0.08 });
        }
        break;
      case "getup":
        if (fresh) this.play("boing", { intensity: 0.3, pan: this.pan(this.torso[event.side]), gain: 0.7 });
        break;
      case "edge":
        this.onEdge(event.side, fresh);
        break;
      case "ringout":
        this.onRingOut(event.side, event.t);
        break;
      case "ko":
        this.onKo(event.side);
        break;
      case "selfDamage":
        if (fresh) {
          fx.zap(this.o.head(event.side, this.tmp));
          this.play("healthCrunch", { intensity: 0.5 });
          director.shake(0.2);
        }
        break;
      case "showboat":
        if (fresh) {
          services.cheer(0.4);
          this.play("crowdCheer", { intensity: 0.3, gain: 0.55 });
        }
        break;
      case "suddenDeath":
        this.slam("SUDDEN DEATH", "First hit wins");
        break;
      case "end":
        if (event.method === "DECISION") {
          this.markMethodShown();
          this.later(0.35, () => {
            this.slam("DECISION", `${this.o.names[event.side]} wins on health`);
            services.cheer(0.9);
            this.play("crowdCheer", { intensity: 0.8 });
          });
        } else if (event.method === "SUDDEN_DEATH") {
          this.markMethodShown();
          this.later(0.5, () => {
            this.slam("WINNER!", this.o.names[event.side]);
            services.cheer(1);
            this.play("crowdCheer", { intensity: 0.9 });
          });
        }
        break;
      default:
        break;
    }
  }

  private impactPoint(event: { point: readonly number[] }): Vector3 {
    return this.tmp.set(event.point[0] ?? 0, event.point[1] ?? 0.5, event.point[2] ?? 0);
  }

  private hit(event: Extract<FightEvent, { kind: "hit" }>, fresh: boolean): void {
    if (!fresh || event.damage <= 0) return;
    const { services, fx } = this.o;
    const director = services.director;
    const point = this.impactPoint(event).clone();
    const strength = Math.min(1, Math.max(0.15, event.damage / 30));
    const big = event.big;
    const victim = other(event.side);
    const slowmo = big && this.slowmoFor(event);
    services.impact({ point, strength, big: slowmo, hitStopFrames: 4 });
    // A big hit without its slow-mo still lands harder than a plain one.
    if (big && !slowmo) director.punchIn(0.8);
    if (this.o.live) sfx.hitStop(big ? 110 : 70);
    fx.spark(point, { colors: this.o.colors[event.side], big, strength });
    const away = this.tmp2.subVectors(this.torso[victim], this.torso[event.side]).setY(0).normalize();
    fx.sweat(this.o.head(victim, new Vector3()), away.clone());
    const pan = this.pan(point);
    const intensity = big ? 0.92 : 0.3 + strength * 0.45;
    if (event.type === "STRIKE") this.play("strikeThwack", { intensity, pan });
    else if (event.type === "GRAPPLE") this.play("grappleSlam", { intensity, pan });
    else this.play("trickBonk", { intensity, pan });
    services.cheer(big ? 1 : 0.15 + strength * 0.35);
    if (big) this.play("crowdGasp", { intensity: 0.7, gain: 0.8 });
    this.hits += 1;
    if (big) {
      // A big hit that sends the target flying: follow it (after the orbit, when there is one).
      this.later(slowmo ? RAGDOLL_CHECK_S : RAGDOLL_CHECK_S * 0.5, () => {
        const sample = this.o.player.samples?.[victim];
        if (!sample || this.koSide === victim) return;
        const speed = Math.hypot(sample.velocity[0], sample.velocity[1], sample.velocity[2]);
        if (speed > 1.6 || sample.live.airborne) {
          director.request("ragdoll_follow", { targets: [() => this.torso[victim]], priority: 2, hold: 1.4 });
        }
      });
    }
    if (slowmo) {
      this.play("slowMo", { intensity: 0.7 });
      const side = this.lastHitSide === event.side ? (this.hits % 2 ? "A" : "B") : event.side;
      director.request("slowmo_orbit", { targets: [point], priority: 3, hold: 1.0, ttl: 0.35, side });
    } else if (director.shotAge > 1.6 && this.hits % 3 === 0) {
      // Keep cutting on beats: every few hits, a fresh angle (and the debt repaid).
      director.request(director.shot === "fight_close" ? "fight_wide" : "fight_close", {
        targets: this.targets,
        priority: 1,
        hold: director.shot === "fight_close" ? undefined : 2,
      });
    }
    this.lastHitSide = event.side;
  }

  /** Whether this big hit gets slow motion (and the orbit): see SLOWMO_*. Records it when it does. */
  private slowmoFor(event: Extract<FightEvent, { kind: "hit" }>): boolean {
    const since = this.realTime - this.lastSlowmo;
    const max = Math.max(1, this.o.player.maxHealth[other(event.side)]);
    const finishing = event.health <= 0;
    const heavy = event.damage >= SLOWMO_DAMAGE || event.miracle || event.health / max <= SLOWMO_LOW_HEALTH;
    const allowed = finishing ? since >= SLOWMO_FINISH_GAP_S : this.slowmos === 0 || (since >= SLOWMO_GAP_S && heavy);
    if (allowed) {
      this.lastSlowmo = this.realTime;
      this.slowmos += 1;
    }
    return allowed;
  }

  private throwHit(event: Extract<FightEvent, { kind: "throw" }>, fresh: boolean): void {
    if (!fresh) return;
    const { services, fx } = this.o;
    const point = this.impactPoint(event).clone();
    const strength = Math.min(1, Math.max(0.3, event.damage / 25));
    services.impact({ point, strength, big: false, hitStopFrames: 4 });
    if (this.o.live) sfx.hitStop(90);
    fx.spark(point, { colors: this.o.colors[event.side], strength });
    this.play("grappleSlam", { intensity: 0.6 + strength * 0.35, pan: this.pan(point) });
    services.cheer(0.6 + strength * 0.3);
    const victim = other(event.side);
    this.later(0.7, () => {
      if (this.koSide === victim) return;
      services.director.request("ragdoll_follow", { targets: [() => this.torso[victim]], priority: 2, hold: 1.3, ttl: 0.4 });
    });
  }

  private onEdge(side: Side, fresh: boolean): void {
    if (this.outSide || this.koSide) return;
    this.edgeUntil[side] = this.realTime + 1.6;
    if (!fresh) return;
    const { services } = this.o;
    const director = services.director;
    this.play("edgeAlarm", { intensity: 0.7, pan: this.pan(this.torso[side]) });
    this.play("crowdGasp", { intensity: 0.5, gain: 0.7 });
    // The drop is the story: cut now over a ragdoll follow (it outranks it) or
    // a fight shot that has had its moment; a slow-mo orbit finishes first.
    const shot = director.shot;
    const stale = (shot === "fight_wide" || shot === "fight_close") && director.shotAge > 0.5;
    const force = (shot === "ragdoll_follow" || stale) && this.realTime - this.lastEdgeShot[side] >= EDGE_FORCE_GAP_S;
    const result = director.request("edge_drama", { targets: [() => this.torso[side]], priority: 3, hold: 1.6, force });
    if (result === "cut") this.lastEdgeShot[side] = this.realTime;
  }

  private onRingOut(side: Side, t: number): void {
    if (this.ringOut) return;
    const { services } = this.o;
    const director = services.director;
    this.outSide = side;
    this.ringOut = { side, t, landed: false, erupted: false, eruptedAt: 0, point: this.torso[side].clone() };
    this.play("ringOutScream", { intensity: 0.9, pan: this.pan(this.torso[side]) });
    this.planDeepLanding(side);
    // Aim a little ahead of the fall so the drop stays in frame.
    const lead = new Vector3();
    const target = () => {
      const velocity = this.o.player.samples?.[side].velocity ?? [0, 0, 0];
      return lead.set(this.torso[side].x + velocity[0] * 0.12, this.torso[side].y + Math.min(0, velocity[1]) * 0.22, this.torso[side].z + velocity[2] * 0.12);
    };
    const follow = () => director.request("ragdoll_follow", { targets: [target], priority: 5, hold: 3.2, force: true });
    if (director.shot === "edge_drama" && director.shotAge < 2.5) {
      // Already looking at the drop: let the victim go over in that frame, then follow it down.
      director.request("edge_drama", { hold: RINGOUT_EDGE_HOLD_S + 0.5 });
      this.later(RINGOUT_EDGE_HOLD_S, () => {
        if (!this.ringOut?.landed) follow();
      });
    } else {
      follow();
    }
  }

  /** Where the victim will land, from the recording (null until the landing is known). */
  private landingPoint(side: Side): Vector3 | null {
    const { player } = this.o;
    const at = player.landingMs[side];
    const recording = player.recording;
    if (at === null || !recording || recording.recordedMs < at) return null;
    const sample: SampledFighter = recording.createSample(side);
    recording.sample(side, at, sample);
    return new Vector3(sample.root.p[0], sample.root.p[1], sample.root.p[2]);
  }

  /** Start looking for a clear camera at the bottom of a deep drop while the victim falls. */
  private planDeepLanding(side: Side, at: Vector3 | null = this.landingPoint(side)): ClearShotSearch | null {
    if (this.deep?.side === side) return this.deep.search;
    const geometry = ARENAS[this.o.arena].geometry;
    if (!at || at.y >= geometry.topY - DEEP_DROP) return null;
    // Prefer looking back at the set from outside it, a little from the front.
    const preferred = new Vector3(at.x, 0, at.z);
    if (preferred.lengthSq() > 1e-6) preferred.normalize();
    preferred.z += 0.6;
    const search = new ClearShotSearch(this.o.services.director.nodes?.root ?? null, at, {
      distance: CLOSE_DISTANCE,
      height: CLOSE_HEIGHT,
      aim: CLOSE_AIM,
      preferred,
      ...TITLE_CLEAR,
    });
    this.deep = { side, search };
    return search;
  }

  /** A long fall: cut to the clear landing shot just before the victim lands, aimed at where it will land. */
  private deepPrecut(t: number): void {
    const ring = this.ringOut;
    const deep = this.deep;
    if (this.deepCut || !ring || ring.landed || !deep || deep.side !== ring.side) return;
    const landingMs = this.o.player.landingMs[ring.side];
    if (landingMs === null || landingMs - ring.t < DEEP_PRECUT_MIN_FALL_MS || t < landingMs - DEEP_PRECUT_MS) return;
    const at = this.landingPoint(ring.side);
    if (!at) return;
    this.deepCut = true;
    deep.search.step(DEEP_SEARCH_BUDGET_MS * 2);
    const shot = deep.search.best;
    if (shot) at.add(shot.shift);
    this.o.services.director.request("fight_close", { targets: [at], priority: 5, hold: 2, force: true, from: shot?.from });
  }

  private landing(side: Side, silenceMs: number): void {
    const { services, fx, arena } = this.o;
    const geometry = ARENAS[arena].geometry;
    const point = this.torso[side].clone();
    if (this.o.live) {
      try {
        sfx.landing(arena, { intensity: 0.9 });
      } catch {
        // decoration
      }
    }
    if (geometry.surround.kind === "water") {
      point.y = geometry.surround.y;
      fx.splash(point);
    } else {
      fx.puff(point, { color: this.o.dust, count: 10, size: 0.28, spread: 1.6 });
    }
    services.director.shake(0.35);
    // Two beats of silence, the camera and the iris holding on the victim; the
    // iris opens as RING OUT! slams in (the slam is drawn under the iris).
    const victim = () => this.torso[side];
    const hold = silenceMs / 1000 + RINGOUT_SLAM_HOLD_S;
    const closeMs = Math.min(RINGOUT_IRIS_CLOSE_MS, silenceMs * 0.6);
    if (point.y < geometry.topY - DEEP_DROP) {
      // Off the rooftop (the street is 30 m down) or the counter (the kitchen
      // floor): from up on the set the edge hides the landing, and the slam,
      // which sits in front of the camera. Cut down to it behind the shut
      // iris, from an angle with no wall in front of the lens (searched while
      // it fell; whatever the search has by the cut).
      const search = this.planDeepLanding(side, point);
      this.later(closeMs / 1000, () => {
        search?.step(DEEP_SEARCH_BUDGET_MS * 2);
        const shot: ClearShot | null = search?.best ?? null;
        const shift = shot?.shift ?? null;
        const target = shift ? () => this.deepTarget.copy(this.torso[side]).add(shift) : victim;
        services.director.request("fight_close", { targets: [target], priority: 5, hold, force: true, from: shot?.from });
      });
    } else {
      services.director.request("ragdoll_follow", { targets: [victim], priority: 5, hold });
    }
    if (this.o.live) sfx.duck(0.04, silenceMs);
    void services.transitions.play("iris", {
      target: () => this.torso[side],
      radius: 0.24,
      closeMs,
      holdMs: silenceMs - closeMs,
      openMs: 420,
    });
  }

  private onKo(side: Side): void {
    if (this.koSide) return;
    this.koSide = side;
    const { services } = this.o;
    this.play("koSting", { intensity: 1 });
    this.later(0.3, () => this.erupt("K.O.!", side));
    this.later(1.1, () => {
      if (this.outSide) return;
      services.director.request("ragdoll_follow", { targets: [() => this.torso[side]], priority: 3, hold: 1.8 });
    });
  }

  private markMethodShown(): void {
    this.methodShown = true;
    this.o.onMethodShown?.();
  }

  private erupt(text: string, loser: Side): void {
    const { services } = this.o;
    this.markMethodShown();
    this.slam(text, `${this.o.names[other(loser)]} wins`);
    services.cheer(1);
    this.play("crowdCheer", { intensity: 1 });
    this.later(0.25, () => services.cheer(0.8));
  }

  private slam(text: string, sub?: string): void {
    const { services } = this.o;
    this.play("slam", { intensity: 0.9 });
    void services.transitions.play("slam", { text, sub, shake: 0.6, holdMs: 900 });
  }
}

/** The palette colours a fighter's sparks use: accent, primary, and a hot white. */
export function sparkColors(palette: { primary: string; secondary: string; accent: string }): string[] {
  const value = (name: string) => TOY_COLOR_VALUES[name as keyof typeof TOY_COLOR_VALUES]?.hex ?? "#ffd76a";
  return [value(palette.accent), "#fff1c2", value(palette.primary)];
}

/** One sim step in ms (re-exported for scenes that time beats on steps). */
export const FIGHT_STEP_MS = STEP_MS;
