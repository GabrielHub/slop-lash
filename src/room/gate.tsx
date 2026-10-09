"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { RoomProvider } from "./context";
import { clearRoomSession, useStoredRoomSession } from "./session";

export function RoomSpinner() {
  return (
    <main className="min-h-svh flex items-center justify-center px-6">
      <div className="w-8 h-8 rounded-full border-2 border-edge border-t-teal animate-spin" />
    </main>
  );
}

export function RoomMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-svh flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface p-6 text-center shadow-sm">
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}

const SEAT_LOST = /invalid or expired room capability|removed from this room/iu;

class RoomErrorBoundary extends Component<
  { roomCode: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { roomCode } = this.props;
    const detail = getConvexErrorMessage(error, "The room could not be loaded");
    if (SEAT_LOST.test(detail)) {
      return (
        <RoomMessage title="You're out of this room">
          <p className="mt-3 text-sm text-ink-dim">
            {/removed/iu.test(detail)
              ? "The host removed you from this game."
              : "This seat was taken back on another device, or the room has closed."}
          </p>
          <Link
            href={`/join/${roomCode}`}
            onClick={() => clearRoomSession(roomCode)}
            className="mt-6 inline-block rounded-xl bg-punch px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-punch-hover"
          >
            Rejoin with your name
          </Link>
        </RoomMessage>
      );
    }
    return (
      <RoomMessage title="Lost the room">
        <p className="mt-3 rounded-xl bg-raised px-3 py-2 text-xs text-fail">{detail}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-6 rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-ink hover:border-edge-strong"
        >
          Try again
        </button>
      </RoomMessage>
    );
  }
}

/**
 * Provides the live room through the seat this browser stored when it joined.
 * Without one, `allowSpectator` screens watch the room and others send the
 * visitor to join (which reclaims their seat if they use the same name).
 */
export function RoomGate({
  code,
  allowSpectator,
  children,
}: {
  code: string;
  allowSpectator: boolean;
  children: ReactNode;
}) {
  const roomCode = code.trim().toUpperCase();
  const stored = useStoredRoomSession(roomCode);
  if (stored === undefined) return <RoomSpinner />;
  if (!stored && !allowSpectator) {
    return (
      <RoomMessage title="Join this room first">
        <p className="mt-3 text-sm text-ink-dim">
          Lost your seat? Join again with the same name to pick up where you left off.
        </p>
        <Link
          href={`/join/${roomCode}`}
          className="mt-6 inline-block rounded-xl bg-punch px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-punch-hover"
        >
          Join {roomCode}
        </Link>
      </RoomMessage>
    );
  }
  return (
    <RoomErrorBoundary key={stored?.capability ?? "spectator"} roomCode={roomCode}>
      <RoomProvider
        roomCode={roomCode}
        capability={stored?.capability ?? null}
        fallback={<RoomSpinner />}
      >
        {children}
      </RoomProvider>
    </RoomErrorBoundary>
  );
}
