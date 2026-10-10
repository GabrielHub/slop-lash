// Caption pacing, clip placement and bounded speech requests share the line contract.
// They have no knowledge of fighters, arena rules or authored template selection.
import { FIGHT_SPEECH_GAP_MS, speechMs, type VoiceLine } from "./lines";

// ---------------------------------------------------------------------------
// Pacing for live beats
// ---------------------------------------------------------------------------

export interface TimedVoiceLine extends VoiceLine {
  /** When the line lands, in the caller's clock (server ms for the room). */
  at: number;
}

/**
 * Times a batch of phase lines (the roster, a face-off) one after another
 * from `startMs`, each waiting for the previous one to finish.
 */
export function scheduleLines(
  lines: readonly VoiceLine[],
  startMs: number,
  gapMs = 400,
): TimedVoiceLine[] {
  let at = startMs;
  return lines.map((line) => {
    const timed = { ...line, at };
    at += speechMs(line.text) + gapMs;
    return timed;
  });
}

/** Fight lines on the room clock: the fight's t = 0 is `startsAt`. */
export function timeFightLines(lines: readonly VoiceLine[], startsAt: number): TimedVoiceLine[] {
  return lines.map((line) => ({ ...line, at: startsAt + (line.atMs ?? 0) }));
}

/**
 * A priority queue for beats that arrive live (forges finishing during
 * Build): one line at a time, the most important first, never talking over
 * the last line, and dropping lines that waited too long to still be news.
 */
export class VoiceQueue {
  private pending: Array<{ line: VoiceLine; arrived: number; order: number }> = [];
  private readonly seen = new Set<string>();
  private freeAt = -Infinity;
  private order = 0;

  constructor(private readonly options: { gapMs?: number; staleMs?: number } = {}) {}

  push(lines: VoiceLine | readonly VoiceLine[], nowMs: number): void {
    for (const line of Array.isArray(lines) ? lines : [lines as VoiceLine]) {
      if (this.seen.has(line.key)) continue;
      this.seen.add(line.key);
      this.pending.push({ line, arrived: nowMs, order: this.order++ });
    }
  }

  /** The line to say now, or null while the Voice is still talking or nothing is due. */
  next(nowMs: number): TimedVoiceLine | null {
    const staleMs = this.options.staleMs ?? 8_000;
    this.pending = this.pending.filter((entry) => nowMs - entry.arrived <= staleMs);
    if (nowMs < this.freeAt || this.pending.length === 0) return null;
    this.pending.sort((p, q) => q.line.priority - p.line.priority || p.order - q.order);
    const { line } = this.pending.shift()!;
    this.freeAt = nowMs + Math.max(this.options.gapMs ?? FIGHT_SPEECH_GAP_MS, speechMs(line.text));
    return { ...line, at: nowMs };
  }

  get size(): number {
    return this.pending.length;
  }
}

// ---------------------------------------------------------------------------
// Placing voiced clips (the host's TTS)
// ---------------------------------------------------------------------------

export interface PlacedClip {
  id: string;
  /** Seconds on the audio clock. */
  start: number;
  end: number;
  priority: number;
}

/**
 * Where a voiced clip goes: at its wanted time, or as soon after it as the
 * Voice is free. A more important clip bumps a less important one that has
 * not started yet. Null when it would land more than `lateS` after its
 * moment, because by then the moment has passed.
 */
export function placeClip(
  clips: readonly PlacedClip[],
  clip: { want: number; duration: number; priority: number },
  nowS: number,
  {
    lateS = 1.5,
    gapS = 0.12,
    leadS = 0.03,
  }: { lateS?: number; gapS?: number; leadS?: number } = {},
): { start: number; bump: string[] } | null {
  let start = Math.max(clip.want, nowS + leadS);
  const bump: string[] = [];
  let live = clips.filter((other) => other.end > nowS);
  for (;;) {
    const clash = live.find(
      (other) => start < other.end + gapS && other.start < start + clip.duration + gapS,
    );
    if (!clash) break;
    if (clash.priority < clip.priority && clash.start > nowS + leadS) {
      bump.push(clash.id);
      live = live.filter((other) => other !== clash);
      continue;
    }
    start = clash.end + gapS;
  }
  return start - clip.want > lateS ? null : { start, bump };
}

interface SpeechRequest<T> {
  id: string;
  line: VoiceLine;
  /** The line's moment (room ms); Infinity for a prefetch with no moment yet. */
  due: number;
  promise: Promise<T | null>;
  resolve: (value: T | null) => void;
}

/**
 * The host's speech requests: one per line (by key and text), the most
 * urgent first, a few at a time. A line can be asked for early with no moment
 * yet (a prefetch, like the fight's opening call at the face-off) and claimed
 * later with its moment, which moves it up the queue or reuses the clip
 * already fetched. A request still waiting when its moment has passed by more
 * than `lateMs` is dropped, because by then it is no longer news.
 */
export class SpeechRequests<T> {
  private readonly requests = new Map<string, SpeechRequest<T>>();
  private waiting: SpeechRequest<T>[] = [];
  private inFlight = 0;

  constructor(
    private readonly options: {
      fetch: (line: VoiceLine) => Promise<T>;
      /** The room clock, in ms. */
      now: () => number;
      concurrency?: number;
      lateMs?: number;
      onBusy?: (inFlight: number) => void;
      onResult?: (error: unknown) => void;
    },
  ) {}

  /** The clip for `line`, fetched now or reused; null when it failed or could not be had in time. */
  get(line: VoiceLine, due = Infinity): Promise<T | null> {
    const id = `${line.key}\n${line.text}`;
    let request = this.requests.get(id);
    if (!request) {
      let resolve: (value: T | null) => void = () => {};
      const promise = new Promise<T | null>((done) => {
        resolve = done;
      });
      request = { id, line, due, promise, resolve };
      this.requests.set(id, request);
      this.waiting.push(request);
    } else if (due < request.due) {
      request.due = due;
    }
    this.pump();
    return request.promise;
  }

  /** Drops every request not sent yet; they can be asked for again. */
  clear(): void {
    for (const request of this.waiting) this.drop(request);
    this.waiting = [];
  }

  get pending(): number {
    return this.waiting.length + this.inFlight;
  }

  private drop(request: SpeechRequest<T>): void {
    this.requests.delete(request.id);
    request.resolve(null);
  }

  private pump(): void {
    const { concurrency = 2, lateMs = 1_500 } = this.options;
    while (this.inFlight < concurrency && this.waiting.length > 0) {
      this.waiting.sort((p, q) => p.due - q.due || q.line.priority - p.line.priority);
      const request = this.waiting.shift()!;
      if (this.options.now() > request.due + lateMs) {
        this.drop(request);
        continue;
      }
      this.inFlight += 1;
      this.options.onBusy?.(this.inFlight);
      void this.options
        .fetch(request.line)
        .then(
          (value) => {
            request.resolve(value);
            this.options.onResult?.(null);
          },
          (error: unknown) => {
            // A failed line may be asked for again later.
            this.drop(request);
            this.options.onResult?.(error ?? new Error("speech failed"));
          },
        )
        .finally(() => {
          this.inFlight -= 1;
          this.options.onBusy?.(this.inFlight);
          this.pump();
        });
    }
  }
}
