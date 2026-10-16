"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GAME_META } from "@/games/meta";
import { useAwake } from "@/hooks/use-awake";
import type { GameType } from "@/games/core/types";
import { resetAmbient, setAmbient } from "@/lib/ambient-events";
import { activateAudio } from "@/lib/sounds";
import { TutorialLiveContext } from "@/tutorial/live";
import { TutorialPlayer, type PlayerControl } from "@/tutorial/player";
import { TUTORIALS } from "@/tutorial/registry";
import { chaptersOf } from "@/tutorial/timeline";
import { livePreview } from "./live-preview";

declare global {
  interface Window {
    /** Drives the page's player from automation: frame capture and review. */
    __tutorial?: PlayerControl;
  }
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

/**
 * A game's how-to-play video on its own page: a start card (a tap also
 * unlocks sound), then the player with a scrubber, captions and fullscreen.
 * `frozenAt` (`?t=`) opens it paused on one frame, for review and capture;
 * `live` (`?live=`) plays it for a pretend lobby of that many players.
 */
export function HowToPlay({
  game,
  frozenAt,
  captions: captionsAtStart,
  live: liveCount,
}: {
  game: GameType;
  frozenAt: number | null;
  captions: boolean;
  live: number | null;
}) {
  const entry = TUTORIALS[game];
  const meta = GAME_META[game];
  const duration = entry.timing.durationMs / 1000;
  const chapters = chaptersOf(entry.script, entry.timing);
  const api = useRef<PlayerControl | null>(null);
  const [started, setStarted] = useState(frozenAt !== null);
  const [ended, setEnded] = useState(false);
  const [state, setState] = useState({ t: frozenAt ?? 0, playing: false });
  const [captions, setCaptions] = useState(captionsAtStart);
  const awake = useAwake(2500);
  // Picks land as the playhead passes them, so the lobby follows the reported time.
  const live = useMemo(
    () => (liveCount === null ? null : livePreview(entry, liveCount, state.t)),
    [entry, liveCount, state.t],
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-game", meta.theme);
    return () => root.removeAttribute("data-game");
  }, [meta.theme]);

  useEffect(() => {
    setAmbient({ scene: entry.ambient, surface: "stage", energy: "calm" });
    return () => resetAmbient();
  }, [entry.ambient]);

  const play = () => {
    void activateAudio();
    setStarted(true);
    setEnded(false);
    api.current?.play();
  };
  const toggle = () => {
    if (!api.current) return;
    if (api.current.playing && !ended) api.current.pause();
    else play();
  };
  const seek = (t: number) => {
    setEnded(false);
    api.current?.seek(t);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || !api.current) return;
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowRight") seek(api.current.t + 5);
      else if (event.key === "ArrowLeft") seek(api.current.t - 5);
      else if (event.key === "c") setCaptions((on) => !on);
      else if (event.key === "f") fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const showControls = started && (!state.playing || awake || ended);

  return (
    <main className="fixed inset-0 select-none" data-surface-tutorial>
      <TutorialLiveContext value={live}>
        <TutorialPlayer
          entry={entry}
          name={meta.name}
          start={{ kind: "free", autoplay: false, from: frozenAt ?? 0 }}
          sound
          captions={captions}
          onProgress={(t, playing) => setState({ t, playing })}
          onEnd={() => setEnded(true)}
          control={(control) => {
            api.current = control;
            window.__tutorial = control;
          }}
        >
          {!started && (
            <div className="absolute inset-0 z-50 grid place-items-center bg-canvas/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-6 px-6 text-center">
                <p className="font-display text-sm font-extrabold uppercase tracking-[0.3em] text-ink-dim">
                  How to play
                </p>
                <h1 className="font-display text-6xl font-black tracking-tight text-punch sm:text-8xl">
                  {meta.name}
                </h1>
                <p className="text-lg text-ink-dim">{meta.tagline}</p>
                <button
                  type="button"
                  onClick={play}
                  className="mt-4 flex h-16 cursor-pointer items-center gap-3 rounded-full bg-punch px-10 font-display text-2xl font-bold text-accent-ink transition-transform hover:scale-[1.03] active:scale-95"
                >
                  <PlayGlyph playing={false} />
                  Play · {formatTime(duration)}
                </button>
                {!entry.timing.audio && (
                  <p className="text-sm text-ink-dim">The voice-over isn&apos;t recorded yet.</p>
                )}
              </div>
            </div>
          )}

          {ended && (
            <div className="absolute inset-0 z-50 grid place-items-center bg-canvas/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={play}
                  className="h-14 cursor-pointer rounded-full border-2 border-edge-strong bg-surface px-8 font-display text-xl font-bold text-ink"
                >
                  Watch again
                </button>
                <Link
                  href={`/host?game=${game}`}
                  className="grid h-14 place-items-center rounded-full bg-punch px-8 font-display text-xl font-bold text-accent-ink"
                >
                  Host a game
                </Link>
              </div>
            </div>
          )}

          <div
            data-tutorial-controls
            className={`absolute inset-x-0 bottom-0 z-50 bg-gradient-to-t from-canvas/90 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300 sm:px-6 ${
              showControls ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="relative mb-2 h-6">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={state.t}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label="Seek"
                className="absolute inset-0 w-full cursor-pointer accent-(--punch)"
              />
              {chapters.map((chapter) => (
                <span
                  key={chapter.title}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 h-6 w-[2px] bg-ink/40"
                  style={{ left: `${(chapter.start / duration) * 100}%` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-ink">
              <button
                type="button"
                onClick={toggle}
                aria-label={state.playing && !ended ? "Pause" : "Play"}
                className="grid size-10 cursor-pointer place-items-center rounded-full bg-surface/80 hover:bg-surface"
              >
                <PlayGlyph playing={state.playing && !ended} />
              </button>
              <span className="tabular-nums text-ink-dim">
                {formatTime(state.t)} / {formatTime(duration)}
              </span>
              <span className="ml-1 hidden truncate text-ink-dim sm:inline">
                {chapters.findLast((chapter) => chapter.start <= state.t)?.title ?? meta.name}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setCaptions((on) => !on)}
                aria-pressed={captions}
                className={`h-10 cursor-pointer rounded-full px-4 font-display font-bold ${
                  captions ? "bg-ink text-canvas" : "bg-surface/80 text-ink-dim"
                }`}
              >
                CC
              </button>
              <button
                type="button"
                onClick={fullscreen}
                aria-label="Fullscreen"
                className="grid size-10 cursor-pointer place-items-center rounded-full bg-surface/80 hover:bg-surface"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </button>
            </div>
          </div>
        </TutorialPlayer>
      </TutorialLiveContext>
    </main>
  );
}
