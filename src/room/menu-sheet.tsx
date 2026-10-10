"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SpeakerIcon, toggleSound, useAudioState } from "@/components/audio-controls";
import { ErrorBanner } from "@/components/error-banner";
import { useHydrated } from "@/hooks/use-hydrated";
import { PlayerList } from "./player-list";
import {
  LeaveIcon,
  MoonIcon,
  PeopleIcon,
  ShareIcon,
  SkipIcon,
  StopIcon,
  StrokeIcon,
  TrophyIcon,
} from "@/components/icons";
import { inviteShareData, shareStatusLabel, useShareLink } from "./share-link";
import { useTheme } from "@/components/theme-provider";
import { gameUi } from "@/games/ui-registry";
import { DUR, EASE, SPRING, collapse } from "@/lib/animations";
import { useRoom } from "./context";
import { useHostActions, useTwoTap } from "./host-actions";
import { clearRoomSession, recapPath } from "./session";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A bottom sheet for phones: slides up over a dimmed backdrop, traps focus,
 * and closes on Escape or a backdrop tap, handing focus back to whatever
 * opened it.
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);
  // Portals only exist on the client; hydrate as nothing, then mount.
  const mounted = useHydrated();
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-canvas/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.fast } }}
            exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="relative max-h-[85svh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-b-0 border-edge bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none"
            initial={{ y: "100%" }}
            animate={{ y: 0, transition: SPRING.smooth }}
            exit={{ y: "100%", transition: { duration: DUR.fast, ease: EASE.in } }}
          >
            <div className="flex justify-center pb-1 pt-2.5" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-edge-strong" />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const ROW =
  "flex h-14 w-full cursor-pointer items-center gap-3 px-5 text-left text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
/** Row colours: plain, destructive, or armed (waiting for the second tap). */
const ROW_TONE = {
  plain: "text-ink hover:bg-raised",
  danger: "text-fail hover:bg-fail-soft",
  armed: "bg-fail text-accent-ink",
} as const;
/** The sheet's row styles, for a game's `HostExtras`. */
export const MENU_ROW = ROW;
export const MENU_ROW_TONE = ROW_TONE;

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative ml-auto h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-punch" : "bg-edge-strong"}`}
    >
      <span
        className={`absolute top-0.5 size-6 rounded-full bg-surface shadow transition-transform ${
          on ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

/** Rows every seat gets: sound, theme, and the room invite. */
function SettingsRows() {
  const { view } = useRoom();
  const { muted, volume } = useAudioState();
  const { theme, toggle } = useTheme();
  const invite = useShareLink();
  const code = view.room.code;
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={!muted}
        onClick={() => void toggleSound()}
        className={`${ROW} ${ROW_TONE.plain}`}
      >
        <SpeakerIcon muted={muted} volume={volume} className="size-5 text-ink-dim" />
        Sound
        <Switch on={!muted} />
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={theme === "dark"}
        onClick={toggle}
        className={`${ROW} ${ROW_TONE.plain}`}
      >
        <span className="text-ink-dim">
          <MoonIcon className="size-5" />
        </span>
        Dark mode
        <Switch on={theme === "dark"} />
      </button>
      <button
        type="button"
        onClick={() => void invite.share(() => inviteShareData(code))}
        disabled={invite.status === "sharing"}
        className={`${ROW} ${ROW_TONE.plain}`}
      >
        <ShareIcon className="size-5 text-ink-dim" />
        <span aria-live="polite">
          {invite.status === "idle" ? (
            <>
              Room <span className="font-mono tracking-widest text-gold-ink">{code}</span>
              <span className="text-ink-dim"> · Invite</span>
            </>
          ) : (
            shareStatusLabel(invite.status, "Invite")
          )}
        </span>
      </button>
      {view.room.gameNumber > 1 && (
        <Link
          href={recapPath(code, view.room.gameNumber - 1)}
          className={`${ROW} ${ROW_TONE.plain}`}
        >
          <TrophyIcon className="size-5 text-ink-dim" />
          Last game&apos;s results
        </Link>
      )}
    </>
  );
}

/**
 * The host's rows: skip ahead, the game's own extras, manage players, end the
 * game. Every destructive one takes two taps.
 */
function HostRows({ onDone }: { onDone: () => void }) {
  const { view } = useRoom();
  const { room, players } = view;
  const ui = gameUi(room.gameType);
  const { skip, end, kick, pending, error } = useHostActions();
  // The sheet stays open across phases: a first tap must not carry into the next phase.
  const { armed, press } = useTwoTap({ resetOn: room.phaseGeneration });
  const [showPlayers, setShowPlayers] = useState(false);
  const playing = room.status === "PLAYING";
  const Extras = ui.HostExtras;

  return (
    <>
      <p className="px-5 pb-1 pt-4 text-xs font-bold uppercase tracking-[0.2em] text-ink-dim">
        Host
      </p>
      <div className="px-5">
        <ErrorBanner error={error} className="mb-2" />
      </div>
      {playing && (
        <button
          type="button"
          disabled={pending}
          onClick={() => press("skip", () => void skip().then((ok) => ok && onDone()))}
          className={`${ROW} ${armed === "skip" ? ROW_TONE.armed : ROW_TONE.plain}`}
        >
          <SkipIcon />
          {armed === "skip" ? "Tap again to skip" : ui.advanceLabel(view)}
        </button>
      )}
      {Extras && <Extras onDone={onDone} />}
      <button
        type="button"
        aria-expanded={showPlayers}
        onClick={() => setShowPlayers((open) => !open)}
        className={`${ROW} ${ROW_TONE.plain}`}
      >
        <PeopleIcon />
        Players
        <span className="ml-auto font-mono text-sm text-ink-dim">{players.length}</span>
        <Chevron open={showPlayers} />
      </button>
      <AnimatePresence initial={false}>
        {showPlayers && (
          <motion.div
            variants={collapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              <PlayerList
                players={players}
                showScores={playing}
                hostPlayerId={room.hostPlayerId}
                onKick={(player) => void kick(player)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {playing && (
        <button
          type="button"
          disabled={pending}
          onClick={() => press("end", () => void end().then((ok) => ok && onDone()))}
          className={`${ROW} ${armed === "end" ? ROW_TONE.armed : ROW_TONE.danger}`}
        >
          <StopIcon />
          {armed === "end" ? "Tap again to end · scores stand" : "End game"}
        </button>
      )}
    </>
  );
}

/**
 * A quiet way out for a player (say, one who joined the wrong room): two taps,
 * then this browser forgets the seat and goes home. The seat stays in the room
 * as away until the host removes it.
 */
function LeaveRow() {
  const { view } = useRoom();
  const { armed, press } = useTwoTap();
  const code = view.room.code;
  return (
    <button
      type="button"
      onClick={() =>
        press("leave", () => {
          clearRoomSession(code);
          // A full load, so the room's subscriptions close and nothing redirects back to the room.
          window.location.assign("/");
        })
      }
      className={`${ROW} mt-2 border-t border-edge ${armed === "leave" ? ROW_TONE.armed : "text-ink-dim hover:bg-raised hover:text-ink"}`}
    >
      <LeaveIcon />
      {armed === "leave" ? "Tap again to leave" : "Leave room"}
    </button>
  );
}

/**
 * The phone's ⋯ menu: sound, theme, the room invite, for the host a "Host"
 * section, and for everyone else a way to leave. `hostRows={false}` leaves the
 * host section out (the docked view has the host dock instead).
 */
export function MenuSheet({
  open,
  onClose,
  hostRows = true,
}: {
  open: boolean;
  onClose: () => void;
  hostRows?: boolean;
}) {
  const { view } = useRoom();
  const { me, room } = view;
  const active = room.status !== "FINISHED";
  const isHost = me?.isHost === true && active;
  const canLeave = me?.playerId != null && me.isHost !== true && active;
  return (
    <Sheet open={open} onClose={onClose} label="Room menu">
      <SettingsRows />
      {hostRows && isHost && <HostRows onDone={onClose} />}
      {canLeave && <LeaveRow />}
    </Sheet>
  );
}

/** The ⋯ button that opens the menu sheet. */
export function MenuButton({
  hostRows = true,
  className = "",
}: {
  hostRows?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink-dim transition-colors hover:bg-raised hover:text-ink ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      <MenuSheet open={open} onClose={() => setOpen(false)} hostRows={hostRows} />
    </>
  );
}

export function Chevron({ open, className = "size-4" }: { open: boolean; className?: string }) {
  return (
    <StrokeIcon
      strokeWidth={2.5}
      className={`${className} text-ink-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </StrokeIcon>
  );
}
