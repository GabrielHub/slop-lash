"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SpeakerIcon, toggleSound, useAudioState } from "@/components/audio-controls";
import { CountdownRing } from "./timer";
import { QrCode } from "@/components/qr-code";
import { useGameUi } from "./game-ui-context";
import { fade } from "@/lib/animations";
import { useRoom } from "./context";
import { useStageKey } from "./host-dock";
import { FrozenRoom } from "./scene";
import { recapPath } from "./session";
import { useClientValue } from "@/hooks/use-hydrated";

/** This site's host (e.g. "slop-lash.vercel.app"), empty during server rendering. */
export function useSiteHost(): string {
  return useClientValue(() => window.location.host, "");
}

/** This site's origin, empty during server rendering. */
export function useSiteOrigin(): string {
  return useClientValue(() => window.location.origin, "");
}

export type StageVariant = "stage" | "docked" | "recap";

/** M mutes and unmutes the TV, for anyone at the keyboard, host or not. A held key does nothing more. */
export function useMuteKey(enabled: boolean) {
  useStageKey(enabled, (event) => {
    if (event.key === "m" || event.key === "M") void toggleSound();
  });
}

/** The TV's quiet sound toggle (M does the same). Every stage gets one, spectators included. */
export function StageSoundButton({ className = "" }: { className?: string }) {
  const { muted, volume } = useAudioState();
  return (
    <button
      type="button"
      onClick={() => void toggleSound()}
      aria-label={muted ? "Unmute (M)" : "Mute (M)"}
      title={muted ? "Unmute (M)" : "Mute (M)"}
      aria-keyshortcuts="M"
      className={`grid size-[2.5rem] shrink-0 cursor-pointer place-items-center rounded-full text-ink-dim/70 transition-colors hover:bg-raised hover:text-ink ${className}`}
    >
      <SpeakerIcon muted={muted} volume={volume} className="size-[1.25rem]" />
    </button>
  );
}

/**
 * Rail content that belongs to one moment of the game: it keeps showing the
 * leaving phase's data while the scene exits, then fades over to the new one,
 * so the frame changes with the content instead of before it.
 */
function InStep({ id, children }: { id: string | number; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        className="flex items-center gap-[1rem] self-stretch empty:hidden"
        variants={fade}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <FrozenRoom>{children}</FrozenRoom>
      </motion.div>
    </AnimatePresence>
  );
}

/** The round as plain text; it reads from the couch, where a row of dots doesn't. */
function RoundLabel() {
  const { room } = useRoom().view;
  if (room.status !== "PLAYING" || room.round < 1 || room.totalRounds <= 1) return null;
  return (
    <span className="whitespace-nowrap text-[0.875rem] font-semibold uppercase tracking-[0.2em] text-ink-dim">
      Round {room.round}
      <span className="text-ink-dim/60"> / {room.totalRounds}</span>
    </span>
  );
}

/** The room code, always on screen so latecomers and dropped players can get in. Compact on a phone-sized stage. */
function JoinChip({ code }: { code: string }) {
  return (
    <div className="flex h-[2.5rem] items-center gap-[0.75rem] rounded-full border border-edge/60 bg-surface/80 px-[0.75rem] sm:pl-[1rem] sm:pr-[0.875rem]">
      <span className="text-[0.75rem] font-semibold uppercase tracking-[0.2em] text-ink-dim max-sm:hidden">
        Join
      </span>
      <span className="font-mono text-[1.125rem] font-extrabold leading-none tracking-[0.15em] text-gold-ink sm:text-[1.5rem] sm:tracking-[0.25em]">
        {code}
      </span>
    </div>
  );
}

/**
 * Where the results live once the game ends. On the TV a QR sits inside the
 * rail (never over the scene, so a full finale keeps its corner); a narrow
 * stage or the docked view gets the link alone.
 */
function ResultsLink({ code, gameNumber, qr }: { code: string; gameNumber: number; qr: boolean }) {
  const origin = useSiteOrigin();
  const path = recapPath(code, gameNumber);
  return (
    <Link
      href={path}
      className="flex items-center gap-[0.875rem] self-stretch transition-opacity hover:opacity-80"
    >
      <span className="text-[0.875rem] font-semibold uppercase tracking-[0.2em] text-ink-dim">
        Results
      </span>
      {qr && origin && (
        <QrCode
          value={`${origin}${path}`}
          label={`Scan for the results of room ${code}`}
          className="size-[3rem] shrink-0 max-sm:hidden"
        />
      )}
    </Link>
  );
}

/**
 * The stage's top rail: the game's wordmark and round on the left; the join
 * code, the countdown ring and the sound toggle on the right. It floats over
 * the background with a hairline under it. The round and the clock change
 * with the scene (`sceneId`), not before it. The ring steps aside when the
 * scene shows its own seconds. A live room's wordmark is plain text, so
 * nobody taps out of the game; the recap's links home.
 */
export function StageRail({
  variant,
  sceneId,
  menu,
}: {
  variant: StageVariant;
  sceneId: string;
  menu?: ReactNode;
}) {
  const { view } = useRoom();
  const { room } = view;
  const ui = useGameUi();
  const playing = room.status === "PLAYING";
  const finished = room.status === "FINISHED";
  const lobby = room.status === "LOBBY";
  const showClock = playing && !ui.ownsStageClock?.(view);
  const wordmark = (
    <span className="font-display text-[1.5rem] font-extrabold uppercase leading-none tracking-tight text-punch">
      {ui.name}
    </span>
  );

  return (
    <header className="relative z-10 flex h-[3.5rem] shrink-0 items-center justify-between gap-[1rem] border-b border-edge/40 px-4 sm:gap-[1.5rem] sm:px-[2rem]">
      <div className="flex min-w-0 items-center gap-[1.5rem] self-stretch">
        {lobby ? null : variant === "recap" ? (
          <Link href="/" className="transition-opacity hover:opacity-80">
            {wordmark}
          </Link>
        ) : (
          // A phone-sized stage spends its width on the join code instead.
          <span className={variant === "stage" ? "max-sm:hidden" : ""}>{wordmark}</span>
        )}
        <InStep id={`${room.status}:${room.round}`}>
          <RoundLabel />
        </InStep>
      </div>
      <div className="flex shrink-0 items-center gap-[0.5rem] self-stretch sm:gap-[1rem]">
        <InStep id={room.status}>
          {playing && variant === "stage" && <JoinChip code={room.code} />}
          {finished && variant !== "recap" && (
            <ResultsLink code={room.code} gameNumber={room.gameNumber} qr={variant === "stage"} />
          )}
        </InStep>
        <InStep id={sceneId}>
          {showClock && (
            <CountdownRing
              className={`size-[2.75rem] text-[1.125rem] ${variant === "docked" ? "hidden lg:grid" : ""}`}
            />
          )}
        </InStep>
        {variant === "recap" && (
          <Link
            href={`/host?game=${room.gameType}`}
            className="whitespace-nowrap rounded-xl bg-punch px-4 py-2 font-display text-sm font-bold text-accent-ink transition-colors hover:bg-punch-hover"
          >
            Host <span className="max-sm:hidden">your own</span>
            <span className="sm:hidden">a</span> game
          </Link>
        )}
        {menu}
      </div>
    </header>
  );
}
