// FightPlayer: one fight's playback state. It owns the recording (filled a
// few milliseconds per frame, ahead of the clock), samples both fighters at
// the presented sim time, drives their creature drivers, hands out each local
// event once, checks the run's hash against the stored outcome and picks the
// health source (the verified local run, else the stored timeline). Pure
// TypeScript; the React hook and the scenes sit on top.

import { stableStringify, type Champion } from "../../sheet";
import { STEP_MS, type FightEvent, type FightInput, type Rapier, type Side } from "../../sim";
import { PoseDriver } from "./driver";
import {
  checkHash,
  EventCursor,
  findLandingStep,
  healthAt,
  storedEvents,
  type HashCheck,
  type StoredOutcomeLike,
} from "./playback";
import { FightRecording, SIDES, type SampledFighter } from "./recording";

/** Wall ms per frame spent recording ahead of the clock. */
const LOOKAHEAD_BUDGET_MS = 5;
/** Wall ms per frame when the recording is behind the clock (a late open). */
const CATCH_UP_BUDGET_MS = 40;

/** A span of sim time the presentation clock jumped over (a resync). */
export interface SkippedSpan {
  fromMs: number;
  toMs: number;
}

/** Beats that always play, even inside a skipped span: they change what the room is watching. */
const STORY_EVENTS: ReadonlySet<FightEvent["kind"]> = new Set(["edge", "ringout", "ko", "suddenDeath", "timeout", "end"]);

/** One crossed event and whether its effects should play (false for a skipped span). */
export interface PlayedEvent {
  event: FightEvent;
  /** Play its hit stop, slow-mo, camera and sound. False when it fell inside a skipped span. */
  fresh: boolean;
}

export interface FightPlayerOptions {
  /** A label for warnings. */
  label?: string;
}

/** Recent recordings by input key, so RESULT and the recap reuse what FIGHT recorded. */
const cache = new Map<string, FightRecording>();
const CACHE_SIZE = 2;

export function inputKey(input: FightInput): string {
  // Names survive upgrades. Every simulation input belongs in the key, and
  // canonical ordering also lets the live view and recap reuse a recording.
  return stableStringify(input);
}

export function cachedRecording(input: FightInput): FightRecording | null {
  return cache.get(inputKey(input)) ?? null;
}

function remember(recording: FightRecording): void {
  const key = inputKey(recording.input);
  cache.delete(key);
  cache.set(key, recording);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value as string;
    cache.get(oldest)?.dispose();
    cache.delete(oldest);
  }
}

export class FightPlayer {
  readonly input: FightInput;
  readonly stored: StoredOutcomeLike | null;
  readonly drivers: Record<Side, PoseDriver>;
  recording: FightRecording | null = null;
  samples: Record<Side, SampledFighter> | null = null;
  hash: HashCheck = "pending";
  /** The sim time on screen, ms. */
  t = 0;
  /** Health on screen (verified local run, else the stored timeline). */
  readonly health: Record<Side, number>;
  readonly maxHealth: Record<Side, number>;
  /** Ring-out landing time per side (sim ms), once found. */
  readonly landingMs: Record<Side, number | null> = { A: null, B: null };

  private cursor: EventCursor | null = null;
  private readonly label: string;
  private landingChecked = false;
  private readonly crossed: FightEvent[] = [];

  constructor(input: FightInput, stored: StoredOutcomeLike | null, options: FightPlayerOptions = {}) {
    this.input = input;
    this.stored = stored;
    this.label = options.label ?? "fight";
    this.drivers = { A: new PoseDriver(input.a, "A"), B: new PoseDriver(input.b, "B") };
    const max = stored?.maxHealth ?? { A: 100, B: 100 };
    this.maxHealth = { A: max.A, B: max.B };
    this.health = { A: max.A, B: max.B };
    const cached = cachedRecording(input);
    if (cached) this.attach(cached);
  }

  get ready(): boolean {
    return this.recording !== null;
  }

  /** The champions (for the creatures). */
  champion(side: Side): Champion {
    return side === "A" ? this.input.a : this.input.b;
  }

  /** Create the recording once Rapier has loaded (no-op when one is attached). */
  start(R: Rapier): void {
    if (this.recording) return;
    this.attach(new FightRecording(R, this.input));
  }

  private attach(recording: FightRecording): void {
    this.recording = recording;
    remember(recording);
    this.maxHealth.A = recording.maxHealth.A;
    this.maxHealth.B = recording.maxHealth.B;
    this.samples = { A: recording.createSample("A"), B: recording.createSample("B") };
    this.cursor = new EventCursor(recording.events);
    this.cursor.seek(-1);
    if (recording.complete) this.onComplete();
  }

  /** Record ahead of `targetMs` for this frame (catching up fast when behind). */
  record(targetMs: number): void {
    const recording = this.recording;
    if (!recording || recording.complete) return;
    const behind = recording.recordedMs < targetMs + STEP_MS;
    recording.advance(behind ? targetMs + 1_000 : Infinity, behind ? CATCH_UP_BUDGET_MS : LOOKAHEAD_BUDGET_MS);
    if (recording.complete) this.onComplete();
  }

  /**
   * Record for up to `budgetMs` of wall time with nothing on screen yet
   * (RESULT's replay on a stage that never saw the fight). Never the
   * catch-up budget: a long frame here would land on the phase's entry.
   */
  recordAhead(budgetMs: number): void {
    const recording = this.recording;
    if (!recording || recording.complete) return;
    recording.advance(Infinity, budgetMs);
    if (recording.complete) this.onComplete();
  }

  private onComplete(): void {
    const recording = this.recording;
    if (!recording) return;
    this.hash = checkHash(recording, this.stored, this.label);
    if (!this.landingChecked) {
      this.landingChecked = true;
      for (const event of recording.events) {
        if (event.kind !== "ringout") continue;
        const step = findLandingStep(recording, event.side, event.t);
        if (step !== null) {
          recording.freezeStep[event.side] = step;
          this.landingMs[event.side] = step * STEP_MS;
        }
      }
    }
  }

  /**
   * Present sim time `targetMs`: sample both fighters, drive the creatures and
   * return the local events crossed since the last frame. `skipped` is a span
   * the clock jumped over (a resync): events inside it are returned with
   * `fresh: false`, except the story beats (edge, ring-out, KO, the end). An
   * impact crossed this frame pins the shown time to its contact moment so
   * the hit stop freezes on it.
   */
  update(targetMs: number, dt: number, skipped: SkippedSpan | null = null): PlayedEvent[] {
    const recording = this.recording;
    const samples = this.samples;
    const cursor = this.cursor;
    if (!recording || !samples || !cursor) return [];
    if (!recording.complete) this.record(targetMs);
    const shown = Math.min(targetMs, recording.recordedMs);
    const crossed = this.crossed;
    crossed.length = 0;
    const back = shown < cursor.t;
    cursor.advance(shown, crossed);
    let t = shown;
    const played: PlayedEvent[] = [];
    for (const event of crossed) {
      const inSkip = skipped !== null && event.t > skipped.fromMs && event.t <= skipped.toMs;
      const fresh = !back && (!inSkip || STORY_EVENTS.has(event.kind));
      played.push({ event, fresh });
      if (fresh && (event.kind === "hit" || event.kind === "throw") && event.t < t) t = Math.max(event.t, t - STEP_MS);
    }
    this.t = t;
    for (const side of SIDES) {
      recording.sample(side, t, samples[side]);
      const driver = this.drivers[side];
      for (const { event, fresh } of played) if (fresh) driver.onEvent(event);
      driver.update(samples[side], dt);
    }
    this.updateHealth(t);
    return played;
  }

  /** Seek without effects (recap scrubbing, a late open). */
  seek(targetMs: number): void {
    this.cursor?.seek(Math.min(targetMs, this.recording?.recordedMs ?? 0));
  }

  private updateHealth(t: number): void {
    const samples = this.samples;
    if (this.hash === "match" && samples) {
      this.health.A = samples.A.live.health;
      this.health.B = samples.B.live.health;
      return;
    }
    if (this.stored) {
      const health = healthAt(this.stored.healthTimeline, t, this.maxHealth);
      this.health.A = health.A;
      this.health.B = health.B;
      return;
    }
    if (samples) {
      this.health.A = samples.A.live.health;
      this.health.B = samples.B.live.health;
    }
  }

  /** The stored log (for narration) or, without one, the local run's. */
  get narrationEvents(): FightEvent[] {
    if (this.stored) return storedEvents(this.stored);
    return this.recording?.outcome?.events ?? [];
  }

  /** The decisive result: the stored outcome, else the local run's. */
  get result(): { winner: Side; method: StoredOutcomeLike["method"]; endMs: number } | null {
    const outcome = this.stored ?? this.recording?.outcome ?? null;
    return outcome ? { winner: outcome.winner, method: outcome.method, endMs: outcome.endMs } : null;
  }
}
