// The Voice service on the stage (build plan decision 9: The Voice is always
// captioned in the scene; TTS plays only where the narrator is allowed).
//
// One `Voice(gameSeed)` per game (narration.ts) writes the lines; this
// service decides when they show. Every line becomes a camera-fixed Caption
// (ui3d/caption.tsx) at its moment, and the same timed lines feed
// <SlopfightNarrator lines prefetch> (ui3d/voice-narration.tsx), which voices
// the spoken ones on the host's stage when TTS is allowed.
//
//   voice.voice                  the game's Voice (lines are cached by key)
//   voice.say(line)              a live beat: queued so lines never overlap
//   voice.schedule(timedLines)   lines with their own moment (a fight's plan)
//   voice.prefetch(lines)        TTS fetched early, not captioned yet
//
// Times are the presentation clock's ms (server time minus hit-stop debt),
// the clock fight lines are timed on (`timeFightLines(plan, startsAt)`).

import {
  speechMs,
  Voice,
  VoiceQueue,
  type TimedVoiceLine,
  type VoiceLine,
} from "../../narration";

/** Live beats show this long after they are released, so the host's TTS has a head start. */
export const SAY_LEAD_MS = 600;
/** Pause between two queued lines. */
export const SAY_GAP_MS = 700;
/** A queued line older than this is no longer news. */
export const SAY_STALE_MS = 12_000;
/** A caption stays up at least this long (and as long as it takes to say). */
export const CAPTION_MIN_MS = 2_600;
/** A line due more than this long ago (a clock jump) is skipped instead of captioned late. */
const LATE_SKIP_MS = 2_500;
/** Lines kept for the narrator (it dedupes by key; older ones are already scheduled or dropped). */
const NARRATED_KEEP = 60;

export interface CaptionState {
  /** Increments per caption. */
  seq: number;
  line: TimedVoiceLine;
  /** Presentation-clock ms it went up. */
  shownAt: number;
  /** When it should come down (unless a newer line replaces it). */
  until: number;
}

export interface NarratorFeed {
  lines: readonly TimedVoiceLine[];
  prefetch: readonly VoiceLine[];
}

type LineInput = VoiceLine | null | undefined | readonly (VoiceLine | null | undefined)[];

function toLines(input: LineInput): VoiceLine[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input as VoiceLine];
  return list.filter((line): line is VoiceLine => !!line);
}

export class VoiceService {
  private seed: string | null = null;
  private instance: Voice | null = null;
  private queue = new VoiceQueue({ gapMs: SAY_GAP_MS, staleMs: SAY_STALE_MS });
  /** Lines waiting for their moment, sorted by `at`. */
  private pending: TimedVoiceLine[] = [];
  private readonly shownKeys = new Set<string>();
  private feed: NarratorFeed = { lines: [], prefetch: [] };
  private readonly listeners = new Set<() => void>();
  private captionSeq = 0;
  /** The caption on screen now, or null. Read every frame by <Caption>. */
  caption: CaptionState | null = null;

  constructor(private readonly now: () => number) {}

  /** The game's Voice. Created on first use; replaced when the game changes. */
  get voice(): Voice {
    if (!this.instance) this.instance = new Voice(this.seed ?? "slopfight");
    return this.instance;
  }

  /** The seed the current Voice was made with (null until a game sets one). */
  get gameSeed(): string | null {
    return this.seed;
  }

  /** Start a new game's Voice (a rematch gets a fresh one). No-op for the same seed. */
  setGame(seed: string | number): void {
    const next = String(seed);
    if (next === this.seed) return;
    this.seed = next;
    this.instance = new Voice(next);
    this.queue = new VoiceQueue({ gapMs: SAY_GAP_MS, staleMs: SAY_STALE_MS });
    this.pending = [];
    this.shownKeys.clear();
    this.caption = null;
    this.setFeed({ lines: [], prefetch: [] });
  }

  /**
   * A live beat (a forge finished, the roster, the standings): queued so it
   * never talks over the last line; the most important waiting line goes
   * first, and lines that waited too long are dropped. Its voice is
   * prefetched at once.
   */
  say(input: LineInput): void {
    const lines = toLines(input).filter((line) => !this.shownKeys.has(line.key));
    if (lines.length === 0) return;
    this.queue.push(lines, this.now());
    this.prefetch(lines);
  }

  /** Lines with their own moment (`at`, presentation-clock ms), e.g. a fight's plan. */
  schedule(lines: readonly TimedVoiceLine[]): void {
    const fresh = lines.filter(
      (line) => !this.shownKeys.has(line.key) && !this.pending.some((other) => other.key === line.key),
    );
    if (fresh.length === 0) return;
    this.pending = [...this.pending, ...fresh].sort((p, q) => p.at - q.at);
    this.narrate(fresh);
  }

  /** Fetch these lines' voice early (the fight's opening call at the face-off); no caption yet. */
  prefetch(input: LineInput): void {
    const lines = toLines(input);
    const known = new Set(this.feed.prefetch.map((line) => `${line.key}\n${line.text}`));
    const fresh = lines.filter((line) => !known.has(`${line.key}\n${line.text}`));
    if (fresh.length === 0) return;
    this.setFeed({ lines: this.feed.lines, prefetch: [...this.feed.prefetch, ...fresh].slice(-20) });
  }

  /** Drop waiting lines (all, or those matching), e.g. a fight skipped before its plan played out. */
  cancel(match?: (line: VoiceLine) => boolean): void {
    this.pending = match ? this.pending.filter((line) => !match(line)) : [];
    if (!match) this.queue = new VoiceQueue({ gapMs: SAY_GAP_MS, staleMs: SAY_STALE_MS });
  }

  /**
   * Drop live beats still waiting their turn (the scene they were about has
   * gone). Lines already released keep their moment: the narrator has them.
   */
  dropQueued(): void {
    this.queue.clear();
  }

  /** Take the caption down now (it flicks off). */
  hideCaption(): void {
    if (this.caption) this.caption = { ...this.caption, until: this.now() };
  }

  /** Lines still waiting (queued or scheduled). */
  get waiting(): number {
    return this.pending.length + this.queue.size;
  }

  /** Per frame: release queued lines, raise due captions. */
  tick(): void {
    const now = this.now();
    const released = this.queue.next(now);
    if (released) {
      const timed = { ...released, at: now + SAY_LEAD_MS };
      this.pending = [...this.pending, timed].sort((p, q) => p.at - q.at);
      this.narrate([timed]);
    }
    if (this.pending.length === 0 || this.pending[0]!.at > now) return;
    // Normally one line falls due per frame; after a clock jump, only the newest shows.
    let due: TimedVoiceLine | null = null;
    while (this.pending.length > 0 && this.pending[0]!.at <= now) {
      due = this.pending.shift()!;
      this.shownKeys.add(due.key);
    }
    if (due && now - due.at <= LATE_SKIP_MS) {
      this.captionSeq += 1;
      this.caption = {
        seq: this.captionSeq,
        line: due,
        shownAt: now,
        until: now + Math.max(CAPTION_MIN_MS, speechMs(due.text) + 900),
      };
    }
  }

  // --- the narrator's feed (useSyncExternalStore) --------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): NarratorFeed => this.feed;

  private narrate(lines: readonly TimedVoiceLine[]): void {
    this.setFeed({ lines: [...this.feed.lines, ...lines].slice(-NARRATED_KEEP), prefetch: this.feed.prefetch });
  }

  private setFeed(feed: NarratorFeed): void {
    this.feed = feed;
    for (const listener of this.listeners) listener();
  }
}
