import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { useChatSendMutation, useGameRuntime } from "@/hooks/use-game-runtime";
import { api } from "../../../../convex/_generated/api";

export type ChatMessageStatus = "pending" | "confirmed" | "failed";

export interface OptimisticChatMessage {
  id: string;
  clientId: string;
  playerId: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
  status: ChatMessageStatus;
}

export interface ServerChatMessage {
  id: string;
  clientId: string | null;
  playerId: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
}

type ChatCursor = {
  createdAt: string;
  id: string;
};

const EMPTY_MESSAGES: OptimisticChatMessage[] = [];
const INCOMING_TICK_BATCH_MS = 120;
const CHAT_PAGE_SIZE = 50;

function makeClientMessageId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function compareCursor(a: ChatCursor, b: ChatCursor): number {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  if (aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

function advanceCursor(cursor: ChatCursor | null, next: ChatCursor): ChatCursor {
  if (!cursor) return next;
  return compareCursor(cursor, next) < 0 ? next : cursor;
}

function latestCursor(messages: ServerChatMessage[]): ChatCursor | null {
  let cursor: ChatCursor | null = null;
  for (const message of messages) {
    cursor = advanceCursor(cursor, { createdAt: message.createdAt, id: message.id });
  }
  return cursor;
}

export function hasNewerOtherPlayerMessage(
  incoming: ServerChatMessage[],
  knownIds: ReadonlySet<string>,
  cursor: ChatCursor | null,
  playerId: string | null,
): boolean {
  return incoming.some(
    (message) =>
      !knownIds.has(message.id) &&
      message.playerId !== playerId &&
      (!cursor || compareCursor({ createdAt: message.createdAt, id: message.id }, cursor) > 0),
  );
}

export function createPendingMessage(
  playerId: string,
  content: string,
  clientId = makeClientMessageId(),
  createdAt = new Date().toISOString(),
): OptimisticChatMessage {
  return {
    id: clientId,
    clientId,
    playerId,
    content: content.trim(),
    replyToId: null,
    createdAt,
    status: "pending",
  };
}

export function setMessageStatus(
  messages: OptimisticChatMessage[],
  clientId: string,
  status: ChatMessageStatus,
): OptimisticChatMessage[] {
  return messages.map((message) =>
    message.clientId === clientId ? { ...message, status } : message,
  );
}

export function confirmMessage(
  messages: OptimisticChatMessage[],
  clientId: string,
  id: string,
  createdAt: string,
): OptimisticChatMessage[] {
  return messages.map((message) =>
    message.clientId === clientId
      ? { ...message, id, createdAt, status: "confirmed" as const }
      : message,
  );
}

export function removeMessageByClientId(
  messages: OptimisticChatMessage[],
  clientId: string,
): OptimisticChatMessage[] {
  return messages.filter((message) => message.clientId !== clientId);
}

export function reconcileIncomingChatMessages(
  existing: OptimisticChatMessage[],
  incoming: ServerChatMessage[],
  knownIds: Set<string>,
): { messages: OptimisticChatMessage[]; knownIds: Set<string> } {
  const updated = [...existing];
  const nextKnownIds = new Set(knownIds);

  for (const message of incoming) {
    if (nextKnownIds.has(message.id)) continue;

    // A server message carrying a clientId can only match the pending entry with
    // that exact clientId. Falling back to content matching would let an echo be
    // absorbed into an unrelated send with the same text, dropping a real message.
    const pendingIdx = message.clientId
      ? updated.findIndex((entry) => entry.clientId === message.clientId)
      : updated.findIndex(
          (entry) =>
            (entry.status === "pending" || entry.status === "failed") &&
            entry.playerId === message.playerId &&
            entry.content === message.content,
        );

    if (pendingIdx !== -1) {
      updated[pendingIdx] = {
        ...updated[pendingIdx],
        id: message.id,
        content: message.content,
        playerId: message.playerId,
        replyToId: message.replyToId,
        createdAt: message.createdAt,
        status: "confirmed",
      };
    } else {
      updated.push({
        id: message.id,
        clientId: message.clientId ?? message.id,
        playerId: message.playerId,
        content: message.content,
        replyToId: message.replyToId,
        createdAt: message.createdAt,
        status: "confirmed",
      });
    }

    nextKnownIds.add(message.id);
  }

  updated.sort((left, right) => compareCursor(left, right));

  return { messages: updated, knownIds: nextKnownIds };
}

export function useOptimisticChat(code: string, playerId: string | null, enabled: boolean) {
  const runtime = useGameRuntime(code);
  const runtimeChat = runtime?.chat;
  const roomSession = useConvexRoomSession(code);
  const readCapability = roomSession?.playerCapability ?? roomSession?.hostCapability ?? null;
  const writeCapability = roomSession?.playerCapability ?? null;
  const roomIdentity = `${code}:${readCapability ?? ""}`;
  const sendChatMutation = useChatSendMutation();
  const {
    isLoading: isLoadingLiveHistory,
    loadMore: loadMoreLiveMessages,
    results: liveServerMessages,
    status: livePaginationStatus,
  } = usePaginatedQuery(
    api.chat.list,
    enabled && readCapability && !runtimeChat ? { capability: readCapability } : "skip",
    { initialNumItems: CHAT_PAGE_SIZE },
  );
  const isLoadingHistory = runtimeChat?.isLoading ?? isLoadingLiveHistory;
  const loadMore = runtimeChat?.loadMore ?? loadMoreLiveMessages;
  const serverMessages = runtimeChat?.messages ?? liveServerMessages;
  const paginationStatus = runtimeChat
    ? runtimeChat.canLoadMore
      ? "CanLoadMore"
      : "Exhausted"
    : livePaginationStatus;
  const [messagesState, setMessagesState] = useState<{
    code: string;
    messages: OptimisticChatMessage[];
  }>({ code, messages: [] });
  const [incomingTickState, setIncomingTickState] = useState<{
    code: string;
    tick: number;
  }>({ code, tick: 0 });
  const latestCursorRef = useRef<ChatCursor | null>(null);
  const knownIdsRef = useRef(new Set<string>());
  const messagesRef = useRef<OptimisticChatMessage[]>([]);
  const historyInitializedRef = useRef(false);
  const incomingTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRoomIdentityRef = useRef(roomIdentity);
  activeRoomIdentityRef.current = roomIdentity;

  const messages = useMemo(
    () => (messagesState.code === code ? messagesState.messages : EMPTY_MESSAGES),
    [messagesState, code],
  );
  const incomingTick = incomingTickState.code === code ? incomingTickState.tick : 0;

  const setMessagesForCode = useCallback(
    (updater: (prev: OptimisticChatMessage[]) => OptimisticChatMessage[]) => {
      const next = updater(messagesRef.current);
      messagesRef.current = next;
      setMessagesState({ code, messages: next });
    },
    [code],
  );

  const incrementIncomingTick = useCallback(() => {
    setIncomingTickState((prev) => ({
      code,
      tick: prev.code === code ? prev.tick + 1 : 1,
    }));
  }, [code]);

  const scheduleIncomingTick = useCallback(() => {
    if (incomingTickTimerRef.current) return;
    incomingTickTimerRef.current = setTimeout(() => {
      incomingTickTimerRef.current = null;
      incrementIncomingTick();
    }, INCOMING_TICK_BATCH_MS);
  }, [incrementIncomingTick]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (incomingTickTimerRef.current) {
      clearTimeout(incomingTickTimerRef.current);
      incomingTickTimerRef.current = null;
    }
    latestCursorRef.current = null;
    knownIdsRef.current = new Set();
    historyInitializedRef.current = false;
    messagesRef.current = [];
    setMessagesState({ code, messages: [] });
    setIncomingTickState({ code, tick: 0 });
  }, [code, readCapability]);

  useEffect(() => {
    if (!enabled || !readCapability || paginationStatus === "LoadingFirstPage") return;

    const shouldTick =
      historyInitializedRef.current &&
      hasNewerOtherPlayerMessage(
        serverMessages,
        knownIdsRef.current,
        latestCursorRef.current,
        playerId,
      );
    const unseen = serverMessages.filter((message) => !knownIdsRef.current.has(message.id));
    const nextCursor = latestCursor(serverMessages);
    if (nextCursor) {
      latestCursorRef.current = advanceCursor(latestCursorRef.current, nextCursor);
    }
    historyInitializedRef.current = true;
    if (unseen.length > 0) {
      const reconciled = reconcileIncomingChatMessages(
        messagesRef.current,
        unseen,
        knownIdsRef.current,
      );
      knownIdsRef.current = reconciled.knownIds;
      setMessagesForCode(() => reconciled.messages);
    }
    if (shouldTick) scheduleIncomingTick();
  }, [
    enabled,
    paginationStatus,
    playerId,
    readCapability,
    scheduleIncomingTick,
    serverMessages,
    setMessagesForCode,
  ]);

  useEffect(
    () => () => {
      if (incomingTickTimerRef.current) {
        clearTimeout(incomingTickTimerRef.current);
        incomingTickTimerRef.current = null;
      }
    },
    [],
  );

  const postAndReconcile = useCallback(
    async (clientId: string, content: string) => {
      if (!playerId || !writeCapability) return;
      const requestedRoomIdentity = roomIdentity;

      try {
        const message = await sendChatMutation({
          capability: writeCapability,
          clientId,
          content,
        });
        if (activeRoomIdentityRef.current !== requestedRoomIdentity) return;
        const reconciled = reconcileIncomingChatMessages(
          messagesRef.current,
          [message],
          knownIdsRef.current,
        );
        knownIdsRef.current = reconciled.knownIds;
        setMessagesForCode(() => reconciled.messages);
      } catch {
        if (activeRoomIdentityRef.current !== requestedRoomIdentity) return;
        setMessagesForCode((prev) => setMessageStatus(prev, clientId, "failed"));
      }
    },
    [playerId, roomIdentity, sendChatMutation, setMessagesForCode, writeCapability],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!playerId || !writeCapability || !content.trim()) return;

      const optimistic = createPendingMessage(playerId, content);
      setMessagesForCode((prev) => [...prev, optimistic]);
      await postAndReconcile(optimistic.clientId, optimistic.content);
    },
    [playerId, postAndReconcile, setMessagesForCode, writeCapability],
  );

  const retryMessage = useCallback(
    async (clientId: string) => {
      const message = messagesRef.current.find((entry) => entry.clientId === clientId);
      if (!message || message.status !== "failed" || !playerId || !writeCapability) return;

      setMessagesForCode((prev) => setMessageStatus(prev, clientId, "pending"));
      await postAndReconcile(clientId, message.content);
    },
    [playerId, postAndReconcile, setMessagesForCode, writeCapability],
  );

  const dismissFailed = useCallback(
    (clientId: string) => {
      setMessagesForCode((prev) => removeMessageByClientId(prev, clientId));
    },
    [setMessagesForCode],
  );

  const loadOlderMessages = useCallback(() => {
    if (paginationStatus === "CanLoadMore") loadMore(CHAT_PAGE_SIZE);
  }, [loadMore, paginationStatus]);

  return {
    canLoadMore: enabled && paginationStatus === "CanLoadMore",
    dismissFailed,
    incomingTick,
    isLoadingHistory: enabled && isLoadingHistory,
    isLoadingMore: enabled && paginationStatus === "LoadingMore",
    loadOlderMessages,
    messages,
    retryMessage,
    sendMessage,
  };
}
