"use client";

import {
  CountdownDigits,
  TONE_CLASSES,
  countdownTone,
  usePhaseCountdown,
  usePhaseDrain,
} from "./timer";
import { useGameUi } from "./game-ui-context";
import { Avatar } from "./avatar";
import { useRoom } from "./context";
import { MenuButton } from "./menu-sheet";

/** The seconds left as a pill, in the countdown's colour; "Time!" at zero. */
export function CountdownPill({ className = "" }: { className?: string }) {
  const countdown = usePhaseCountdown();
  if (countdown.untimed) return null;
  return (
    <span
      role="timer"
      aria-label={countdown.expired ? "Time is up" : `${countdown.remaining} seconds remaining`}
      className={`flex h-8 min-w-[3.5rem] items-center justify-center rounded-full bg-raised px-3 text-[17px] ${className}`}
    >
      <CountdownDigits countdown={countdown} />
    </span>
  );
}

/** A 3px line under the phone bar that drains with the phase clock. */
function TimeLine() {
  const countdown = usePhaseCountdown();
  const line = usePhaseDrain<HTMLDivElement>("bar");
  if (countdown.untimed) return null;
  const tone = TONE_CLASSES[countdownTone(countdown.remaining)];
  return (
    <div aria-hidden="true" className="h-[3px] w-full bg-edge/50">
      <div
        ref={line}
        className={`h-full w-full origin-left transition-colors duration-500 ${tone.bg}`}
        style={{ transform: `scaleX(${countdown.pct / 100})` }}
      />
    </div>
  );
}

/**
 * A player's phone header: who you are on the left; the countdown and the ⋯
 * menu on the right; a draining time line underneath. No game name, room
 * code or phase label: the screen below already says what to do. In the
 * lobby the hero already shows who you are, so only the ⋯ floats in the
 * corner and the bar takes no space; the same goes for a view whose game
 * hides the bar (`GameUi.chrome`).
 */
export function PhoneBar() {
  const { view } = useRoom();
  const { room, me, players } = view;
  const player = players.find((candidate) => candidate.id === me?.playerId);
  const lobby = room.status === "LOBBY";
  const playing = room.status === "PLAYING";
  const hidden = useGameUi().chrome?.(view).phoneBar === false;

  if (lobby || hidden) {
    return (
      <div className="pointer-events-none absolute right-1 top-[max(0.25rem,env(safe-area-inset-top))] z-30">
        <MenuButton className="pointer-events-auto" />
      </div>
    );
  }

  return (
    <header data-keyboard-cover className="sticky top-0 z-30 bg-canvas/95 pt-[env(safe-area-inset-top)]">
      <div className="flex h-12 items-center gap-2 pl-3 pr-1">
        {me?.name && (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={me.name} modelId={player?.modelId ?? null} size="28px" />
            <span className="max-w-[55vw] truncate text-[15px] font-semibold text-ink">
              {me.name}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {playing && <CountdownPill />}
          <MenuButton />
        </div>
      </div>
      {playing ? <TimeLine /> : <div aria-hidden="true" className="h-px bg-edge/50" />}
    </header>
  );
}
