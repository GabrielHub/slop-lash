import { useState, useEffect, useRef, useCallback } from "react";

export type ChatMessageStatus = "pending" | "confirmed" | "failed";

export interface OptimisticChatMessage {
  /** Server-assigned ID once confirmed, or client-generated temp ID while pending/failed. */
  id: string;
  /** Client-generated ID used to track optimistic messages across state updates. */
  clientId: string;
  playerId: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
  status: ChatMessageStatus;
}

export interface ServerChatMessage {
  id: string;
  playerId: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
}

const CHAT_POLL_MS = 2000;

type ChatCursor = {
  createdAt: string;
  id: string;
};

function makeClientMessageId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  return messages.map((m) =>
    m.clientId === clientId ? { ...m, status } : m,
  );
}

export function confirmMessage(
  messages: OptimisticChatMessage[],
  clientId: string,
  id: string,
  createdAt: string,
): OptimisticChatMessage[] {
  return messages.map((m) =>
    m.clientId === clientId
      ? { ...m, id, createdAt, status: "confirmed" as const }
      : m,
  );
}

export function removeMessageByClientId(
  messages: OptimisticChatMessage[],
  clientId: string,
): OptimisticChatMessage[] {
  return messages.filter((m) => m.clientId !== clientId);
}

export function reconcileIncomingChatMessages(
  existing: OptimisticChatMessage[],
  incoming: ServerChatMessage[],
  knownIds: Set<string>,
): { messages: OptimisticChatMessage[]; knownIds: Set<string> } {
  const updated = [...existing];
  const nextKnownIds = new Set(knownIds);

  for (const msg of incoming) {
    if (nextKnownIds.has(msg.id)) continue;

    const pendingIdx = updated.findIndex(
      (m) =>
        (m.status === "pending" || m.status === "failed") &&
        m.playerId === msg.playerId &&
        m.content === msg.content,
    );

    if (pendingIdx !== -1) {
      updated[pendingIdx] = {
        ...updated[pendingIdx],
        id: msg.id,
        replyToId: msg.replyToId,
        createdAt: msg.createdAt,
        status: "confirmed",
      };
    } else {
      updated.push({
        id: msg.id,
        clientId: msg.id,
        playerId: msg.playerId,
        content: msg.content,
        replyToId: msg.replyToId,
        createdAt: msg.createdAt,
        status: "confirmed",
      });
    }

    nextKnownIds.add(msg.id);
  }

  updated.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return { messages: updated, knownIds: nextKnownIds };
}

/** Optimistic chat state with cursor-based polling and reconciliation. */
export function useOptimisticChat(
  code: string,
  playerId: string | null,
  enabled: boolean,
) {
  const [messages, setMessages] = useState<OptimisticChatMessage[]>([]);
  /** Increments whenever a new message from another player arrives via polling. */
  const [incomingTick, setIncomingTick] = useState(0);
  const cursorRef = useRef<ChatCursor | null>(null);
  const knownIdsRef = useRef(new Set<string>());
  const messagesRef = useRef<OptimisticChatMessage[]>([]);
  const [prevCode, setPrevCode] = useState(code);

  if (prevCode !== code) {
    setPrevCode(code);
    setMessages([]);
  }

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    cursorRef.current = null;
    knownIdsRef.current = new Set();

    if (!enabled) return;
    let cancelled = false;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function poll() {
      while (!cancelled) {
        const isHidden =
          typeof document !== "undefined" &&
          document.visibilityState === "hidden";

        if (!isHidden) {
          try {
            const params = new URLSearchParams();
            if (cursorRef.current) {
              params.set("after", cursorRef.current.createdAt);
              params.set("afterId", cursorRef.current.id);
            }
            const qs = params.toString();
            const res = await fetch(
              `/api/games/${code}/chat${qs ? `?${qs}` : ""}`,
            );
            if (cancelled) return;

            if (res.ok) {
              const data = (await res.json()) as {
                messages: ServerChatMessage[];
              };

              if (data.messages.length > 0) {
                // Check if any incoming messages are from other players (not ours)
                const hasOtherPlayerMsg = data.messages.some(
                  (m) => m.playerId !== playerId,
                );

                setMessages((prev) => {
                  const reconciled = reconcileIncomingChatMessages(
                    prev,
                    data.messages,
                    knownIdsRef.current,
                  );
                  knownIdsRef.current = reconciled.knownIds;
                  return reconciled.messages;
                });

                if (hasOtherPlayerMsg) {
                  setIncomingTick((t) => t + 1);
                }

                const last = data.messages[data.messages.length - 1];
                cursorRef.current = { createdAt: last.createdAt, id: last.id };
              }
            }
          } catch {
            // Swallow poll errors
          }
        }

        await sleep(CHAT_POLL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [code, enabled, playerId]);

  /** POST a chat message and update the optimistic entry by clientId. */
  const postAndReconcile = useCallback(
    async (clientId: string, content: string) => {
      if (!playerId) return;
      try {
        const res = await fetch(`/api/games/${code}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, content }),
        });

        if (!res.ok) {
          setMessages((prev) => setMessageStatus(prev, clientId, "failed"));
          return;
        }

        const data = (await res.json()) as { id: string; createdAt: string };
        knownIdsRef.current.add(data.id);

        setMessages((prev) =>
          confirmMessage(prev, clientId, data.id, data.createdAt),
        );
      } catch {
        setMessages((prev) => setMessageStatus(prev, clientId, "failed"));
      }
    },
    [code, playerId],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!playerId || !content.trim()) return;

      const optimistic = createPendingMessage(playerId, content);

      setMessages((prev) => [...prev, optimistic]);
      await postAndReconcile(optimistic.clientId, optimistic.content);
    },
    [playerId, postAndReconcile],
  );

  const retryMessage = useCallback(
    async (clientId: string) => {
      const msg = messagesRef.current.find((m) => m.clientId === clientId);
      if (!msg || msg.status !== "failed" || !playerId) return;

      setMessages((prev) => setMessageStatus(prev, clientId, "pending"));
      await postAndReconcile(clientId, msg.content);
    },
    [playerId, postAndReconcile],
  );

  const dismissFailed = useCallback((clientId: string) => {
    setMessages((prev) => removeMessageByClientId(prev, clientId));
  }, []);

  return { messages, sendMessage, retryMessage, dismissFailed, incomingTick };
}
