"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import type { GameType } from "@/games/core/types";
import { GameShell } from "@/components/game-shell";
import { ControllerShell } from "@/components/controller-shell";
import { ChatGameShell } from "@/games/ai-chat-showdown/ui/chat-game-shell";
import { ChatControllerShell } from "@/games/ai-chat-showdown/ui/chat-controller-shell";
import { MatchSlopGameShell } from "@/games/matchslop/ui/matchslop-game-shell";
import { MatchSlopControllerShell } from "@/games/matchslop/ui/matchslop-controller-shell";
import { QuizslopGameShell } from "@/games/quizslop/ui/quizslop-game-shell";
import { QuizslopControllerShell } from "@/games/quizslop/ui/quizslop-controller-shell";
import { RoomShellErrorBoundary } from "@/components/room-shell-error-boundary";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { persistRoomSessionResult } from "@/lib/convex-room-client";
import { clearRoomCapabilityFromUrl, readRoomCapabilityFragment } from "@/lib/room-capability-link";
import { api } from "../../convex/_generated/api";

const subscribeToNothing = () => () => {};
const subscribeToHashChanges = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const getHashCapabilitySnapshot = () => readRoomCapabilityFragment(window.location.hash);
const getServerHashCapabilitySnapshot = () => null;

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
  const fragmentCapability = useSyncExternalStore(
    subscribeToHashChanges,
    getHashCapabilitySnapshot,
    getServerHashCapabilitySnapshot,
  );
  const capability = searchParams.get("capability") ?? fragmentCapability;
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
        const url = clearRoomCapabilityFromUrl(new URL(window.location.href));
        window.history.replaceState(window.history.state, "", url);
      })
      .catch((cause: unknown) => {
        setError(getConvexErrorMessage(cause, "This room link is invalid or expired"));
      });
  }, [capability, capabilityMatches, code, rejoinRoom]);

  useEffect(() => {
    if (!capability || !capabilityMatches) return;
    const url = clearRoomCapabilityFromUrl(new URL(window.location.href));
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

/**
 * QuizSlop never renders a combined game shell. An accidental /game/{code}
 * visit sends a player capability to its controller and a display-only host
 * session to the shared stage.
 */
function QuizSlopGameRedirect({
  code,
  hasPlayerCapability,
}: {
  code: string;
  hasPlayerCapability: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    router.replace(hasPlayerCapability ? `/controller/${code}` : `/stage/${code}`);
  }, [code, hasPlayerCapability, router]);

  return (
    <main className="min-h-svh flex items-center justify-center px-6">
      <div className="w-8 h-8 rounded-full border-2 border-edge border-t-teal animate-spin" />
    </main>
  );
}

function unexpectedGameType(gameType: never): never {
  throw new Error(`Unsupported game type: ${String(gameType)}`);
}

function resolveGameShell(
  gameType: GameType,
  code: string,
  viewMode: "game" | "stage",
  hasPlayerCapability: boolean,
) {
  switch (gameType) {
    case "SLOPLASH":
      return <GameShell code={code} viewMode={viewMode} />;
    case "AI_CHAT_SHOWDOWN":
      return <ChatGameShell code={code} viewMode={viewMode} />;
    case "MATCHSLOP":
      return <MatchSlopGameShell code={code} viewMode={viewMode} />;
    case "QUIZSLOP":
      return viewMode === "stage" ? (
        <QuizslopGameShell code={code} viewMode={viewMode} />
      ) : (
        <QuizSlopGameRedirect code={code} hasPlayerCapability={hasPlayerCapability} />
      );
    default:
      return unexpectedGameType(gameType);
  }
}

function resolveControllerShell(gameType: GameType, code: string) {
  switch (gameType) {
    case "SLOPLASH":
      return <ControllerShell code={code} />;
    case "AI_CHAT_SHOWDOWN":
      return <ChatControllerShell code={code} />;
    case "MATCHSLOP":
      return <MatchSlopControllerShell code={code} />;
    case "QUIZSLOP":
      return <QuizslopControllerShell code={code} />;
    default:
      return unexpectedGameType(gameType);
  }
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

  const shell = resolveGameShell(
    gameType,
    code,
    viewMode,
    resolved.roomSession?.playerCapability != null,
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

  const shell = resolveControllerShell(gameType, code);

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
