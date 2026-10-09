"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { ConvexRoomSession } from "@/lib/convex-room-session";
import type { ControllerGameState } from "@/lib/controller-types";
import type { GameState } from "@/lib/types";

type PublicMutation = FunctionReference<"mutation", "public">;

export type GameRuntimeMutation<Reference extends PublicMutation> = (
  args: FunctionArgs<Reference>,
) => Promise<FunctionReturnType<Reference>>;

export interface GameRuntimeMutations {
  lobbyKickHuman?: GameRuntimeMutation<typeof api.lobby.kickHuman>;
  lobbyStart?: GameRuntimeMutation<typeof api.lobby.start>;
  reactionsToggle?: GameRuntimeMutation<typeof api.reactions.toggle>;
  sloplashAdvance?: GameRuntimeMutation<typeof api.sloplash.advance>;
  sloplashCastVote?: GameRuntimeMutation<typeof api.sloplash.castVote>;
  sloplashEnd?: GameRuntimeMutation<typeof api.sloplash.end>;
  sloplashSubmitResponse?: GameRuntimeMutation<typeof api.sloplash.submitResponse>;
}

export interface GameRuntime {
  controllerState?: ControllerGameState;
  error?: string | null;
  gameState: GameState;
  mutations?: GameRuntimeMutations;
  roomCode: string;
  session: ConvexRoomSession;
}

const GameRuntimeContext = createContext<GameRuntime | null>(null);

export function GameRuntimeProvider({
  children,
  value,
}: {
  children?: ReactNode;
  value: GameRuntime;
}) {
  return <GameRuntimeContext.Provider value={value}>{children}</GameRuntimeContext.Provider>;
}

export function useGameRuntime(roomCode?: string): GameRuntime | null {
  const runtime = useContext(GameRuntimeContext);
  if (!runtime || roomCode === undefined) return runtime;
  return runtime.roomCode.trim().toUpperCase() === roomCode.trim().toUpperCase() ? runtime : null;
}

export function useLobbyKickHumanMutation(): GameRuntimeMutation<typeof api.lobby.kickHuman> {
  const live = useMutation(api.lobby.kickHuman);
  return useGameRuntime()?.mutations?.lobbyKickHuman ?? live;
}

export function useLobbyStartMutation(): GameRuntimeMutation<typeof api.lobby.start> {
  const live = useMutation(api.lobby.start);
  return useGameRuntime()?.mutations?.lobbyStart ?? live;
}

export function useReactionToggleMutation(): GameRuntimeMutation<typeof api.reactions.toggle> {
  const live = useMutation(api.reactions.toggle);
  return useGameRuntime()?.mutations?.reactionsToggle ?? live;
}

export function useSloplashAdvanceMutation(): GameRuntimeMutation<typeof api.sloplash.advance> {
  const live = useMutation(api.sloplash.advance);
  return useGameRuntime()?.mutations?.sloplashAdvance ?? live;
}

export function useSloplashCastVoteMutation(): GameRuntimeMutation<typeof api.sloplash.castVote> {
  const live = useMutation(api.sloplash.castVote);
  return useGameRuntime()?.mutations?.sloplashCastVote ?? live;
}

export function useSloplashEndMutation(): GameRuntimeMutation<typeof api.sloplash.end> {
  const live = useMutation(api.sloplash.end);
  return useGameRuntime()?.mutations?.sloplashEnd ?? live;
}

export function useSloplashSubmitResponseMutation(): GameRuntimeMutation<
  typeof api.sloplash.submitResponse
> {
  const live = useMutation(api.sloplash.submitResponse);
  return useGameRuntime()?.mutations?.sloplashSubmitResponse ?? live;
}
