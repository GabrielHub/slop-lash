"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import { AudioUnlockHint } from "@/components/audio-controls";
import { ErrorBanner } from "@/components/error-banner";
import { CheckIcon, SkipIcon } from "@/components/icons";
import { GAME_META } from "@/games/meta";
import { SPRING, press } from "@/lib/animations";
import { preloadAudio } from "@/lib/sounds";
import { TutorialLiveContext, type TutorialLive } from "@/tutorial/live";
import { CaptionBelow, TutorialPlayer } from "@/tutorial/player";
import { TUTORIALS } from "@/tutorial/registry";
import type { TutorialEntry, TutorialPractice } from "@/tutorial/spec";
import { chaptersOf, clamp, cuesFor } from "@/tutorial/timeline";
import { useRoom, useRoomAction, useServerNow } from "./context";
import { useHostActions, hostName } from "./host-actions";
import { useStageKey } from "./host-dock";
import { buzz } from "./moment/buzz";

/** After the video ends, how long its last frame holds while the game starts. */
const END_HOLD_MS = 4_000;

export interface TutorialRun {
  entry: TutorialEntry;
  /** Server ms the video began. */
  startedAt: number;
  /** This device's epoch ms for the video's t = 0. */
  zero: number;
}

/**
 * The lobby's how-to-play video while it runs (null otherwise). It re-renders
 * once when the video and its hold run out, not on every clock tick.
 */
export function useTutorialRun(): TutorialRun | null {
  const { view, clockOffsetMs } = useRoom();
  const { status, gameType, tutorialStartedAt } = view.room;
  const startedAt = status === "LOBBY" ? tutorialStartedAt : null;
  const entry = TUTORIALS[gameType];
  const zero = startedAt === null ? null : startedAt - clockOffsetMs;
  const releaseAt = zero === null ? null : zero + entry.timing.durationMs + END_HOLD_MS;
  const subscribe = useMemo(
    () => (notify: () => void) => {
      if (releaseAt === null) return () => {};
      const timer = window.setTimeout(notify, Math.max(0, releaseAt - Date.now()) + 30);
      return () => window.clearTimeout(timer);
    },
    [releaseAt],
  );
  const over = useSyncExternalStore(
    subscribe,
    () => releaseAt === null || Date.now() > releaseAt,
    () => releaseAt === null,
  );
  if (startedAt === null || zero === null || over) return null;
  return { entry, startedAt, zero };
}

/**
 * While the host has the video on and hasn't started, loads its scene (and,
 * on the screen that plays the sound, its voice), so Start opens on the
 * first frame rather than a loading card.
 */
export function useTutorialWarmup(sound: boolean) {
  const { view } = useRoom();
  const { status, gameType, tutorial, tutorialStartedAt } = view.room;
  const warm = status === "LOBBY" && tutorial && tutorialStartedAt === null;
  useEffect(() => {
    if (!warm) return;
    const entry = TUTORIALS[gameType];
    void entry.load().then((scene) => scene.preload?.());
    if (sound && entry.timing.audio) preloadAudio(entry.timing.audio, "tutorial voice");
  }, [warm, sound, gameType]);
}

/** The room's seats as the video sees them: who is playing and what they answered. */
function RoomLive({ children }: { children: ReactNode }) {
  const { view } = useRoom();
  const live = useMemo<TutorialLive>(
    () => ({
      players: view.players.map((player) => ({
        id: player.id,
        name: player.name,
        isAi: player.type === "AI",
        pick: player.tutorialPick,
      })),
    }),
    [view.players],
  );
  return <TutorialLiveContext value={live}>{children}</TutorialLiveContext>;
}

/**
 * The how-to-play video on the shared screen, on the room's clock so every
 * screen shows the same frame. The host can skip it (button or Enter), which
 * starts the game. `opaque` hides a game-drawn lobby left mounted beneath.
 */
export function StageTutorial({
  run,
  sound,
  keys,
  opaque = false,
}: {
  run: TutorialRun;
  /** This screen makes the room's sound (the TV, or a desktop player's docked stage). */
  sound: boolean;
  /** Enter skips (the TV, where no control has focus). */
  keys: boolean;
  opaque?: boolean;
}) {
  const { view } = useRoom();
  const isHost = view.me?.isHost === true;
  const { start, pending } = useHostActions();
  useStageKey(keys && isHost, (event) => {
    if (event.key !== "Enter" || pending) return;
    event.preventDefault();
    void start();
  });

  return (
    <div className={`absolute inset-0 z-30 ${opaque ? "bg-canvas" : ""}`}>
      <RoomLive>
        <TutorialPlayer
          entry={run.entry}
          name={GAME_META[run.entry.game].name}
          start={{ kind: "synced", zero: run.zero }}
          sound={sound}
        >
          <div className="absolute right-[1.25rem] top-[1.25rem] flex items-center gap-[0.75rem]">
            {sound && <AudioUnlockHint className="text-[0.75rem]" />}
            {isHost && (
              <motion.button
                type="button"
                onClick={() => void start()}
                disabled={pending}
                className="flex h-[2.5rem] cursor-pointer items-center gap-[0.5rem] rounded-full border border-edge bg-surface/85 px-[1.1rem] text-[0.875rem] font-bold text-ink-dim backdrop-blur transition-colors hover:text-ink disabled:opacity-60"
                {...press}
              >
                Skip
                <SkipIcon className="size-[1rem]" />
              </motion.button>
            )}
          </div>
        </TutorialPlayer>
      </RoomLive>
    </div>
  );
}

function TvIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="10" width="38" height="26" rx="4" />
      <path d="M17 42h14M24 36v6M18 4l6 6 6-6" />
    </svg>
  );
}

/** The video on this phone, for a room with no TV or a player away from it. */
function PhoneVideo({ run, name }: { run: TutorialRun; name: string }) {
  return (
    <div className="relative mb-[6em] aspect-video w-full rounded-2xl border-2 border-edge bg-canvas [&_[data-tutorial-box]]:rounded-[14px]">
      <RoomLive>
        <TutorialPlayer entry={run.entry} name={name} start={{ kind: "synced", zero: run.zero }} sound captions={false}>
          <CaptionBelow />
        </TutorialPlayer>
      </RoomLive>
    </div>
  );
}

/** How long a phone shows whether it got the practice question after the reveal. */
const PRACTICE_RESULT_S = 6;
const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

/** When a practice question is on this phone, in video seconds. */
function practiceWindow(entry: TutorialEntry) {
  const { practice } = entry;
  if (!practice) return null;
  const cues = cuesFor(entry.timing);
  return {
    practice,
    opens: cues.word(practice.opens.line, practice.opens.word),
    closes: cues.at(practice.closes),
  };
}

/**
 * The video's practice question on a phone: one tap locks an answer, the
 * room's count fills in, and after the reveal the phone says how it went.
 * Nothing is scored.
 */
function PracticeCard({
  practice,
  opens,
  closes,
  t,
}: {
  practice: TutorialPractice;
  opens: number;
  closes: number;
  t: number;
}) {
  const { view } = useRoom();
  const { act, error } = useRoomAction();
  const [tapped, setTapped] = useState<number | null>(null);
  const me = view.players.find((player) => player.id === view.me?.playerId);
  const chosen = me?.tutorialPick ?? tapped;
  const revealed = t >= closes;
  const humans = view.players.filter((player) => player.type !== "AI");
  const lockedCount = humans.filter((player) => player.tutorialPick !== null).length;
  const left = clamp(1 - (t - opens) / (closes - opens));

  const lock = (index: number) => {
    if (chosen !== null || revealed) return;
    setTapped(index);
    buzz(20);
    void act(api.tutorial.pick, { choice: index }).then((ok) => {
      if (!ok) setTapped(null);
    });
  };

  let status: string;
  if (revealed) {
    status =
      chosen === practice.answer
        ? "Nailed it. That's how it feels."
        : `It was ${CHOICE_LETTERS[practice.answer]}: ${practice.choices[practice.answer]}`;
  } else if (chosen !== null) {
    status = `Locked in. ${lockedCount} of ${humans.length} in.`;
  } else {
    status = "One tap locks it in";
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.smooth}
      className="flex w-full max-w-md flex-col gap-4 text-left"
      aria-label="Practice question"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-punch/12 px-3 py-1 font-display text-xs font-extrabold uppercase tracking-[0.2em] text-punch">
          {revealed && chosen === practice.answer ? "Correct" : "Rehearsal"}
        </span>
        {!revealed && (
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-edge" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-punch transition-[width] duration-300 ease-linear"
              style={{ width: `${left * 100}%` }}
            />
          </span>
        )}
      </div>
      <h2 className="font-display text-2xl font-bold text-balance text-ink">{practice.prompt}</h2>
      <ErrorBanner error={error ? "Didn't lock. Tap again." : null} className="" />
      <ol className="flex flex-col gap-2">
        {practice.choices.map((choice, index) => {
          const picked = chosen === index;
          const right = revealed && index === practice.answer;
          const settled = chosen !== null || revealed;
          return (
            <li key={choice}>
              <motion.button
                type="button"
                disabled={settled}
                onClick={() => lock(index)}
                className={`flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-[opacity,border-color,background-color] duration-150 disabled:cursor-default ${
                  right
                    ? "border-win bg-win/12"
                    : picked
                      ? "border-teal bg-teal-soft"
                      : "border-edge bg-surface"
                } ${settled && !picked && !right ? "opacity-35" : ""}`}
                {...(settled ? {} : press)}
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg font-black ${
                    right
                      ? "bg-win text-accent-ink"
                      : picked
                        ? "bg-teal text-accent-ink"
                        : "bg-raised text-ink"
                  }`}
                >
                  {picked || right ? <CheckIcon className="size-5" /> : CHOICE_LETTERS[index]}
                </span>
                <span className="text-base font-semibold text-ink">{choice}</span>
              </motion.button>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-sm font-semibold text-ink-dim" aria-live="polite">
        {status}
      </p>
    </motion.section>
  );
}

/**
 * A phone while the TV plays the how-to-play video: where to look, the
 * chapter the video is on, and the host's skip. A phone with no TV in sight
 * can play the video itself. The game starts by itself when the video ends.
 */
export function PhoneTutorial({ run, docked = false }: { run: TutorialRun; docked?: boolean }) {
  const { view } = useRoom();
  const now = useServerNow();
  const isHost = view.me?.isHost === true;
  const { start, pending } = useHostActions();
  const [here, setHere] = useState(false);
  const { script, timing } = run.entry;
  const chapters = useMemo(() => chaptersOf(script, timing), [script, timing]);
  const t = (now - run.startedAt) / 1000;
  const duration = timing.durationMs / 1000;
  const active = chapters.findLastIndex((chapter) => chapter.start <= t);
  const name = GAME_META[run.entry.game].name;
  const host = hostName(view);
  const practiceAt = useMemo(() => practiceWindow(run.entry), [run.entry]);
  const seated = view.me?.playerId != null;
  const practicing =
    practiceAt !== null &&
    seated &&
    t >= practiceAt.opens - 0.3 &&
    t < practiceAt.closes + PRACTICE_RESULT_S;

  return (
    <main className="flex flex-1 flex-col">
      <div
        className={`flex flex-1 flex-col items-center gap-8 px-6 text-center ${here || practicing ? "justify-start pb-6 pt-14" : "justify-center py-10"}`}
      >
        {here && <PhoneVideo run={run} name={name} />}
        {practicing ? (
          <PracticeCard
            practice={practiceAt.practice}
            opens={practiceAt.opens}
            closes={practiceAt.closes}
            t={t}
          />
        ) : here ? null : (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING.pop}
              className="grid size-24 place-items-center rounded-[1.75rem] bg-punch/12 text-punch"
              data-ambient-calm
            >
              <TvIcon className="size-14" />
            </motion.div>
            <div data-ambient-calm>
              <p className="font-display text-sm font-extrabold uppercase tracking-[0.25em] text-punch">
                How to play {name}
              </p>
              <h1 className="mt-2 font-display text-4xl font-black text-ink">
                {docked ? "Watch the video" : "Watch the TV"}
              </h1>
              <p className="mt-2 text-base text-ink-dim">The game starts right after.</p>
            </div>
          </>
        )}
        {chapters.length > 0 && (
          <ol className="flex flex-wrap justify-center gap-2" aria-label="Chapters">
            {chapters.map((chapter, index) => (
              <li
                key={chapter.title}
                aria-current={index === active ? "step" : undefined}
                className={`rounded-full px-3.5 py-1.5 font-display text-sm font-bold transition-colors ${
                  index === active
                    ? "bg-punch text-accent-ink"
                    : index < active
                      ? "bg-raised text-ink"
                      : "bg-raised text-ink-dim"
                }`}
              >
                {chapter.title}
              </li>
            ))}
          </ol>
        )}
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-punch transition-[width] duration-300 ease-linear"
            style={{ width: `${clamp(t / duration) * 100}%` }}
          />
        </div>
        {!docked && (
          <button
            type="button"
            onClick={() => setHere((on) => !on)}
            className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold text-ink-dim underline decoration-edge-strong underline-offset-4 transition-colors hover:text-ink"
          >
            {here ? "Hide the video" : "No TV? Watch it here"}
          </button>
        )}
      </div>
      <div className="sticky bottom-0 bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {isHost ? (
          <motion.button
            type="button"
            onClick={() => void start()}
            disabled={pending}
            className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-edge bg-surface font-display text-lg font-bold text-ink disabled:opacity-60"
            {...press}
          >
            Skip to the game
            <SkipIcon className="size-5" />
          </motion.button>
        ) : (
          <p className="text-center text-sm text-ink-dim">
            {host ? `${host} can skip it` : "The host can skip it"}
          </p>
        )}
      </div>
    </main>
  );
}
