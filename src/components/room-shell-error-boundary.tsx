"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import {
  clearConvexRoomSessionCapability,
  type RoomSessionStorage,
} from "@/lib/convex-room-session";
import { getConvexErrorMessage } from "@/lib/convex-errors";

interface RoomShellErrorBoundaryProps {
  capability: string | null;
  children: ReactNode;
  roomCode: string;
}

interface RoomShellErrorBoundaryState {
  error: Error | null;
}

export interface RoomShellErrorPresentation {
  detail: string | null;
  message: string;
  title: string;
}

const EXPIRED_CAPABILITY_PATTERN =
  /invalid or expired room capability|host capability required|player capability required/iu;

export function getRoomShellErrorPresentation(error: unknown): RoomShellErrorPresentation {
  const detail = getConvexErrorMessage(error, "The room could not be loaded");
  if (EXPIRED_CAPABILITY_PATTERN.test(detail)) {
    return {
      detail: null,
      message: "You may have been removed from the room, or the room session has expired.",
      title: "Room access ended",
    };
  }

  return {
    detail,
    message: "The live room connection failed. You can retry without leaving this page.",
    title: "Room connection failed",
  };
}

export function clearRoomShellCapability(
  roomCode: string,
  capability: string | null,
  storage?: RoomSessionStorage,
): boolean {
  return capability === null
    ? false
    : clearConvexRoomSessionCapability(roomCode, capability, storage);
}

export class RoomShellErrorBoundary extends Component<
  RoomShellErrorBoundaryProps,
  RoomShellErrorBoundaryState
> {
  state: RoomShellErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RoomShellErrorBoundaryState {
    return { error };
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  private forgetSession = (): void => {
    clearRoomShellCapability(this.props.roomCode, this.props.capability);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const presentation = getRoomShellErrorPresentation(error);
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-edge bg-surface p-6 text-center shadow-sm">
          <h1 className="font-display text-2xl font-bold text-ink">{presentation.title}</h1>
          <p className="mt-3 text-sm text-ink-dim">{presentation.message}</p>
          {presentation.detail ? (
            <p className="mt-3 rounded-xl bg-raised px-3 py-2 text-xs text-fail">
              {presentation.detail}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.retry}
              className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-ink hover:border-edge-strong"
            >
              Retry
            </button>
            <Link
              href="/join"
              onClick={this.forgetSession}
              className="rounded-xl bg-punch px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-punch-hover"
            >
              Join a room
            </Link>
          </div>
        </div>
      </main>
    );
  }
}
