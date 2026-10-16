"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAudioStatus, subscribeAudio } from "@/lib/sounds";
import { TutorialAudio } from "./audio";
import { TutorialClock, TutorialProvider, useTime, useTutorial } from "./clock";
import { Board } from "./board";
import type { SoundCue, TutorialEntry, TutorialScene } from "./spec";
import { chaptersOf, clamp, cuesFor, ease, progress, type LineTiming } from "./timeline";

/** How the playhead moves. */
export type PlayerStart =
  /** Follows a shared start time, so every screen in a room shows the same frame. */
  | { kind: "synced"; /** Local epoch ms of t = 0. */ zero: number }
  /** A local video with its own play, pause and seek. */
  | { kind: "free"; autoplay: boolean; from?: number; paused?: boolean };

/** Sound cues further behind the playhead than this are skipped, not played late. */
const LATE_CUE_S = 0.3;
/** The voice is re-seated when it drifts this far from the picture. */
const DRIFT_S = 0.2;

/** Loads a game's scene once per mount. */
export function useTutorialScene(entry: TutorialEntry): TutorialScene | null {
  const [scene, setScene] = useState<{ game: string; scene: TutorialScene } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void entry.load().then((loaded) => {
      if (cancelled) return;
      loaded.preload?.();
      setScene({ game: entry.game, scene: loaded });
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);
  return scene?.game === entry.game ? scene.scene : null;
}

/** The line being said at `t` and how far it has faded in (0 once it is gone). */
function useCaptionLine(): { line: LineTiming; shown: number; t: number } | null {
  const t = useTime();
  const { timing } = useTutorial();
  const index = timing.lines.findLastIndex((line) => line.start - 0.12 <= t);
  const line = index >= 0 ? timing.lines[index] : null;
  if (!line) return null;
  const next = timing.lines[index + 1];
  const hideAt = Math.min(line.end + 1.1, next ? next.start - 0.12 : Infinity);
  if (t > hideAt + 0.2) return null;
  const shown = progress(t, line.start - 0.12, 0.18, ease.out) * (1 - progress(t, hideAt, 0.2));
  return { line, shown, t };
}

function CaptionWords({ line, t }: { line: LineTiming; t: number }) {
  return line.words.map((word, wordIndex) => (
    <span
      key={wordIndex}
      className={t >= word.start ? "text-ink" : "text-ink-dim"}
      style={{ opacity: t >= word.start ? 1 : 0.55 }}
    >
      {word.text}
      {wordIndex < line.words.length - 1 ? " " : ""}
    </span>
  ));
}

/** The current line, word by word as the host says it. */
function Captions() {
  const caption = useCaptionLine();
  if (!caption) return null;
  const { line, shown, t } = caption;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[44px] z-40 flex justify-center px-[160px]">
      <p
        key={line.id}
        className="max-w-[1500px] rounded-[30px] border border-edge px-[38px] py-[16px] text-center font-sans text-[38px] font-semibold leading-[1.3] text-balance shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]"
        style={{
          background: "color-mix(in srgb, var(--surface) 94%, transparent)",
          opacity: shown,
          transform: `translateY(${(1 - shown) * 14}px)`,
        }}
      >
        <CaptionWords line={line} t={t} />
      </p>
    </div>
  );
}

/**
 * The current line at reading size for a small screen, where the board's own
 * captions would scale down too far. Render it as a player child, with
 * `captions={false}`; it sits under the player's box.
 */
export function CaptionBelow() {
  const caption = useCaptionLine();
  return (
    <p
      aria-live="off"
      className="pointer-events-none absolute inset-x-0 top-full mt-3 min-h-[4.5em] text-center text-base font-semibold leading-snug text-balance"
    >
      {caption && (
        <span
          key={caption.line.id}
          className="inline-block"
          style={{
            opacity: caption.shown,
            transform: `translateY(${(1 - caption.shown) * 6}px)`,
          }}
        >
          <CaptionWords line={caption.line} t={caption.t} />
        </span>
      )}
    </p>
  );
}

/** "How to play" with the chapters as steps, and a progress rule along the bottom edge. */
function ChapterRail() {
  const t = useTime();
  const { script, timing, cues } = useTutorial();
  const chapters = useMemo(() => chaptersOf(script, timing), [script, timing]);
  if (chapters.length === 0) return null;
  const lastLine = timing.lines.at(-1);
  const shown =
    progress(t, chapters[0].start - 0.3, 0.4, ease.out) *
    (1 - progress(t, (lastLine?.end ?? cues.duration) + 0.2, 0.4));
  const active = chapters.findLastIndex((chapter) => chapter.start <= t);
  return (
    <>
      {shown > 0 && (
        <div
          className="pointer-events-none absolute left-[64px] top-[48px] z-40 flex items-center gap-[14px] rounded-full border border-edge px-[26px] py-[12px] font-display text-[24px] font-extrabold uppercase tracking-[0.12em]"
          style={{
            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
            opacity: shown,
            transform: `translateY(${(1 - shown) * -16}px)`,
          }}
        >
          {chapters.map((chapter, index) => (
            <span key={chapter.title} className="flex items-center gap-[14px]">
              {index > 0 && <span className="h-[3px] w-[22px] rounded-full bg-edge-strong" />}
              <span
                className={
                  index === active ? "text-punch" : index < active ? "text-ink" : "text-ink-dim"
                }
                style={{ opacity: index > active ? 0.6 : 1 }}
              >
                {chapter.title}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-[6px] bg-edge/60">
        <div
          className="h-full origin-left bg-punch"
          style={{ transform: `scaleX(${clamp(t / cues.duration)})` }}
        />
      </div>
    </>
  );
}

/** The game's name on a plain board while its scene loads. */
function Loading({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <p className="font-display text-[120px] font-black tracking-tight text-punch opacity-60">
        {name}
      </p>
    </div>
  );
}

export interface TutorialPlayerProps {
  entry: TutorialEntry;
  /** The game's display name, shown while the scene loads. */
  name: string;
  start: PlayerStart;
  /** Plays the voice and sound effects on this screen. */
  sound: boolean;
  captions?: boolean;
  /** Runs once when the playhead reaches the end. */
  onEnd?: () => void;
  /** Reports the playhead about four times a second, e.g. for a scrubber. */
  onProgress?: (t: number, playing: boolean) => void;
  /** Lets the page drive a free player: play, pause, seek. */
  control?: (api: PlayerControl) => void;
  /** Drawn over the board, unscaled, e.g. host buttons. */
  children?: ReactNode;
}

export interface PlayerControl {
  play(): void;
  pause(): void;
  seek(t: number): void;
  readonly playing: boolean;
  readonly t: number;
}

/**
 * Plays one game's tutorial: scales its board to the container, runs the
 * playhead, keeps the voice in step, fires sound cues as their beats pass and
 * draws captions and chapters over the scene. The container must have a size.
 */
export function TutorialPlayer({
  entry,
  name,
  start,
  sound,
  captions = true,
  onEnd,
  onProgress,
  control,
  children,
}: TutorialPlayerProps) {
  const { script, timing } = entry;
  const scene = useTutorialScene(entry);
  const [clock] = useState(() => new TutorialClock());
  const duration = timing.durationMs / 1000;
  const cues = useMemo(() => cuesFor(timing), [timing]);
  const soundCues = useMemo<SoundCue[]>(
    () => [...(scene?.sounds?.(cues) ?? [])].sort((a, b) => a.at - b.at),
    [scene, cues],
  );

  // The free playhead: `base` seconds at `baseNow` (performance.now ms).
  const head = useRef({
    playing: start.kind === "free" ? start.autoplay && !start.paused : true,
    base: start.kind === "free" ? (start.from ?? 0) : 0,
    baseNow: 0,
  });
  const audio = useRef<TutorialAudio | null>(null);
  const audioLoaded = useRef(false);
  const ended = useRef(false);

  const zero = start.kind === "synced" ? start.zero : null;

  const now = useEffectEvent((): number => {
    if (zero !== null) return clamp((Date.now() - zero) / 1000, 0, duration);
    const { playing, base, baseNow } = head.current;
    if (!playing) return base;
    return clamp(base + (performance.now() - baseNow) / 1000, 0, duration);
  });

  const syncAudio = useEffectEvent((t: number) => {
    const voice = audio.current;
    if (!voice || !audioLoaded.current || !sound) return;
    const playing = zero !== null || head.current.playing;
    if (!playing || t >= duration || getAudioStatus() !== "ready") {
      if (voice.position() !== null) voice.stop();
      return;
    }
    const position = voice.position();
    if (position === null || Math.abs(position - t) > DRIFT_S) voice.play(t);
  });

  // The voice: only screens that make the room's sound load it.
  useEffect(() => {
    if (!sound || !timing.audio) return;
    const voice = new TutorialAudio(timing.audio, duration);
    audio.current = voice;
    let cancelled = false;
    void voice.load().then((ok) => {
      if (cancelled || !ok) return;
      audioLoaded.current = true;
      syncAudio(now());
    });
    const unsubscribe = subscribeAudio(() => syncAudio(now()));
    return () => {
      cancelled = true;
      unsubscribe();
      voice.stop();
      audio.current = null;
      audioLoaded.current = false;
    };
  }, [sound, timing, duration]);

  const reportEnd = useEffectEvent(() => onEnd?.());
  const report = useEffectEvent((t: number, playing: boolean) => onProgress?.(t, playing));
  const fire = useEffectEvent((cue: SoundCue) => {
    if (sound) cue.play();
  });

  // The frame loop.
  useEffect(() => {
    head.current.baseNow = performance.now();
    let frame = 0;
    let last = now();
    let count = 0;
    const tick = () => {
      const t = now();
      if (t > last && t - last < 1) {
        for (const cue of soundCues) {
          if (cue.at > last && cue.at <= t && t - cue.at < LATE_CUE_S) fire(cue);
        }
      }
      last = t;
      clock.set(t);
      if (count++ % 15 === 0) {
        syncAudio(t);
        report(t, zero !== null || head.current.playing);
      }
      if (t >= duration && !ended.current) {
        ended.current = true;
        report(t, false);
        reportEnd();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, soundCues, duration, zero]);

  // The free player's controls.
  const exposeControl = useEffectEvent(() => {
    if (!control || zero !== null) return;
    const api: PlayerControl = {
      play: () => {
        const current = now();
        const from = current >= duration ? 0 : current;
        head.current = { playing: true, base: from, baseNow: performance.now() };
        ended.current = false;
        syncAudio(from);
      },
      pause: () => {
        head.current = { playing: false, base: now(), baseNow: performance.now() };
        audio.current?.stop();
      },
      seek: (t: number) => {
        const target = clamp(t, 0, duration);
        head.current = { ...head.current, base: target, baseNow: performance.now() };
        ended.current = target >= duration;
        clock.set(target);
        audio.current?.stop();
        syncAudio(target);
        report(target, head.current.playing);
      },
      get playing() {
        return head.current.playing;
      },
      get t() {
        return now();
      },
    };
    control(api);
  });
  useEffect(() => exposeControl(), []);

  useEffect(() => () => audio.current?.stop(), []);

  // The scene reads the clock itself; a parent re-render (a room push, a page tick) needn't redraw it.
  const body = useMemo(() => (scene ? <scene.Scene /> : <Loading name={name} />), [scene, name]);

  return (
    <TutorialProvider clock={clock} script={script} timing={timing}>
      <div
        className="absolute inset-0"
        data-tutorial={entry.game}
        data-tutorial-duration={timing.durationMs}
        data-tutorial-ready={scene ? "" : undefined}
      >
        <Board>
          {body}
          {captions && <Captions />}
          <ChapterRail />
        </Board>
        {children}
      </div>
    </TutorialProvider>
  );
}
