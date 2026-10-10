"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useRoom, useRoomAction, type RoomPlayer } from "./context";

/** How long a first tap stays armed before it quietly resets. */
export const TWO_TAP_MS = 3_000;

/**
 * Two-tap confirm for anything that can't be undone (skip, end, remove): the
 * first press arms one key, a second press of the same key within
 * `timeoutMs` commits. Replaces `window.confirm`, which a TV can't answer.
 * A change in `resetOn` (pass the room's phase generation) disarms a pending
 * first press, so it never carries into the next phase.
 */
export function useTwoTap({
  resetOn,
  timeoutMs = TWO_TAP_MS,
}: { resetOn?: unknown; timeoutMs?: number } = {}) {
  // Each armed key remembers the `resetOn` it was armed under; a newer one reads as unarmed.
  const [state, setState] = useState<{ key: string | null; epoch: unknown }>({
    key: null,
    epoch: resetOn,
  });
  const armedRef = useRef(state);
  const timer = useRef<number | undefined>(undefined);

  const set = useCallback(
    (key: string | null) => {
      armedRef.current = { key, epoch: resetOn };
      setState(armedRef.current);
    },
    [resetOn],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const press = useCallback(
    (key: string, commit: () => void) => {
      window.clearTimeout(timer.current);
      const current = armedRef.current;
      if (current.key === key && Object.is(current.epoch, resetOn)) {
        set(null);
        commit();
        return;
      }
      set(key);
      timer.current = window.setTimeout(() => set(null), timeoutMs);
    },
    [set, resetOn, timeoutMs],
  );

  const armed = Object.is(state.epoch, resetOn) ? state.key : null;
  return { armed, press };
}

/**
 * True while the room waits for the host to move it on: a phase with no clock
 * in a "no timers" room. A phase whose deadline is hidden (MatchSlop waiting
 * on the AI) also has no clock, but skipping it throws the AI's work away, so
 * it is not host-clocked and keeps the two-tap skip.
 */
export function isHostClocked(room: {
  status: string;
  phaseDeadline: number | null;
  timersDisabled: boolean;
  awaitingAi: boolean;
}) {
  return (
    room.status === "PLAYING" &&
    room.phaseDeadline === null &&
    room.timersDisabled &&
    !room.awaitingAi
  );
}

/** The host's room actions, each resolving to whether it went through. */
export function useHostActions() {
  const { view } = useRoom();
  const { act, pending, error } = useRoomAction();
  const { phaseGeneration, id: gameId } = view.room;
  const skip = useCallback(
    () => act(api.engine.advanceByHost, { expectedPhaseGeneration: phaseGeneration }),
    [act, phaseGeneration],
  );
  const end = useCallback(() => act(api.engine.end, {}), [act]);
  const start = useCallback(() => act(api.engine.start, {}), [act]);
  const kick = useCallback(
    (player: RoomPlayer) => act(api.rooms.kick, { playerId: player.id }),
    [act],
  );
  /** Same code, fresh lobby, same players and settings; phones follow on their own. */
  const playAgain = useCallback(() => act(api.rooms.playAgain, { gameId }), [act, gameId]);
  return { skip, end, start, kick, playAgain, pending, error };
}

/** The host seat's display name, or null for a display-only host. */
export function hostName(view: { room: { hostPlayerId: string | null }; players: RoomPlayer[] }) {
  const { hostPlayerId } = view.room;
  return view.players.find((player) => player.id === hostPlayerId)?.name ?? null;
}
