"use client";

import { api } from "../../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { useModeView, useRoom, useRoomAction } from "@/room/context";
import { ControllerLobby } from "@/room/lobby";
import { MENU_ROW, MENU_ROW_TONE } from "@/room/menu-sheet";
import { CountdownPill } from "@/room/phone-bar";
import { BuildScreen, UpgradeScreen } from "./build";
import { MyChampionButton } from "./champion-card";
import { FaceOffScreen, FightScreen, ResultScreen } from "./fight";
import { FinishedScreen, FoundryScreen, RosterScreen, StandingsScreen } from "./screens";
import { Kicker, useMine } from "./shared";

// The SlopFight phone: one thing per screen. The shell's phone bar is hidden
// for SlopFight (the TV is one canvas), so this header carries the phase
// countdown and the "My champion" chip; the ⋯ menu floats top right.

function PhaseScreen() {
  const { room } = useRoom().view;
  if (room.status === "FINISHED") return <FinishedScreen />;
  switch (room.phase) {
    case "BUILD":
      return <BuildScreen />;
    case "FOUNDRY":
      return <FoundryScreen />;
    case "ROSTER":
      return <RosterScreen />;
    case "FACE_OFF":
      return <FaceOffScreen />;
    case "FIGHT":
      return <FightScreen />;
    case "RESULT":
      return <ResultScreen />;
    case "STANDINGS":
      return <StandingsScreen />;
    case "UPGRADE":
      return <UpgradeScreen />;
    default:
      return null;
  }
}

/** The compact header: my champion (once it exists), and the clock when the phase has one. */
function PhoneHeader() {
  const { view } = useRoom();
  const { champion, fighter } = useMine();
  const { room } = view;
  // During Build the champion is the thing being made; the chip appears once it exists.
  const showChip = champion !== null && !(room.phase === "BUILD" && fighter?.status !== "READY");
  return (
    <header data-keyboard-cover className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-canvas/95 pl-3 pr-14 pt-[env(safe-area-inset-top)]">
      {showChip ? <MyChampionButton champion={champion} /> : <Kicker tone="dim">SlopFight</Kicker>}
      <div className="ml-auto flex items-center">{room.status === "PLAYING" && <CountdownPill />}</div>
    </header>
  );
}

export function SlopfightController() {
  const { view } = useRoom();
  if (view.room.status === "LOBBY") return <ControllerLobby />;
  return (
    <main className="flex flex-1 flex-col">
      <PhoneHeader />
      <PhaseScreen />
    </main>
  );
}

/** The phone lobby's SlopFight extra: what tonight is about, in three beats. */
export function SlopfightLobbyExtra() {
  const steps = [
    ["Make", "Draw or describe a champion. The AI forges it on the TV."],
    ["Bet", "Pick a winner every fight. Champions fight on their own."],
    ["Upgrade", "Add one thing between rounds. Win the trophy."],
  ] as const;
  return (
    <ol className="flex flex-col gap-2">
      {steps.map(([title, text], index) => (
        <li key={title} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-punch font-display text-base font-black text-accent-ink">
            {index + 1}
          </span>
          <span>
            <span className="block font-display text-lg font-bold text-ink">{title}</span>
            <span className="block text-[15px] leading-snug text-ink-dim">{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The host's forge retry in the ⋯ sheet: only in the Foundry, when a forge
 * failed on both models (`retryForges` is a no-op outside the Foundry).
 */
export function SlopfightHostExtras({ onDone }: { onDone: () => void }) {
  const { view } = useRoom();
  const mode = useModeView("SLOPFIGHT");
  const { act, pending, error } = useRoomAction();
  const stuck = mode.foundryParked || mode.fighters.some((fighter) => fighter.status === "FAILED");
  if (view.room.status !== "PLAYING" || view.room.phase !== "FOUNDRY" || !stuck) return null;
  return (
    <>
      {error && (
        <div className="px-5">
          <ErrorBanner error={error} className="mb-2" />
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => void act(api.slopfight.play.retryForges, {}).then((ok) => ok && onDone())}
        className={`${MENU_ROW} ${MENU_ROW_TONE.plain}`}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        {pending ? "Retrying…" : "Retry the Foundry"}
      </button>
    </>
  );
}
