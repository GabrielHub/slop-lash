"use client";

// The lobby's room logic, run in the DOM tree around the canvas (the shell's
// lobby hooks use DOM-only APIs and the host keyboard), shared with the
// in-canvas lobby scene through a context (R3F bridges context into the
// canvas). It plays the join/leave sounds, and on the host's stage Enter or
// Space presses the scene's START button. No three.js here: ui/stage.tsx
// imports it eagerly.

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRoom } from "@/room/context";
import { useStageKey } from "@/room/host-dock";
import { useLobby, usePlayerSounds } from "@/room/lobby";

export interface LobbyStage {
  code: string;
  joinUrl: string;
  siteHost: string;
  players: ReturnType<typeof useLobby>["players"];
  minPlayers: number;
  maxPlayers: number;
  needed: number;
  isHost: boolean;
  canStart: boolean;
  pending: boolean;
  error: string | null;
  /** Press START (the host, with enough players). */
  press: () => void;
  /** Bumped on every press (the button animates its push). */
  presses: number;
}

const LobbyContext = createContext<LobbyStage | null>(null);

/** The lobby state for the in-canvas scene (null outside the bridge). */
export function useLobbyStage(): LobbyStage | null {
  return useContext(LobbyContext);
}

function errorText(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Could not start";
}

/**
 * Wrap the stage canvas: provides the lobby state while the room is in its
 * lobby. The element tree around `children` never changes shape (one
 * Provider, children always its last child), so leaving or re-entering the
 * lobby never remounts the persistent canvas below it; only the hook-holding
 * LobbyDriver mounts and unmounts.
 */
export function LobbyBridge({ children }: { children: ReactNode }) {
  const lobbyRoom = useRoom().view.room.status === "LOBBY";
  const [stage, setStage] = useState<LobbyStage | null>(null);
  return (
    <LobbyContext.Provider value={lobbyRoom ? stage : null}>
      {lobbyRoom ? <LobbyDriver onChange={setStage} /> : null}
      {children}
    </LobbyContext.Provider>
  );
}

/**
 * Runs the shell's lobby hooks and publishes their state up to the bridge.
 * Renders nothing. The published value changes only when a field does
 * (`press` is stable), so publishing it never loops back through the bridge.
 */
const LobbyDriver = memo(function LobbyDriver({ onChange }: { onChange: (stage: LobbyStage | null) => void }) {
  const lobby = useLobby();
  usePlayerSounds(lobby.players);
  const [presses, setPresses] = useState(0);
  // useLobby's `start` is a new function every render: press reads the latest through a ref.
  const latest = useRef({ canStart: lobby.canStart, start: lobby.start });
  useEffect(() => {
    latest.current = { canStart: lobby.canStart, start: lobby.start };
  });
  const press = useCallback(() => {
    setPresses((count) => count + 1);
    const { canStart, start } = latest.current;
    if (canStart) void start();
  }, []);
  useStageKey(lobby.isHost, (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    press();
  });
  const value = useMemo<LobbyStage>(
    () => ({
      code: lobby.code,
      joinUrl: lobby.joinUrl,
      siteHost: lobby.siteHost,
      players: lobby.players,
      minPlayers: lobby.minPlayers,
      maxPlayers: lobby.maxPlayers,
      needed: lobby.needed,
      isHost: lobby.isHost,
      canStart: lobby.canStart,
      pending: lobby.pending,
      error: errorText(lobby.error),
      press,
      presses,
    }),
    [lobby.code, lobby.joinUrl, lobby.siteHost, lobby.players, lobby.minPlayers, lobby.maxPlayers, lobby.needed, lobby.isHost, lobby.canStart, lobby.pending, lobby.error, press, presses],
  );
  useEffect(() => {
    onChange(value);
  }, [onChange, value]);
  useEffect(() => () => onChange(null), [onChange]);
  return null;
});
