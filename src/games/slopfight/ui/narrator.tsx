"use client";

// The Voice, out loud: on the host's stage only, when the room has the
// narrator on (never in Free Play). The stage hands over the lines it shows
// as captions, each with the room-clock time its moment happens; this hook
// asks the server to voice the spoken ones verbatim, earliest first, and
// schedules each clip on the audio clock so it lands with its moment. A clip
// that comes back more than LATE_S after its moment is dropped, clips never
// overlap, and the music and ambience duck while the Voice talks. Lines known
// before their moment is (the fight's opening call, at the face-off) can be
// prefetched so they are ready when it comes.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  activateAudio,
  getAudioContext,
  getAudioStateVersion,
  getAudioStatus,
  getNarratorBusNode,
  isMuted,
  setNarratorDucking,
  subscribeAudio,
} from "@/lib/sounds";
import { useRoom } from "@/room/context";
import {
  SpeechRequests,
  placeClip,
  type PlacedClip,
  type TimedVoiceLine,
  type VoiceLine,
} from "../narration";

/** A clip that would start later than this after its moment is dropped. */
const LATE_S = 1.5;
/** Requests in flight at once: enough to stay ahead of a fight, few enough to keep order. */
const CONCURRENCY = 2;

export type SlopfightNarratorStatus =
  | "off"
  | "blocked"
  | "ready"
  | "generating"
  | "speaking"
  | "error";

type Speak = (args: {
  capability: string;
  eventType: "slopfight_line";
  fallbackText: string;
}) => Promise<{
  audioBase64: string;
}>;

interface Clip extends PlacedClip {
  source: AudioBufferSourceNode;
  timer: number;
  started: boolean;
}

interface VoiceEvents {
  onTalking: (talking: boolean) => void;
  onBusy: (requests: number) => void;
  onError: (message: string | null) => void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/**
 * Requests and schedules voiced lines. Lives outside React: the hook feeds it
 * lines and settings and listens for its status.
 */
class VoicePlayer {
  private speak: Speak | null = null;
  private capability: string | null = null;
  private clockOffsetMs = 0;
  private requests: SpeechRequests<string>;
  private scheduled = new Set<string>();
  private clips: Clip[] = [];
  private talking = 0;
  private generation = 0;

  constructor(private readonly events: VoiceEvents) {
    this.requests = this.newRequests();
  }

  /** The server action, the host's capability and the room clock offset. */
  configure(speak: Speak, capability: string | null, clockOffsetMs: number): void {
    this.speak = speak;
    this.capability = capability;
    this.clockOffsetMs = clockOffsetMs;
  }

  private roomNow(): number {
    return Date.now() + this.clockOffsetMs;
  }

  private newRequests(): SpeechRequests<string> {
    // Requests from a finished game may still land; only the current set reports.
    const current = () => this.requests === requests;
    const requests: SpeechRequests<string> = new SpeechRequests<string>({
      fetch: async (line) => {
        const { speak, capability } = this;
        if (!speak || !capability) throw new Error("The narrator is not set up");
        const { audioBase64 } = await speak({
          capability,
          eventType: "slopfight_line",
          fallbackText: line.text,
        });
        return audioBase64;
      },
      now: () => this.roomNow(),
      concurrency: CONCURRENCY,
      lateMs: LATE_S * 1000,
      onBusy: (inFlight) => {
        if (current()) this.events.onBusy(inFlight);
      },
      onResult: (error) => {
        if (!current()) return;
        if (error === null) {
          this.events.onError(null);
          return;
        }
        this.events.onError(
          error instanceof Error && error.message.trim() ? error.message : "Narrator speech failed",
        );
        console.warn("[slopfight narrator] speech failed:", error);
      },
    });
    return requests;
  }

  /**
   * Schedules every spoken line not scheduled yet: its clip is fetched (or
   * reused from a prefetch) and played at the line's moment.
   */
  add(lines: readonly TimedVoiceLine[]): void {
    const now = this.roomNow();
    for (const line of lines) {
      if (!line.speak || this.scheduled.has(line.key) || now > line.at + LATE_S * 1000) continue;
      this.scheduled.add(line.key);
      const ticket = this.generation;
      void this.requests
        .get(line, line.at)
        .then((audioBase64) =>
          audioBase64 !== null && ticket === this.generation
            ? this.play(line, audioBase64, ticket)
            : undefined,
        )
        .catch((error: unknown) =>
          console.warn("[slopfight narrator] could not play a line:", error),
        );
    }
  }

  /** Fetches clips ahead of their moment (the fight's opening call at the face-off). Plays nothing. */
  prefetch(lines: readonly VoiceLine[]): void {
    for (const line of lines) {
      if (line.speak) void this.requests.get(line);
    }
  }

  /**
   * Cuts everything: queued requests, scheduled clips, the clip speaking now.
   * Lines still ahead can be scheduled again afterwards (an unmute, a remount),
   * reusing any clip already fetched. A new game also forgets the fetched clips.
   */
  stop({ newGame = false }: { newGame?: boolean } = {}): void {
    this.generation += 1;
    this.requests.clear();
    if (newGame) this.requests = this.newRequests();
    this.scheduled.clear();
    for (const clip of this.clips) this.cut(clip);
    this.clips = [];
    if (this.talking > 0) {
      this.talking = 0;
      setNarratorDucking(false);
      this.events.onTalking(false);
    }
  }

  private async play(line: TimedVoiceLine, audioBase64: string, ticket: number): Promise<void> {
    if (!(await activateAudio())) return;
    const { ctx } = getAudioContext();
    const bus = getNarratorBusNode();
    if (!bus) return;
    const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(audioBase64));
    if (ticket !== this.generation) return;

    const nowS = ctx.currentTime;
    const want = nowS + (line.at - this.roomNow()) / 1000;
    const placed = placeClip(
      this.clips,
      { want, duration: buffer.duration, priority: line.priority },
      nowS,
      {
        lateS: LATE_S,
      },
    );
    if (!placed) {
      console.info(`[slopfight narrator] dropped a late line: ${line.key}`);
      return;
    }
    for (const id of placed.bump) {
      const bumped = this.clips.find((clip) => clip.id === id);
      if (bumped) this.cut(bumped);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(bus);
    const clip: Clip = {
      id: line.key,
      start: placed.start,
      end: placed.start + buffer.duration,
      priority: line.priority,
      source,
      started: false,
      timer: 0,
    };
    // Duck the beds as the clip starts, not when it is scheduled.
    clip.timer = window.setTimeout(
      () => {
        if (!this.clips.includes(clip)) return;
        clip.started = true;
        this.talking += 1;
        if (this.talking === 1) {
          setNarratorDucking(true);
          this.events.onTalking(true);
        }
      },
      Math.max(0, (placed.start - ctx.currentTime) * 1000 - 60),
    );
    source.onended = () => this.finish(clip);
    this.clips.push(clip);
    source.start(placed.start);
  }

  /** Stops a clip whether or not it has started. */
  private cut(clip: Clip): void {
    clip.source.onended = null;
    try {
      clip.source.stop();
    } catch {
      // Not started or already ended.
    }
    this.finish(clip);
  }

  private finish(clip: Clip): void {
    window.clearTimeout(clip.timer);
    clip.source.disconnect();
    this.clips = this.clips.filter((other) => other !== clip);
    if (!clip.started) return;
    clip.started = false;
    this.talking = Math.max(0, this.talking - 1);
    if (this.talking === 0) {
      setNarratorDucking(false);
      this.events.onTalking(false);
    }
  }
}

const getServerAudioStatus = () => "idle" as const;
const getServerVersion = () => 0;

const NO_LINES: readonly VoiceLine[] = [];

/**
 * Voices `lines` (only those with `speak`) on the host's stage. Pass every
 * line as soon as it is known (a fight's whole plan at FIGHT start): each is
 * requested once per game, by key, and played at its `at` (server ms).
 * `prefetch` lines are fetched but not played until they show up in `lines`
 * with the same key and text: pass `voice.fightStart(fight)` during the
 * face-off so "Fight!" is ready the moment the fight starts.
 */
export function useSlopfightNarrator(
  lines: readonly TimedVoiceLine[],
  prefetch: readonly VoiceLine[] = NO_LINES,
) {
  const { view, capability, clockOffsetMs } = useRoom();
  const { room, me } = view;
  const audioStatus = useSyncExternalStore(subscribeAudio, getAudioStatus, getServerAudioStatus);
  useSyncExternalStore(subscribeAudio, getAudioStateVersion, getServerVersion);
  const enabled = Boolean(
    me?.isHost &&
    room.ttsMode === "ON" &&
    !room.freePlay &&
    capability &&
    room.status === "PLAYING",
  );
  const ready = enabled && audioStatus === "ready" && !isMuted();
  const generate = useAction(api.narrator.generate);

  const [busy, setBusy] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player] = useState(
    () => new VoicePlayer({ onTalking: setSpeaking, onBusy: setBusy, onError: setError }),
  );

  useEffect(() => {
    player.configure(generate, capability, clockOffsetMs);
  }, [player, generate, capability, clockOffsetMs]);

  useEffect(() => () => player.stop(), [player]);

  // A new game (a rematch) reuses keys: start over.
  const gameId = room.id;
  const lastGame = useRef(gameId);
  useEffect(() => {
    if (lastGame.current === gameId) return;
    lastGame.current = gameId;
    player.stop({ newGame: true });
  }, [player, gameId]);

  useEffect(() => {
    if (!ready) {
      player.stop();
      return;
    }
    player.add(lines);
    player.prefetch(prefetch);
  }, [player, lines, prefetch, ready]);

  const status: SlopfightNarratorStatus = !enabled
    ? "off"
    : audioStatus === "error" || audioStatus === "unsupported"
      ? "error"
      : audioStatus !== "ready"
        ? "blocked"
        : speaking
          ? "speaking"
          : busy > 0
            ? "generating"
            : error
              ? "error"
              : "ready";

  return { status, error };
}

const LABELS: Record<Exclude<SlopfightNarratorStatus, "off">, string> = {
  blocked: "Tap to enable the Voice",
  error: "The Voice lost its voice",
  generating: "The Voice is warming up",
  ready: "The Voice is ready",
  speaking: "The Voice is speaking",
};

/**
 * The host stage's narrator: voices the lines and shows a small status dot in
 * the corner (a button when the browser is blocking audio). Renders nothing
 * off the host's screen or with the narrator off.
 */
export function SlopfightNarrator({
  lines,
  prefetch,
}: {
  lines: readonly TimedVoiceLine[];
  /** Lines to fetch ahead of their moment (see useSlopfightNarrator). */
  prefetch?: readonly VoiceLine[];
}) {
  const { status, error } = useSlopfightNarrator(lines, prefetch);
  if (status === "off") return null;
  if (status === "blocked") {
    return (
      <button
        type="button"
        onClick={() => void activateAudio()}
        className="fixed bottom-4 left-4 z-40 cursor-pointer rounded-full border border-edge bg-surface px-3 py-1.5 text-sm font-bold text-gold-ink"
      >
        {LABELS.blocked}
      </button>
    );
  }
  const tone =
    status === "error" ? "bg-fail" : status === "speaking" ? "animate-pulse bg-teal" : "bg-teal/50";
  return (
    <output
      className="fixed bottom-4 left-4 z-40 grid size-[2.5rem] place-items-center rounded-full border border-edge bg-surface"
      title={error ?? LABELS[status]}
      aria-label={LABELS[status]}
    >
      <span className={`size-[0.8rem] rounded-full ${tone}`} aria-hidden="true" />
    </output>
  );
}
