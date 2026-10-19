// RESULT's instant replay, played: the decisive moment again (replay-plan.ts
// picks it), slowed, from a new angle, on the two creatures RESULT already
// has. It sits between two wipes: the phase's own entry wipe (or one of its
// own, on a stage that had to record the fight first) and a wipe back out.
//
// It plays from the recording FIGHT left in the cache, so starting it costs
// no simulation. A stage that never saw the fight (opened late, a fixture)
// records it a few milliseconds per frame and wipes into the replay once the
// recording is complete, if there is still time; otherwise RESULT goes on
// without one.
//
// Sound locks to the motion: the slow-mo whoosh as the ramp into slow motion
// starts (the beds dip under it), each hit's sound as the slowed sim crosses
// it, the impact frame and a hit stop on the decisive one, the ring-out's
// scream and landing, and the crowd swelling into the cut back.
//
// A moment in the arena's finale replays in it: the replay publishes the
// finale at its own sim time (`services.finale`, as FIGHT's conductor does),
// so the counter tips, the flood stands where it stood and the storm blows,
// and RESULT tips its creatures with the counter. The stage goes calm again at
// the cut back, under the wipe's cover.
//
// Plain class (no React); RESULT owns one per fight.

import { Vector3 } from "three";
import { ARENAS, finaleFor, windFor, type Finale, type Wind } from "../../arenas";
import { sfx, type SfxName, type SfxOptions } from "../../audio";
import type { Side } from "../../modifiers";
import type { FightEvent, FightInput, Rapier } from "../../sim";
import { calmFinale, placeOnStage, publishFinale, waterLevelAt } from "../arena/finale";
import type { ShotRequest } from "../director/director";
import type { StageServices } from "../services";
import { stageSfx } from "../ui3d/sound";
import { ClearShotSearch } from "./clearance";
import type { FxSystem } from "./fx";
import { findOverEdgeStep, msOfStep, type StoredOutcomeLike } from "./playback";
import { FightPlayer } from "./player";
import { planReplay, replayFrom, replayRateAt, replaySimAt, type ReplayPlan, type RingOutScan } from "./replay-plan";

/** Wall ms per frame for recording a fight this stage never saw (FIGHT's own look-ahead budget). */
const RECORD_BUDGET_MS = 5;
/** Wall ms per frame for the replay camera's clear-angle search. */
const SEARCH_BUDGET_MS = 1.5;
/** The decisive impact's hit stop, real seconds (the replay's clock freezes). */
const HIT_STOP_S = 0.09;
/** The wipe into the replay, when it starts after the phase's entry. */
const IN_WIPE = { coverMs: 300, holdMs: 90, revealMs: 380 };
/** The wipe back out: it covers as the replay ends. */
const OUT_WIPE = { coverMs: 300, holdMs: 90, revealMs: 380, angle: -18 };
/** The crowd starts swelling this long before the cut back. */
const CROWD_LEAD_S = 0.55;
/** A replay that has not cut back this long after it ended (a lost wipe) cuts back anyway. */
const OUT_FALLBACK_S = 0.6;
/** A replay whose shot never came up (a lost entry wipe) gives up after this long. */
const READY_TIMEOUT_S = 3;
/** The replay camera's height above the action: low for a hit, higher to show a ring-out's drop. */
const RISE = { hit: 0.15, ringout: 0.55 };
/** A ring-out victim's camera target is held above this (a deep drop would drag the frame down). */
const DROP_FLOOR = -0.9;
/** A typical replay's length, for deciding while the recording is still running. */
const TYPICAL_REAL_MS = 2_800;

export type ReplayState = "recording" | "ready" | "playing" | "leaving" | "done" | "skipped";

export interface ResultReplayOptions {
  services: StageServices;
  input: FightInput;
  stored: StoredOutcomeLike;
  fx: FxSystem;
  /** Spark colours per attacker. */
  colors: Record<Side, readonly string[]>;
  /** RESULT seconds now (a stage opened late may already be past the latest start). */
  elapsed: number;
  /** RESULT seconds before which a replay of its own may not wipe in (the entry wipe still playing). */
  earliest: number;
  /** The latest RESULT second a replay of `realMs` may start and still leave the payouts their time. */
  latestStart: (realMs: number) => number;
}

/** What the scene does at the replay's cuts (both under a wipe's cover). */
export interface ReplayHooks {
  /** Cutting into a replay of its own: the scene's base shot gives way. */
  cutIn(): void;
  /** Cutting back from the replay: the post-replay shot. */
  cutBack(): void;
}

export class ResultReplay {
  readonly player: FightPlayer;
  state: ReplayState = "recording";
  plan: ReplayPlan | null = null;
  /** RESULT seconds the replay cut back (skipped: 0, so the beats keep their own times). */
  doneAt: number | null = null;
  /** Playback rate this frame (0 in the hit stop). */
  rate = 1;
  /** Sim seconds the replay advanced this frame (the sparks' delta). */
  simDelta = 0;
  /** Real ms into the replay. */
  t = 0;
  /** The replay camera's direction from the action (mutated until the replay starts). */
  readonly from: [number, number] = [0, 1];
  readonly torso: Record<Side, Vector3> = { A: new Vector3(), B: new Vector3() };
  readonly request: ShotRequest;

  private readonly o: ResultReplayOptions;
  private search: ClearShotSearch | null = null;
  private cue: "none" | "wanted" | "wiping" = "none";
  private readySince = 0;
  private stop = 0;
  private whooshed = false;
  private swelled = false;
  private landed = false;
  private elapsed: number;
  private readonly victimPoint = new Vector3();
  private readonly finale: Finale;
  private readonly wind: Wind | null;
  /** This replay publishes `services.finale` (from the cut in to the cut back). */
  private publishing = false;

  constructor(options: ResultReplayOptions) {
    this.o = options;
    this.elapsed = options.elapsed;
    const { arena, seed, limitMs } = options.input;
    this.finale = finaleFor(arena, seed, limitMs);
    this.wind = ARENAS[arena].dynamic.some((hazard) => hazard.id === "wind") ? windFor(seed) : null;
    this.player = new FightPlayer(options.input, options.stored, { label: "result replay" });
    const targets = [() => this.torso[this.plan?.attacker ?? "A"], () => this.victimTarget()];
    this.request = { targets, from: this.from, rise: RISE.hit, duration: 3, focus: 1 };
    if (this.player.recording?.complete) this.prepare();
  }

  /** The creatures follow the replay. */
  get driving(): boolean {
    return this.state === "playing" || this.state === "leaving";
  }

  /** The REPLAY bug is up. */
  get bugShown(): boolean {
    return this.state === "playing";
  }

  /** Seconds since the replay cut back (the post-replay beats' clock); -Infinity before. */
  since(elapsed: number): number {
    return this.doneAt === null ? -Infinity : elapsed - this.doneAt;
  }

  /** Rapier is in: record the fight (no-op when FIGHT's recording was cached). */
  start(R: Rapier): void {
    this.player.start(R);
  }

  /** Advance one frame. `elapsed`: RESULT seconds; `realDelta`: real seconds. */
  frame(elapsed: number, realDelta: number, hooks: ReplayHooks): void {
    this.elapsed = elapsed;
    this.simDelta = 0;
    switch (this.state) {
      case "recording": {
        const recording = this.player.recording;
        if (recording) this.player.recordAhead(RECORD_BUDGET_MS);
        if (!recording?.complete) {
          if (elapsed > this.o.latestStart(TYPICAL_REAL_MS)) this.skip();
          break;
        }
        if (this.prepare()) this.cue = "wanted";
        break;
      }
      case "ready":
        this.searchStep();
        if (this.cue === "wanted" && elapsed >= this.o.earliest) this.wipeIn(hooks);
        // The base shot went in (at the entry wipe's cover, or this replay's own): roll.
        if (this.o.services.director.shot === "replay") this.begin();
        else if (this.cue !== "wanted" && elapsed - this.readySince > READY_TIMEOUT_S) this.skip();
        break;
      case "playing":
      case "leaving":
        this.play(realDelta, hooks);
        break;
      default:
        break;
    }
  }

  /** Plan from the complete recording; false (skipped) when there is nothing to show or no time for it. */
  private prepare(): boolean {
    const recording = this.player.recording!;
    const result = recording.outcome;
    const plan = result ? planReplay(recording.events, result, this.ringOutScan(result)) : null;
    if (!plan || this.elapsed > this.o.latestStart(plan.realMs)) {
      this.skip();
      return false;
    }
    this.plan = plan;
    this.state = "ready";
    this.readySince = this.elapsed;
    this.request.rise = plan.kind === "RINGOUT" ? RISE.ringout : RISE.hit;
    this.request.duration = plan.realMs / 1000;
    // The first frame, so the camera's first solve lands on the action.
    this.player.seek(plan.fromMs);
    this.player.update(plan.fromMs, 0);
    this.readTorsos();
    // The angle, from where the two stood at the moment (the clear-angle search may move it).
    const at = { A: recording.createSample("A"), B: recording.createSample("B") };
    recording.sample("A", plan.momentMs, at.A);
    recording.sample("B", plan.momentMs, at.B);
    const a = at[plan.attacker].root.p;
    const v = at[plan.victim].root.p;
    const [x, z] = replayFrom([a[0], a[2]], [v[0], v[2]], plan.kind);
    this.from[0] = x;
    this.from[1] = z;
    return true;
  }

  private ringOutScan(result: { winner: Side; method: string }): RingOutScan {
    const recording = this.player.recording!;
    if (result.method !== "RINGOUT") return {};
    const victim: Side = result.winner === "A" ? "B" : "A";
    const ringout = recording.events.find((event) => event.kind === "ringout" && event.side === victim);
    if (!ringout) return {};
    const step = findOverEdgeStep(recording, victim, ringout.t);
    return { overEdgeMs: step === null ? null : msOfStep(step), landingMs: this.player.landingMs[victim], finale: this.finale.spec.id };
  }

  /** The clear-angle search (no wall between the lens and the action), a little per frame until the replay starts. */
  private searchStep(): void {
    const plan = this.plan;
    if (!plan) return;
    if (!this.search) {
      const centre = this.torso[plan.attacker].clone().lerp(this.torso[plan.victim], 0.55);
      this.search = new ClearShotSearch(this.o.services.director.nodes?.root ?? null, centre, {
        distance: 3,
        height: this.request.rise ?? RISE.hit,
        aim: 0.25,
        preferred: new Vector3(this.from[0], 0, this.from[1]),
        depth: 1.4,
        halfWidth: 0.5,
        halfHeight: 0.3,
      });
    }
    if (!this.search.done) this.search.step(SEARCH_BUDGET_MS);
  }

  private wipeIn(hooks: ReplayHooks): void {
    if (this.elapsed > this.o.latestStart(this.plan!.realMs)) {
      this.skip();
      return;
    }
    this.cue = "wiping";
    this.readySince = this.elapsed;
    const { services } = this.o;
    stageSfx(services).play("wipe", { intensity: 0.35, gain: 0.6 });
    void services.transitions.play("wipe", {
      ...IN_WIPE,
      onCover: () => {
        if (this.state !== "ready") return;
        hooks.cutIn();
        services.director.setBase("replay", this.request);
      },
    });
  }

  private begin(): void {
    const plan = this.plan!;
    const best = this.search?.best;
    if (best) {
      this.from[0] = best.from[0];
      this.from[1] = best.from[1];
    }
    this.state = "playing";
    this.t = 0;
    this.player.seek(plan.fromMs);
    this.publishing = true;
    this.publishFinale();
  }

  private play(realDelta: number, hooks: ReplayHooks): void {
    const plan = this.plan!;
    const { services } = this.o;
    const dt = Math.min(realDelta, 0.1);
    if (this.stop > 0) this.stop -= dt;
    else this.t += dt * 1000;
    const sim = replaySimAt(plan, this.t);
    this.rate = this.stop > 0 ? 0 : replayRateAt(plan, sim);
    this.simDelta = dt * this.rate;
    const played = this.player.update(sim, this.simDelta);
    this.publishFinale();
    this.readTorsos();
    for (const { event, fresh } of played) if (fresh) this.onEvent(event);
    const sound = stageSfx(services);

    // The whoosh as the ramp into slow motion starts, the beds dipping under the slow part.
    if (!this.whooshed && sim >= plan.coreFromMs - 250) {
      this.whooshed = true;
      sound.play("slowMo", { intensity: 0.85 });
      if (sound.live) sfx.duck(0.35, (plan.coreToMs - plan.coreFromMs) / 0.3 + 400);
    }
    // A ring-out's landing inside the window: the splash (or the thud).
    if (!this.landed && plan.landingMs !== null && sim >= plan.landingMs) {
      this.landed = true;
      this.landing(plan.victim);
    }
    const left = (plan.realMs - this.t) / 1000;
    if (!this.swelled && left <= CROWD_LEAD_S) {
      this.swelled = true;
      services.cheer(1);
      sound.play("crowdCheer", { intensity: 1 });
    }
    if (this.state === "playing" && left <= OUT_WIPE.coverMs / 1000) {
      this.state = "leaving";
      sound.play("wipe", { intensity: 0.35, gain: 0.6 });
      void services.transitions.play("wipe", { ...OUT_WIPE, onCover: () => this.finish(hooks) });
    }
    if (this.state === "leaving" && left < -OUT_FALLBACK_S) this.finish(hooks);
  }

  private finish(hooks: ReplayHooks): void {
    if (this.state !== "leaving") return;
    this.state = "done";
    this.doneAt = this.elapsed;
    this.rate = 1;
    this.release(true);
    hooks.cutBack();
  }

  /**
   * Hand the stage's finale back: at once under the cut back's cover, or eased
   * by the set (`calm` false) when RESULT ends with the replay still on.
   */
  release(calm = false): void {
    if (!this.publishing) return;
    this.publishing = false;
    const { services } = this.o;
    if (this.wind) services.wind.driven = false;
    if (calm) calmFinale(services.finale);
    else services.finale.driven = false;
  }

  /** The finale at the replay's sim time, frozen at the fight's end like the sim (and the rooftop's gusts with it). */
  private publishFinale(): void {
    if (!this.publishing) return;
    const { services, input } = this.o;
    publishFinale(services.finale, input.arena, this.finale, this.wind, this.player.t, this.player.result?.endMs ?? null);
    if (this.wind) {
      services.wind.x = this.wind.direction[0];
      services.wind.z = this.wind.direction[1];
      services.wind.strength = services.finale.wind;
      services.wind.driven = true;
    }
  }

  /** No replay: RESULT plays its beats on their own times. */
  private skip(): void {
    this.state = "skipped";
    this.doneAt = 0;
  }

  private readTorsos(): void {
    const samples = this.player.samples;
    if (!samples) return;
    for (const side of ["A", "B"] as const) {
      const p = samples[side].root.p;
      // Where the stage draws it: tipped with the counter in the kitchen's finale.
      placeOnStage(this.o.services.finale, this.torso[side].set(p[0], p[1], p[2]));
    }
  }

  /** The victim, held up near the platform so a deep drop does not drag the camera after it. */
  private victimTarget(): Vector3 {
    const victim = this.torso[this.plan?.victim ?? "B"];
    return this.victimPoint.set(victim.x, Math.max(DROP_FLOOR, victim.y), victim.z);
  }

  private onEvent(event: FightEvent): void {
    const plan = this.plan!;
    const { services, fx, colors } = this.o;
    const sound = stageSfx(services);
    const play = (name: SfxName, options?: SfxOptions) => sound.play(name, options);
    switch (event.kind) {
      case "hit":
      case "throw": {
        if (event.damage <= 0) break;
        const point = new Vector3(event.point[0] ?? 0, event.point[1] ?? 0.5, event.point[2] ?? 0);
        const decisive = plan.impact !== null && event.t === plan.impact.t && event.side === plan.impact.side;
        const big = decisive || (event.kind === "hit" ? event.big : event.damage >= 18);
        const strength = Math.min(1, Math.max(0.15, event.damage / 30));
        fx.spark(point, { colors: colors[event.side], big, strength });
        const intensity = big ? 0.92 : 0.3 + strength * 0.45;
        if (event.kind === "throw" || event.type === "GRAPPLE") play("grappleSlam", { intensity });
        else if (event.type === "STRIKE") play("strikeThwack", { intensity });
        else play("trickBonk", { intensity });
        if (event.kind === "hit") {
          const guard: Side = event.side === "A" ? "B" : "A";
          fx.playFinishLayers(point, event, { attack: colors[event.side], guard: colors[guard], big, strength }, play);
        }
        if (decisive) {
          this.stop = HIT_STOP_S;
          services.fx.impactFrame(point, strength);
          services.director.shake(0.35 + 0.4 * strength);
          if (sound.live) sfx.hitStop(110);
          play("crowdGasp", { intensity: 0.7, gain: 0.8 });
        } else {
          services.director.shake(0.15 + 0.2 * strength);
        }
        break;
      }
      case "ko":
        if (event.side === plan.victim) play("koSting", { intensity: 0.85 });
        break;
      case "ringout":
        if (event.side === plan.victim) play("ringOutScream", { intensity: 0.8 });
        break;
      default:
        break;
    }
  }

  private landing(side: Side): void {
    const { services, fx, input } = this.o;
    const geometry = ARENAS[input.arena].geometry;
    if (services.live) {
      try {
        sfx.landing(input.arena, { intensity: 0.85 });
      } catch {
        // Sound is decoration.
      }
    }
    const point = this.torso[side].clone();
    if (geometry.surround.kind === "water") {
      // At the water's surface as it is now (the flood raises it over the pad).
      point.y = waterLevelAt(services.finale, geometry, point.x, point.z);
      fx.splash(point);
    } else {
      fx.puff(point, { color: "#c9c1b3", count: 8, size: 0.24, spread: 1.4 });
    }
    services.director.shake(0.3);
  }
}
