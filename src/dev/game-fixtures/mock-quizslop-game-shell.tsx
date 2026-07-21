"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import {
  QuizslopGameShell,
  type QuizslopGameShellFixture,
} from "@/games/quizslop/ui/quizslop-game-shell";
import {
  clampQuizslopBeatIndex,
  createQuizslopFixtureBeats,
  readSharedQuizslopBeatIndex,
  subscribeToSharedQuizslopBeatIndex,
  writeSharedQuizslopBeatIndex,
  QUIZSLOP_FIXTURE_PLAYER_KEYS,
  type QuizslopFixtureBeat,
} from "./mock-quizslop-state";

/**
 * Shared beat-position hook for the QuizSlop prototype tabs. The index lives
 * in the URL query (reload keeps position) and is synchronized across tabs
 * via BroadcastChannel with a localStorage/storage-event fallback — whoever
 * navigates broadcasts.
 */
export function useQuizslopFixtureBeats(): {
  beats: QuizslopFixtureBeat[];
  beatIndex: number;
  setBeatIndex: (index: number) => void;
  stepBeat: (delta: number) => void;
} {
  const searchParams = useSearchParams();
  const urlBeat = Number.parseInt(searchParams.get("beat") ?? "", 10);
  const beatCount = useMemo(() => createQuizslopFixtureBeats(0).length, []);
  const [beatIndex, setBeatIndexState] = useState(() =>
    Number.isFinite(urlBeat) ? clampQuizslopBeatIndex(urlBeat, beatCount) : 0,
  );
  // Handlers read the ref so all side effects (URL, broadcast) stay in event
  // handlers — never inside a state updater, which StrictMode double-invokes.
  const beatIndexRef = useRef(beatIndex);

  // Regenerate on navigation so phase timers count down from "now".
  const beats = useMemo(() => {
    void beatIndex;
    return createQuizslopFixtureBeats(Date.now());
  }, [beatIndex]);

  const applyBeat = useCallback(
    (index: number, broadcast: boolean) => {
      const clamped = clampQuizslopBeatIndex(index, beatCount);
      beatIndexRef.current = clamped;
      setBeatIndexState(clamped);
      const url = new URL(window.location.href);
      url.searchParams.set("beat", String(clamped));
      window.history.replaceState(window.history.state, "", url);
      if (broadcast) writeSharedQuizslopBeatIndex(clamped);
    },
    [beatCount],
  );

  const setBeatIndex = useCallback((index: number) => applyBeat(index, true), [applyBeat]);
  const stepBeat = useCallback(
    (delta: number) => applyBeat(beatIndexRef.current + delta, true),
    [applyBeat],
  );

  // Without an explicit ?beat= adopt the shared cross-tab position on mount.
  useEffect(() => {
    if (!Number.isFinite(urlBeat)) {
      applyBeat(readSharedQuizslopBeatIndex(), false);
    }
    return subscribeToSharedQuizslopBeatIndex((incoming) => {
      applyBeat(incoming, false);
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount-only adoption + subscription
  }, []);

  // Keyboard arrows step beats (skipped while typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowRight") stepBeat(1);
      if (event.key === "ArrowLeft") stepBeat(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBeat]);

  return { beats, beatIndex, setBeatIndex, stepBeat };
}

export function MockQuizslopNavBar({
  beat,
  beatIndex,
  beatCount,
  stepBeat,
  setBeatIndex,
  viewLabel,
  switcher,
}: {
  beat: QuizslopFixtureBeat;
  beatIndex: number;
  beatCount: number;
  stepBeat: (delta: number) => void;
  setBeatIndex: (index: number) => void;
  viewLabel: string;
  switcher?: React.ReactNode;
}) {
  const { theme, toggle: toggleTheme } = useTheme();
  return (
    <div className="shrink-0 border-b border-edge bg-base/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/dev/ui"
              className="font-display font-bold text-punch hover:text-punch-hover"
            >
              DEV UI
            </Link>
            <span className="text-edge-strong">/</span>
            <span className="truncate font-mono text-ink-dim">{beat.slug}</span>
            <span className="rounded-full border border-gold/40 bg-gold-soft px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-gold">
              QUIZSLOP · {viewLabel}
            </span>
            <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
              {beat.stage.phase}
            </span>
          </div>
          <h1 className="truncate font-display text-sm font-bold text-ink">{beat.title}</h1>
          <p className="max-w-xl truncate text-xs text-ink-dim">{beat.description}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
          {switcher}
          <button
            type="button"
            onClick={toggleTheme}
            className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            onClick={() => setBeatIndex(0)}
            className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => stepBeat(-1)}
            disabled={beatIndex === 0}
            className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="font-mono tabular-nums text-ink-dim">
            {beatIndex + 1}/{beatCount}
          </span>
          <button
            type="button"
            onClick={() => stepBeat(1)}
            disabled={beatIndex >= beatCount - 1}
            className="cursor-pointer rounded-md border border-punch/40 bg-punch/10 px-2 py-1 text-punch hover:border-punch hover:bg-punch/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export function MockQuizslopGameShell() {
  const { beats, beatIndex, setBeatIndex, stepBeat } = useQuizslopFixtureBeats();
  const beat = beats[beatIndex] ?? beats[0];
  if (!beat) return null;

  const fixture: QuizslopGameShellFixture = {
    view: beat.stage,
    start: () => stepBeat(1),
    advance: () => stepBeat(1),
  };

  return (
    <div className="flex h-svh flex-col">
      <MockQuizslopNavBar
        beat={beat}
        beatIndex={beatIndex}
        beatCount={beats.length}
        stepBeat={stepBeat}
        setBeatIndex={setBeatIndex}
        viewLabel="STAGE"
        switcher={
          <span className="flex items-center gap-1">
            {QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => (
              <Link
                key={key}
                href={`/dev/ui/quizslop-prototype/controller?player=${key}&beat=${beatIndex}`}
                target="_blank"
                className="rounded-md border border-teal/40 bg-teal/10 px-2 py-1 text-teal hover:border-teal hover:bg-teal/15"
              >
                {key}
              </Link>
            ))}
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto [&>div]:min-h-full">
        <QuizslopGameShell code="mock-quizslop" fixture={fixture} viewMode="stage" />
      </div>
    </div>
  );
}
