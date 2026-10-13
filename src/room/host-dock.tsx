"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PlayerList } from "./player-list";
import { useGameUi } from "./game-ui-context";
import { DUR, EASE, SPRING, pop, press } from "@/lib/animations";
import { useRoom } from "./context";
import { NO_FREE_GAMES, useCanPlayAgain, useEndControlsReady } from "./finished";
import { TWO_TAP_MS, isHostClocked, useHostActions, useTwoTap } from "./host-actions";
import { PeopleIcon, SkipIcon, StopIcon } from "@/components/icons";
import { useTitleCardShowing } from "./title-card";

/** The dock hides after this long without the pointer or keyboard, so the room sees a clean screen. */
const IDLE_MS = 3_000;

/** True while the pointer or keyboard has been used in the last `IDLE_MS`. */
function useAwake() {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer = window.setTimeout(() => setAwake(false), IDLE_MS);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), IDLE_MS);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
    };
  }, []);
  return awake;
}

/** A key press that belongs to a form field or a focused control, not to the stage's shortcuts. */
export function belongsToControl(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return false;
  if (target.isContentEditable || target.closest("input, textarea, select")) return true;
  return (
    (event.key === " " || event.key === "Enter") &&
    target.closest("button, a, [role='button'], [role='switch']") !== null
  );
}

/**
 * A window-wide stage shortcut while `enabled`. Held keys, modified keys and
 * keys that belong to a focused field or control never reach `onKey`.
 */
export function useStageKey(enabled: boolean, onKey: (event: KeyboardEvent) => void) {
  const handle = useEffectEvent(onKey);
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      // A held key (or a TV remote held on "right") must not arm and commit in one press.
      if (event.repeat || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (belongsToControl(event)) return;
      handle(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled]);
}

function DockButton({
  label,
  onClick,
  children,
  danger = false,
  armed = false,
  expanded,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  armed?: boolean;
  expanded?: boolean;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      className={`relative grid h-[2.5rem] min-w-[2.5rem] cursor-pointer place-items-center overflow-hidden rounded-full px-[0.75rem] transition-colors ${
        armed
          ? "bg-fail text-accent-ink"
          : danger
            ? "text-ink-dim hover:bg-fail-soft hover:text-fail"
            : "text-ink-dim hover:bg-raised hover:text-ink"
      }`}
      {...press}
    >
      {children}
      {armed && <DrainUnderline />}
    </motion.button>
  );
}

/** A 3s line under an armed button, so the host sees the second-press window close. */
function DrainUnderline() {
  return (
    <motion.span
      aria-hidden="true"
      className="absolute inset-x-[0.75rem] bottom-[0.3rem] h-[0.125rem] origin-left rounded-full bg-accent-ink/70"
      initial={{ scaleX: 1 }}
      animate={{ scaleX: 0 }}
      transition={{ duration: TWO_TAP_MS / 1_000, ease: "linear" }}
    />
  );
}

/**
 * The host's controls on a screen with a mouse (the TV, or the docked /game
 * view): a quiet pill group with skip, players and end. On the TV it sits in
 * the middle of the top rail, which holds no content, so it never covers the
 * game. Skip and end take two presses. It fades out after 3s without the
 * pointer and comes back on any movement or key.
 *
 * In a "no timers" room the host is the clock: a labelled Continue ("Next
 * matchup ▸") stays on screen instead of skip, and pops in only once any title
 * card has gone. A phase whose clock is hidden (waiting on the AI) keeps the
 * two-tap skip, since skipping it throws the AI's work away.
 *
 * Once the game ends, a host watching the stage (the TV that hosts, or a
 * seated host on /stage) gets one centred "Play again ▸" in the Continue slot,
 * after the podium beat; the corner dock stays hidden.
 *
 * Keys on the stage: Space or → skip (press twice), Enter continues a
 * host-clocked phase or plays again at the end; a held key never repeats. The docked placement shows
 * from the lg breakpoint only; narrower, the tab bar's ⋯ menu holds the host
 * controls. Sound lives in the rail (and M), for every stage, host or not.
 */
export function HostDock({ placement }: { placement: "stage" | "docked" }) {
  const { view, live } = useRoom();
  const { room, me, players } = view;
  const ui = useGameUi();
  const { skip, end, kick, playAgain, pending, error } = useHostActions();
  const endReady = useEndControlsReady();
  const canPlayAgain = useCanPlayAgain();
  // A new phase disarms any pending press.
  const { armed, press: pressTwice } = useTwoTap({ resetOn: room.phaseGeneration });
  const awake = useAwake();
  const cardShowing = useTitleCardShowing();
  const [playersOpen, setPlayersOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const dock = useRef<HTMLDivElement>(null);

  const playing = room.status === "PLAYING";
  const finished = room.status === "FINISHED";
  const hostClocked = isHostClocked(room);
  const stage = placement === "stage";
  // Docked, the controller column's finished bar carries "Play again".
  const show = live && me?.isHost === true && (playing || (finished && stage));
  const advance = ui.advanceLabel(view);
  const rematchReady = finished && stage && endReady && room.next === null;
  const rematchOpen = rematchReady && canPlayAgain === true && !pending;

  // Skip/continue from the keyboard, on the stage only: the docked view has a
  // controller beside it that needs the keys.
  useStageKey(show && placement === "stage", (event) => {
    if (event.key === "Enter" && rematchOpen) {
      event.preventDefault();
      void playAgain();
      return;
    }
    if (!playing) return;
    if (event.key === "Enter" && hostClocked) {
      event.preventDefault();
      if (!cardShowing) void skip();
    } else if (event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      pressTwice("skip", () => void skip());
    }
  });

  useEffect(() => {
    if (!playersOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (dock.current && !dock.current.contains(event.target as Node)) setPlayersOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlayersOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [playersOpen]);

  if (!show) return null;
  if (finished) {
    return (
      <PlayAgainSlot
        ready={rematchReady}
        canPlay={canPlayAgain}
        pending={pending}
        error={error}
        onPlay={() => void playAgain()}
      />
    );
  }

  const visible = awake || armed !== null || playersOpen || focused || !!error;
  const centredContinue = hostClocked && stage;
  const position = stage
    ? // The rail's empty middle on a TV; a narrower stage, whose rail is full, keeps the corner.
      "fixed bottom-[1.5rem] right-[1.5rem] flex-col items-end lg:bottom-auto lg:right-auto lg:left-1/2 lg:top-[0.5rem] lg:-translate-x-1/2 lg:flex-col-reverse lg:items-center"
    : // Below lg the docked view is a phone-sized tab layout; the ⋯ menu carries the host rows there.
      "fixed bottom-4 right-[calc(26rem+1rem)] flex-col items-end max-lg:hidden";

  return (
    <>
      {centredContinue && (
        // In the stage's flow under the scene, so it never covers the game.
        <div className="sticky bottom-0 z-40 flex min-h-[5rem] shrink-0 items-end justify-center pb-[1.5rem] pt-[0.5rem]">
          <AnimatePresence>
            {!cardShowing && (
              <motion.button
                key={room.phaseGeneration}
                type="button"
                disabled={pending}
                onClick={() => void skip()}
                aria-keyshortcuts="Enter"
                className="animate-continue-breathe relative isolate h-[3rem] cursor-pointer whitespace-nowrap rounded-full bg-punch px-[2.5rem] font-display text-[1.25rem] font-bold text-accent-ink shadow-lg transition-colors hover:bg-punch-hover disabled:opacity-60"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, transition: { ...SPRING.pop, delay: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
                {...press}
              >
                {advance} ▸
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
      <motion.div
        ref={dock}
        className={`${position} z-40 flex gap-[0.5rem]`}
        initial={false}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: stage ? -8 : 8 }}
        transition={{ duration: visible ? DUR.fast : DUR.slow, ease: EASE.out }}
        style={{ pointerEvents: visible ? "auto" : "none" }}
        // Keyboard focus keeps the dock up; a mouse click leaving focus on a button doesn't.
        onFocus={(event) => setFocused(event.target.matches(":focus-visible"))}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <AnimatePresence>
          {error && (
            <motion.p
              key="error"
              role="alert"
              className="max-w-[24rem] rounded-xl border border-fail/40 bg-fail-soft px-[0.875rem] py-[0.5rem] text-[0.875rem] font-medium text-fail"
              variants={pop}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {error}
            </motion.p>
          )}
          {playersOpen && (
            <motion.div
              key="players"
              className="max-h-[60svh] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-edge bg-surface p-[0.75rem] text-[0.875rem] shadow-2xl"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING.snappy }}
              exit={{ opacity: 0, y: 8, transition: { duration: DUR.fast, ease: EASE.in } }}
            >
              <PlayerList
                players={players}
                showScores
                hostPlayerId={room.hostPlayerId}
                kickOnHover
                onKick={(player) => void kick(player)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div
          role="toolbar"
          aria-label="Host controls"
          className="flex items-center gap-[0.25rem] rounded-full border border-edge bg-surface/90 p-[0.25rem] text-[0.875rem] font-semibold shadow-lg"
        >
          <>
            {hostClocked && !stage ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void skip()}
                className="flex h-[2.5rem] cursor-pointer items-center whitespace-nowrap rounded-full bg-punch px-[1.25rem] font-display font-bold text-accent-ink transition-colors hover:bg-punch-hover disabled:opacity-60"
              >
                {advance} ▸
              </button>
            ) : (
              !hostClocked && (
                <DockButton
                  label={armed === "skip" ? "Press again to skip" : advance}
                  armed={armed === "skip"}
                  onClick={() => pressTwice("skip", () => void skip())}
                >
                  <span className="flex items-center gap-[0.5rem] whitespace-nowrap">
                    <SkipIcon className="size-[1em]" />
                    {armed === "skip" ? "Press again to skip" : advance}
                  </span>
                </DockButton>
              )
            )}
            <DockButton
              label={`Players (${players.length})`}
              expanded={playersOpen}
              onClick={() => setPlayersOpen((open) => !open)}
            >
              <span className="flex items-center gap-[0.375rem]">
                <PeopleIcon className="size-[1.15em]" />
                <span className="font-mono">{players.length}</span>
              </span>
            </DockButton>
            <DockButton
              label={armed === "end" ? "Press again to end · scores so far stand" : "End game"}
              danger
              armed={armed === "end"}
              onClick={() => pressTwice("end", () => void end())}
            >
              {armed === "end" ? (
                <span className="whitespace-nowrap">Press again to end</span>
              ) : (
                <StopIcon className="size-[1em]" />
              )}
            </DockButton>
          </>
        </div>
      </motion.div>
    </>
  );
}

/**
 * The stage's end-of-game slot: one breathing "Play again ▸" at the bottom
 * centre, in the page flow so it never covers the podium. Enter presses it.
 * With no Free Play games left today it stays, disabled, saying so.
 */
function PlayAgainSlot({
  ready,
  canPlay,
  pending,
  error,
  onPlay,
}: {
  ready: boolean;
  canPlay: boolean | null;
  pending: boolean;
  error: string | null;
  onPlay: () => void;
}) {
  const spent = canPlay === false;
  return (
    <div className="sticky bottom-0 z-40 flex min-h-[5rem] shrink-0 flex-col items-center justify-end gap-[0.5rem] pb-[1.5rem] pt-[0.5rem]">
      <AnimatePresence>
        {ready && error && (
          <motion.p
            key="error"
            role="alert"
            className="max-w-[32rem] rounded-xl border border-fail/40 bg-fail-soft px-[0.875rem] py-[0.5rem] text-center text-[0.875rem] font-medium text-fail"
            variants={pop}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {error}
          </motion.p>
        )}
        {ready && (
          <motion.button
            key="play-again"
            type="button"
            disabled={pending || canPlay !== true}
            onClick={onPlay}
            aria-keyshortcuts="Enter"
            className={`relative isolate h-[3.5rem] whitespace-nowrap rounded-full px-[2.75rem] font-display text-[1.5rem] font-bold shadow-lg transition-colors ${
              spent
                ? "cursor-default border border-edge bg-raised text-ink-dim"
                : "animate-continue-breathe cursor-pointer bg-punch text-accent-ink hover:bg-punch-hover disabled:opacity-60"
            }`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1, transition: SPRING.pop }}
            exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
            {...(spent ? {} : press)}
          >
            {spent ? NO_FREE_GAMES : pending ? "Setting up…" : "Play again ▸"}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
