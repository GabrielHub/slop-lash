"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import { ShareIcon } from "@/components/icons";
import { recapShareData, shareStatusLabel, useShareLink } from "./share-link";
import { gameUi } from "@/games/ui-registry";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { enter, press } from "@/lib/animations";
import { useRoom } from "./context";
import { hostName, useHostActions } from "./host-actions";
import { useMoment } from "./moment";
import { clearRoomSession, saveRoomSession } from "./session";

/** The end-of-game controls wait for the podium beat, so the winner lands first. */
export const END_CONTROLS_AT_MS = 4_000;

const PRIMARY =
  "flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-punch font-display text-lg font-bold text-accent-ink transition-colors hover:bg-punch-hover disabled:cursor-default disabled:opacity-60";
const MUTED =
  "flex h-14 w-full items-center justify-center rounded-2xl border border-edge bg-raised font-display text-lg font-bold text-ink-dim";
const SECONDARY =
  "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-ink-dim transition-colors hover:text-ink";

/**
 * True once a finished game's controls may show: about 4s after the end on a
 * live screen, at once on a reload or a late open. False before the end.
 */
export function useEndControlsReady(): boolean {
  const { view } = useRoom();
  const finished = view.room.status === "FINISHED";
  const beat = useMoment([{ at: END_CONTROLS_AT_MS }], { when: finished });
  return finished && beat >= 1;
}

/**
 * Whether this host can start another game: a Free Play room needs a free game
 * left today. Null while unknown (and for rooms with a password, always true).
 */
export function useCanPlayAgain(): boolean | null {
  const { view } = useRoom();
  const { room, me } = view;
  const check = room.freePlay && me?.isHost === true && room.status === "FINISHED";
  const status = useQuery(api.freePlay.status, check ? {} : "skip");
  if (!check) return true;
  if (status === undefined) return null;
  return status.configured && status.gamesLeftToday > 0;
}

/** The disabled "Play again" text when Free Play has nothing left today. */
export const NO_FREE_GAMES = "No free games left today";

/**
 * A phone's bar once the game ends, after the podium beat.
 * - The host: "Play again" (same code, same players, fresh lobby) and Share.
 * - Everyone else still in the room: Share, and Done to step out of the rematch.
 * - A seat left behind by a rematch: one tap back in, while it is still a lobby.
 */
export function PhoneFinishedBar({ className = "" }: { className?: string }) {
  const ready = useEndControlsReady();
  return (
    <AnimatePresence>
      {ready && (
        <motion.div
          key="finished-bar"
          variants={enter}
          initial="hidden"
          animate="visible"
          className={`sticky bottom-0 z-20 border-t border-edge bg-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 ${className}`}
        >
          <FinishedBarBody />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FinishedBarBody() {
  const { view } = useRoom();
  const { room, me } = view;
  if (room.next) return <LeftBehind next={room.next} />;
  if (me?.isHost) return <HostBar />;
  return <GuestBar />;
}

function useShareResults() {
  const { room } = useRoom().view;
  const ui = gameUi(room.gameType);
  const results = useShareLink();
  return {
    share: () => void results.share(() => recapShareData(room.code, ui.name, room.gameNumber)),
    label: shareStatusLabel(results.status, "Share results"),
  };
}

function ShareSecondary() {
  const { share, label } = useShareResults();
  return (
    <button type="button" onClick={share} className={SECONDARY} aria-live="polite">
      <ShareIcon />
      {label}
    </button>
  );
}

function SharePrimary() {
  const { share, label } = useShareResults();
  return (
    <motion.button type="button" onClick={share} className={PRIMARY} {...press}>
      <ShareIcon className="size-5" />
      <span aria-live="polite">{label}</span>
    </motion.button>
  );
}

/** The quieter controls under a bar's primary button. */
function SecondaryRow({ children }: { children: ReactNode }) {
  return <div className="mt-1 flex justify-center gap-2">{children}</div>;
}

function HostBar() {
  const { room } = useRoom().view;
  const { playAgain, pending, error } = useHostActions();
  const canPlay = useCanPlayAgain();

  return (
    <>
      <ErrorBanner error={error} className="mb-3" />
      {canPlay === false ? (
        <>
          <p className={MUTED}>{NO_FREE_GAMES}</p>
          <SecondaryRow>
            <Link href={`/host?game=${room.gameType}`} className={SECONDARY}>
              Use host password
            </Link>
            <ShareSecondary />
          </SecondaryRow>
        </>
      ) : (
        <>
          <motion.button
            type="button"
            disabled={pending || canPlay === null}
            onClick={() => void playAgain()}
            className={PRIMARY}
            {...press}
          >
            {pending ? "Setting up…" : "Play again"}
          </motion.button>
          <SecondaryRow>
            <ShareSecondary />
          </SecondaryRow>
        </>
      )}
    </>
  );
}

/**
 * "Done": step out of the room for good, so a "Play again" doesn't bring this
 * seat along. The seat is released once this screen has gone (home is where
 * it goes either way), so the room never flashes "You're out of this room".
 */
function useDone() {
  const { view, run } = useRoom();
  const code = view.room.code;
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  useEffect(() => {
    router.prefetch("/");
  }, [router]);
  useEffect(
    () => () => {
      if (!leavingRef.current) return;
      void run(api.rooms.leave, {})
        .catch(() => {})
        .finally(() => clearRoomSession(code));
    },
    [run, code],
  );
  const done = () => {
    leavingRef.current = true;
    setLeaving(true);
    router.push("/");
  };
  return { done, leaving };
}

function DoneButton() {
  const { done, leaving } = useDone();
  return (
    <SecondaryRow>
      <button type="button" disabled={leaving} onClick={done} className={SECONDARY}>
        Done
      </button>
    </SecondaryRow>
  );
}

function GuestBar() {
  const { view } = useRoom();
  const host = hostName(view);

  return (
    <>
      <div className="mb-3 flex justify-center text-sm">
        <PulsingDot>Play again is {host ? `${host}'s` : "the host's"} call</PulsingDot>
      </div>
      <SharePrimary />
      <DoneButton />
    </>
  );
}

/** This seat stayed on the finished game while the room moved on to another. */
function LeftBehind({ next }: { next: { gameNumber: number; status: string } }) {
  const { view } = useRoom();
  const { room, me } = view;
  const join = useAction(api.rooms.join);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = next.status === "LOBBY";

  const hopIn = async () => {
    if (!me?.name) return;
    setPending(true);
    setError(null);
    try {
      const session = await join({ roomCode: room.code, name: me.name });
      // The gate re-keys on the new capability and opens the new lobby.
      saveRoomSession(session);
    } catch (cause) {
      setError(getConvexErrorMessage(cause, "Couldn't join the next game"));
      setPending(false);
    }
  };

  if (!open || !me?.name) {
    return (
      <>
        <p className="mb-3 text-center text-sm font-medium text-ink-dim">
          The next game already started
        </p>
        <SharePrimary />
        <DoneButton />
      </>
    );
  }

  return (
    <>
      <ErrorBanner error={error} className="mb-3" />
      {error && (
        <div className="-mt-1 mb-2 flex justify-center">
          <Link href={`/join/${room.code}`} className={SECONDARY}>
            Join with another name
          </Link>
        </div>
      )}
      <motion.button
        type="button"
        disabled={pending}
        onClick={() => void hopIn()}
        className={PRIMARY}
        {...press}
      >
        {pending ? "Joining…" : "Join the rematch"}
      </motion.button>
      <SecondaryRow>
        <ShareSecondary />
      </SecondaryRow>
    </>
  );
}
