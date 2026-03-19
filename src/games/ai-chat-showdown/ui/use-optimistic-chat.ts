import { useState, useEffect, useRef, useCallback, useMemo } from "react";

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

function isDocumentHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

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

    let pendingIdx = -1;
    if (message.clientId) {
      pendingIdx = updated.findIndex((entry) => entry.clientId === message.clientId);
    }

    if (pendingIdx === -1) {
      pendingIdx = updated.findIndex(
        (entry) =>
          (entry.status === "pending" || entry.status === "failed") &&
          entry.playerId === message.playerId &&
          entry.content === message.content,
      );
    }

    if (pendingIdx !== -1) {
      updated[pendingIdx] = {
        ...updated[pendingIdx],
        id: message.id,
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

  updated.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return { messages: updated, knownIds: nextKnownIds };
}

export function useOptimisticChat(
  code: string,
  playerId: string | null,
  enabled: boolean,
) {
  const [messagesState, setMessagesState] = useState<{
    code: string;
    messages: OptimisticChatMessage[];
  }>({ code, messages: [] });
  const [incomingTickState, setIncomingTickState] = useState<{
    code: string;
    tick: number;
  }>({ code, tick: 0 });
  const cursorRef = useRef<ChatCursor | null>(null);
  const knownIdsRef = useRef(new Set<string>());
  const messagesRef = useRef<OptimisticChatMessage[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const terminalRef = useRef(false);
  const incomingTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = useMemo(
    () => (messagesState.code === code ? messagesState.messages : EMPTY_MESSAGES),
    [messagesState, code],
  );
  const incomingTick = incomingTickState.code === code ? incomingTickState.tick : 0;

  const setMessagesForCode = useCallback(
    (updater: (prev: OptimisticChatMessage[]) => OptimisticChatMessage[]) => {
      setMessagesState((prev) => {
        const current = prev.code === code ? prev.messages : [];
        return { code, messages: updater(current) };
      });
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
    cursorRef.current = null;
    knownIdsRef.current = new Set();
    terminalRef.current = false;
    retriesRef.current = 0;

    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    let cancelled = false;

    function registerMessages(incoming: ServerChatMessage[]) {
      if (incoming.length === 0) return;

      const hasOtherPlayerMessage = incoming.some((message) => message.playerId !== playerId);
      const reconciled = reconcileIncomingChatMessages(
        messagesRef.current,
        incoming,
        knownIdsRef.current,
      );

      knownIdsRef.current = reconciled.knownIds;
      messagesRef.current = reconciled.messages;
      setMessagesForCode(() => reconciled.messages);

      const last = incoming[incoming.length - 1];
      cursorRef.current = advanceCursor(cursorRef.current, {
        createdAt: last.createdAt,
        id: last.id,
      });

      if (hasOtherPlayerMessage) {
        scheduleIncomingTick();
      }
    }

    function connect() {
      if (cancelled || terminalRef.current || isDocumentHidden()) return;

      const params = new URLSearchParams();
      if (cursorRef.current) {
        params.set("after", cursorRef.current.createdAt);
        params.set("afterId", cursorRef.current.id);
      }
      const qs = params.toString();
      const es = new EventSource(`/api/games/${code}/chat/stream${qs ? `?${qs}` : ""}`);
      esRef.current = es;

      es.addEventListener("message", (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(event.data) as ServerChatMessage;
          registerMessages([message]);
          retriesRef.current = 0;
        } catch {
          // Ignore malformed data.
        }
      });

      es.addEventListener("done", () => {
        terminalRef.current = true;
        es.close();
        if (esRef.current === es) {
          esRef.current = null;
        }
      });

      es.addEventListener("server-error", () => {
        es.close();
        if (esRef.current === es) {
          esRef.current = null;
        }
      });

      es.onerror = () => {
        if (cancelled) return;

        es.close();
        if (esRef.current === es) {
          esRef.current = null;
        }

        if (terminalRef.current || isDocumentHidden()) {
          return;
        }

        const delay = Math.min(2_000 * 2 ** retriesRef.current, 30_000);
        retriesRef.current++;
        setTimeout(() => {
          if (!cancelled && !esRef.current && !terminalRef.current) {
            connect();
          }
        }, delay);
      };
    }

    function onVisibilityChange() {
      if (isDocumentHidden()) {
        esRef.current?.close();
        esRef.current = null;
        return;
      }

      if (!cancelled && !esRef.current && !terminalRef.current) {
        retriesRef.current = 0;
        connect();
      }
    }

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      esRef.current?.close();
      esRef.current = null;
      if (incomingTickTimerRef.current) {
        clearTimeout(incomingTickTimerRef.current);
        incomingTickTimerRef.current = null;
      }
    };
  }, [code, enabled, playerId, scheduleIncomingTick, setMessagesForCode]);

  const postAndReconcile = useCallback(
    async (clientId: string, content: string) => {
      if (!playerId) return;

      try {
        const res = await fetch(`/api/games/${code}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, content, clientId }),
        });

        if (!res.ok) {
          setMessagesForCode((prev) => setMessageStatus(prev, clientId, "failed"));
          return;
        }

        const data = (await res.json()) as {
          id: string;
          createdAt: string;
          clientId: string | null;
        };
        knownIdsRef.current.add(data.id);
        setMessagesForCode((prev) =>
          confirmMessage(prev, data.clientId ?? clientId, data.id, data.createdAt),
        );
      } catch {
        setMessagesForCode((prev) => setMessageStatus(prev, clientId, "failed"));
      }
    },
    [code, playerId, setMessagesForCode],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!playerId || !content.trim()) return;

      const optimistic = createPendingMessage(playerId, content);
      setMessagesForCode((prev) => [...prev, optimistic]);
      await postAndReconcile(optimistic.clientId, optimistic.content);
    },
    [playerId, postAndReconcile, setMessagesForCode],
  );

  const retryMessage = useCallback(
    async (clientId: string) => {
      const message = messagesRef.current.find((entry) => entry.clientId === clientId);
      if (!message || message.status !== "failed" || !playerId) return;

      setMessagesForCode((prev) => setMessageStatus(prev, clientId, "pending"));
      await postAndReconcile(clientId, message.content);
    },
    [playerId, postAndReconcile, setMessagesForCode],
  );

  const dismissFailed = useCallback(
    (clientId: string) => {
      setMessagesForCode((prev) => removeMessageByClientId(prev, clientId));
    },
    [setMessagesForCode],
  );

  return { messages, sendMessage, retryMessage, dismissFailed, incomingTick };
}
