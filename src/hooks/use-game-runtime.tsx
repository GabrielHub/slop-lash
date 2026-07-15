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

export interface GameRuntimeChatMessage {
  clientId: string | null;
  content: string;
  createdAt: string;
  id: string;
  playerId: string;
  replyToId: string | null;
}

export interface GameRuntimeMutations {
  chatSend?: GameRuntimeMutation<typeof api.chat.send>;
  chatslopAdvance?: GameRuntimeMutation<typeof api.chatslop.advance>;
  chatslopEnd?: GameRuntimeMutation<typeof api.chatslop.end>;
  chatslopRespond?: GameRuntimeMutation<typeof api.chatslop.respond>;
  chatslopVote?: GameRuntimeMutation<typeof api.chatslop.vote>;
  lobbyAddAiPlayer?: GameRuntimeMutation<typeof api.lobby.addAiPlayer>;
  lobbyKickHuman?: GameRuntimeMutation<typeof api.lobby.kickHuman>;
  lobbyRemoveAiPlayer?: GameRuntimeMutation<typeof api.lobby.removeAiPlayer>;
  lobbyStart?: GameRuntimeMutation<typeof api.lobby.start>;
  reactionsToggle?: GameRuntimeMutation<typeof api.reactions.toggle>;
  sloplashAdvance?: GameRuntimeMutation<typeof api.sloplash.advance>;
  sloplashCastVote?: GameRuntimeMutation<typeof api.sloplash.castVote>;
  sloplashEnd?: GameRuntimeMutation<typeof api.sloplash.end>;
  sloplashSubmitResponse?: GameRuntimeMutation<typeof api.sloplash.submitResponse>;
}

export interface GameRuntime {
  chat?: {
    canLoadMore?: boolean;
    isLoading?: boolean;
    messages: GameRuntimeChatMessage[];
    loadMore?: (numItems: number) => void;
  };
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

export function useChatSendMutation(): GameRuntimeMutation<typeof api.chat.send> {
  const live = useMutation(api.chat.send);
  return useGameRuntime()?.mutations?.chatSend ?? live;
}

export function useChatslopAdvanceMutation(): GameRuntimeMutation<typeof api.chatslop.advance> {
  const live = useMutation(api.chatslop.advance);
  return useGameRuntime()?.mutations?.chatslopAdvance ?? live;
}

export function useChatslopEndMutation(): GameRuntimeMutation<typeof api.chatslop.end> {
  const live = useMutation(api.chatslop.end);
  return useGameRuntime()?.mutations?.chatslopEnd ?? live;
}

export function useChatslopRespondMutation(): GameRuntimeMutation<typeof api.chatslop.respond> {
  const live = useMutation(api.chatslop.respond);
  return useGameRuntime()?.mutations?.chatslopRespond ?? live;
}

export function useChatslopVoteMutation(): GameRuntimeMutation<typeof api.chatslop.vote> {
  const live = useMutation(api.chatslop.vote);
  return useGameRuntime()?.mutations?.chatslopVote ?? live;
}

export function useLobbyAddAiPlayerMutation(): GameRuntimeMutation<typeof api.lobby.addAiPlayer> {
  const live = useMutation(api.lobby.addAiPlayer);
  return useGameRuntime()?.mutations?.lobbyAddAiPlayer ?? live;
}

export function useLobbyKickHumanMutation(): GameRuntimeMutation<typeof api.lobby.kickHuman> {
  const live = useMutation(api.lobby.kickHuman);
  return useGameRuntime()?.mutations?.lobbyKickHuman ?? live;
}

export function useLobbyRemoveAiPlayerMutation(): GameRuntimeMutation<
  typeof api.lobby.removeAiPlayer
> {
  const live = useMutation(api.lobby.removeAiPlayer);
  return useGameRuntime()?.mutations?.lobbyRemoveAiPlayer ?? live;
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
