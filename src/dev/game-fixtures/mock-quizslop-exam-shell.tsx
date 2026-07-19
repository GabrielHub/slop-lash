"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { QuizslopExamControllerContent } from "@/games/quizslop/ui/quizslop-exam-controller";
import { QuizslopExamStageContent } from "@/games/quizslop/ui/quizslop-exam-stage";
import { QuizslopSoundToggle } from "@/games/quizslop/ui/quizslop-sound-toggle";
import { useQuizslopExamSounds } from "@/games/quizslop/ui/use-quizslop-exam-sounds";
import { playSound } from "@/lib/sounds";
import {
  clampQuizslopExamBeatIndex,
  createQuizslopExamFixtureBeats,
  QUIZSLOP_EXAM_PLAYER_KEYS,
  type QuizslopExamFixtureBeat,
  type QuizslopExamPlayerKey,
} from "./mock-quizslop-exam-state";

const STORAGE_KEY = "slop-lash:quizslop-exam-fixture-beat";
const CHANNEL_NAME = "slop-lash:quizslop-exam-fixture";

function readStoredIndex(): number {
  try {
    return Number.parseInt(window.localStorage.getItem(STORAGE_KEY) ?? "0", 10);
  } catch {
    return 0;
  }
}

function broadcastIndex(index: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(index));
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(index);
    channel.close();
  } catch {
    // The query parameter still keeps a single tab deterministic.
  }
}

function useQuizslopExamFixture(): {
  beats: QuizslopExamFixtureBeat[];
  beatIndex: number;
  setBeatIndex: (index: number) => void;
  stepBeat: (delta: number) => void;
} {
  const searchParams = useSearchParams();
  const beats = useMemo(() => createQuizslopExamFixtureBeats(), []);
  const queryIndex = Number.parseInt(searchParams.get("beat") ?? "", 10);
  const [beatIndex, setBeatIndexState] = useState(() =>
    clampQuizslopExamBeatIndex(Number.isFinite(queryIndex) ? queryIndex : 0, beats.length),
  );
  const beatIndexRef = useRef(beatIndex);

  const applyIndex = useCallback(
    (next: number, broadcast: boolean) => {
      const clamped = clampQuizslopExamBeatIndex(next, beats.length);
      beatIndexRef.current = clamped;
      setBeatIndexState(clamped);
      const url = new URL(window.location.href);
      url.searchParams.set("beat", String(clamped));
      window.history.replaceState(window.history.state, "", url);
      if (broadcast) broadcastIndex(clamped);
    },
    [beats.length],
  );

  useEffect(() => {
    if (!Number.isFinite(queryIndex)) applyIndex(readStoredIndex(), false);
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === "number") applyIndex(event.data, false);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        applyIndex(Number.parseInt(event.newValue, 10), false);
      }
    };
    channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      channel.close();
      window.removeEventListener("storage", onStorage);
    };
    // Mount-only adoption and subscription; applyIndex is stable for fixed fixture length.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBeatIndex = useCallback((index: number) => applyIndex(index, true), [applyIndex]);
  const stepBeat = useCallback(
    (delta: number) => applyIndex(beatIndexRef.current + delta, true),
    [applyIndex],
  );
  return { beats, beatIndex, setBeatIndex, stepBeat };
}

function asPlayerKey(raw: string | null): QuizslopExamPlayerKey {
  return QUIZSLOP_EXAM_PLAYER_KEYS.find((key) => key === raw) ?? "P1";
}

function MockExamNav({
  beat,
  beatIndex,
  beatCount,
  playerKey,
  onStep,
  onSet,
}: {
  beat: QuizslopExamFixtureBeat;
  beatIndex: number;
  beatCount: number;
  playerKey: QuizslopExamPlayerKey | null;
  onStep: (delta: number) => void;
  onSet: (index: number) => void;
}) {
  const { theme, toggle } = useTheme();
  return (
    <div className="relative z-50 shrink-0 border-b border-edge bg-base/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-start justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
            <Link href="/dev/ui" className="font-black text-punch">
              Dev UI
            </Link>
            <span className="text-ink-dim">
              / QuizSlop v2 / {playerKey ? `Controller ${playerKey}` : "Stage"}
            </span>
            <span className="border border-gold/40 bg-gold-soft px-2 py-0.5 text-gold">
              {beat.stage.phase}
            </span>
          </div>
          <p className="mt-1 truncate font-display text-sm font-black text-ink">{beat.title}</p>
          <p className="max-w-2xl truncate text-xs text-ink-dim">{beat.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <QuizslopSoundToggle />
          <Link
            href={`/dev/ui/quizslop-prototype?beat=${beatIndex}`}
            target={playerKey ? "_blank" : undefined}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center ${
              !playerKey
                ? "border border-gold bg-gold-soft px-2 font-black text-gold"
                : "border border-edge px-2 text-ink-dim"
            }`}
          >
            Stage
          </Link>
          {QUIZSLOP_EXAM_PLAYER_KEYS.map((key) => (
            <Link
              key={key}
              href={`/dev/ui/quizslop-prototype/controller?player=${key}&beat=${beatIndex}`}
              target={!playerKey ? "_blank" : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center ${
                playerKey === key
                  ? "border border-teal bg-teal/20 px-2 font-black text-teal"
                  : "border border-edge px-2 text-ink-dim"
              }`}
            >
              {key}
            </Link>
          ))}
          <button
            type="button"
            onClick={toggle}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-edge px-2 text-ink-dim"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            onClick={() => onSet(0)}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-edge px-2 text-ink-dim"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={beatIndex === 0}
            onClick={() => onStep(-1)}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-edge px-2 text-ink-dim disabled:opacity-30"
          >
            ←
          </button>
          <span className="min-w-11 text-center font-mono tabular-nums text-ink-dim">
            {beatIndex + 1}/{beatCount}
          </span>
          <button
            type="button"
            disabled={beatIndex >= beatCount - 1}
            onClick={() => onStep(1)}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-punch/50 bg-punch/10 px-2 text-punch disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamCanvas({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-game", "quizslop");
    return () => document.documentElement.removeAttribute("data-game");
  }, []);
  return (
    <div
      className="relative min-h-full overflow-x-hidden"
      style={{ color: "var(--qs-ink)", background: "var(--qs-bg)" }}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(102deg, transparent 0 48%, color-mix(in srgb, var(--qs-punch) 5%, transparent) 48% 48.2%, transparent 48.2%), radial-gradient(circle at 92% 8%, var(--qs-marquee-soft), transparent 35%)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function MockQuizslopExamStageShell() {
  const { beats, beatIndex, setBeatIndex, stepBeat } = useQuizslopExamFixture();
  const beat = beats[beatIndex] ?? beats[0];
  if (!beat) return null;
  return (
    <div className="flex h-svh flex-col">
      <MockExamNav
        beat={beat}
        beatIndex={beatIndex}
        beatCount={beats.length}
        playerKey={null}
        onStep={stepBeat}
        onSet={setBeatIndex}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ExamStageFixture beat={beat} stepBeat={stepBeat} />
      </div>
    </div>
  );
}

function ExamStageFixture({
  beat,
  stepBeat,
}: {
  beat: QuizslopExamFixtureBeat;
  stepBeat: (delta: number) => void;
}) {
  useQuizslopExamSounds(beat.stage);
  return (
    <ExamCanvas>
      <QuizslopExamStageContent
        view={beat.stage}
        busyAction={null}
        actions={{
          start: () => stepBeat(1),
          advance: () => stepBeat(1),
          removePlayer: () => undefined,
        }}
      />
    </ExamCanvas>
  );
}

export function MockQuizslopExamControllerShell() {
  const searchParams = useSearchParams();
  const playerKey = asPlayerKey(searchParams.get("player"));
  const { beats, beatIndex, setBeatIndex, stepBeat } = useQuizslopExamFixture();
  const beat = beats[beatIndex] ?? beats[0];
  if (!beat) return null;
  const view = beat.controllers[playerKey];
  const submit = (sound: "submitted" | "vote-cast" | "stamp-slam" = "submitted") => {
    playSound(sound);
    stepBeat(1);
  };
  return (
    <div className="flex h-svh flex-col">
      <MockExamNav
        beat={beat}
        beatIndex={beatIndex}
        beatCount={beats.length}
        playerKey={playerKey}
        onStep={stepBeat}
        onSet={setBeatIndex}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ExamCanvas>
          <QuizslopExamControllerContent
            view={view}
            busyAction={null}
            actions={{
              start: () => submit("stamp-slam"),
              removePlayer: () => undefined,
              submitScratch: () => submit(),
              submitProxyAnswer: () => submit("stamp-slam"),
              submitGroupAnswer: () => submit("vote-cast"),
              submitDefense: () => submit("submitted"),
              castSuspensionVote: () => submit("vote-cast"),
              castFinalAccusation: () => submit("vote-cast"),
            }}
          />
        </ExamCanvas>
      </div>
    </div>
  );
}
