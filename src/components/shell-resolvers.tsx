"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import type { GameType } from "@/games/core/types";
import { GameShell } from "@/components/game-shell";
import { ControllerShell } from "@/components/controller-shell";
import { ChatGameShell } from "@/games/ai-chat-showdown/ui/chat-game-shell";
import { ChatControllerShell } from "@/games/ai-chat-showdown/ui/chat-controller-shell";
import { MatchSlopGameShell } from "@/games/matchslop/ui/matchslop-game-shell";
import { MatchSlopControllerShell } from "@/games/matchslop/ui/matchslop-controller-shell";
import { RoomShellErrorBoundary } from "@/components/room-shell-error-boundary";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { persistRoomSessionResult } from "@/lib/convex-room-client";
import { api } from "../../convex/_generated/api";

const subscribeToNothing = () => () => {};

// The stored room session reads as null until hydration, which is indistinguishable
// from "no session" on the server. Without this, every normal room load paints the
// "open this from the host or join screen" error for a frame before the game appears.
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function useResolvedRoomGameType(code: string, requestedGameType?: GameType) {
  const roomSession = useConvexRoomSession(code);
  const hydrated = useHydrated();
  const searchParams = useSearchParams();
  const capability = searchParams.get("capability");
  const rejoinRoom = useMutation(api.rooms.rejoin);
  const attemptedKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const capabilityMatches =
    capability === null ||
    roomSession?.hostCapability === capability ||
    roomSession?.playerCapability === capability;
  const needsCapabilityBootstrap = capability !== null && !capabilityMatches;

  useEffect(() => {
    if (!capability || capabilityMatches) return;
    const attemptKey = `${code}:${capability}`;
    if (attemptedKeyRef.current === attemptKey) return;
    attemptedKeyRef.current = attemptKey;
    setError(null);

    void rejoinRoom({ capability, roomCode: code })
      .then((result) => {
        persistRoomSessionResult(result);
        const url = new URL(window.location.href);
        url.searchParams.delete("capability");
        window.history.replaceState(window.history.state, "", url);
      })
      .catch((cause: unknown) => {
        setError(getConvexErrorMessage(cause, "This room link is invalid or expired"));
      });
  }, [capability, capabilityMatches, code, rejoinRoom]);

  useEffect(() => {
    if (!capability || !capabilityMatches) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("capability");
    window.history.replaceState(window.history.state, "", url);
  }, [capability, capabilityMatches]);

  return {
    error,
    gameType: needsCapabilityBootstrap
      ? null
      : (roomSession?.gameType ?? requestedGameType ?? null),
    loading: (!hydrated || needsCapabilityBootstrap) && error === null,
    roomSession,
  };
}

function RoomShellFallback({ error, loading }: { error: string | null; loading: boolean }) {
  return (
    <main className="min-h-svh flex items-center justify-center px-6">
      <div className="text-center">
        {loading ? (
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-edge border-t-teal animate-spin" />
        ) : (
          <>
            <p className="text-fail font-display font-bold text-xl mb-3">
              {error ?? "Open this room from the host or join screen"}
            </p>
            <Link href="/join" className="text-sm font-medium text-teal hover:underline">
              Join a room
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export function GameShellResolver({
  code,
  gameType: requestedGameType,
  viewMode = "game",
}: {
  code: string;
  gameType?: GameType;
  viewMode?: "game" | "stage";
}) {
  const resolved = useResolvedRoomGameType(code, requestedGameType);
  if (!resolved.gameType) {
    return <RoomShellFallback error={resolved.error} loading={resolved.loading} />;
  }
  const gameType = resolved.gameType;
  const capability = resolved.roomSession
    ? viewMode === "stage"
      ? (resolved.roomSession.hostCapability ?? resolved.roomSession.playerCapability)
      : (resolved.roomSession.playerCapability ?? resolved.roomSession.hostCapability)
    : null;

  const shell =
    gameType === "AI_CHAT_SHOWDOWN" ? (
      <ChatGameShell code={code} viewMode={viewMode} />
    ) : gameType === "MATCHSLOP" ? (
      <MatchSlopGameShell code={code} viewMode={viewMode} />
    ) : (
      <GameShell code={code} viewMode={viewMode} />
    );

  return (
    <RoomShellErrorBoundary
      key={`${code}:${capability ?? "none"}`}
      capability={capability}
      roomCode={code}
    >
      {shell}
    </RoomShellErrorBoundary>
  );
}

export function ControllerShellResolver({
  code,
  gameType: requestedGameType,
}: {
  code: string;
  gameType?: GameType;
}) {
  const resolved = useResolvedRoomGameType(code, requestedGameType);
  if (!resolved.gameType) {
    return <RoomShellFallback error={resolved.error} loading={resolved.loading} />;
  }
  const gameType = resolved.gameType;
  const capability = resolved.roomSession
    ? (resolved.roomSession.playerCapability ?? resolved.roomSession.hostCapability)
    : null;

  const shell =
    gameType === "AI_CHAT_SHOWDOWN" ? (
      <ChatControllerShell code={code} />
    ) : gameType === "MATCHSLOP" ? (
      <MatchSlopControllerShell code={code} />
    ) : (
      <ControllerShell code={code} />
    );

  return (
    <RoomShellErrorBoundary
      key={`${code}:${capability ?? "none"}`}
      capability={capability}
      roomCode={code}
    >
      {shell}
    </RoomShellErrorBoundary>
  );
}
