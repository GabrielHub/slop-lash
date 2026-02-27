import { describe, expect, it } from "vitest";

import {
  confirmMessage,
  createPendingMessage,
  reconcileIncomingChatMessages,
  removeMessageByClientId,
  setMessageStatus,
  type OptimisticChatMessage,
  type ServerChatMessage,
} from "./ui/use-optimistic-chat";

describe("createPendingMessage", () => {
  it("creates a trimmed pending message bound to player identity", () => {
    const msg = createPendingMessage(
      "player-1",
      "  hello world  ",
      "client-1",
      "2026-02-27T12:00:00Z",
    );

    expect(msg).toEqual({
      id: "client-1",
      clientId: "client-1",
      playerId: "player-1",
      content: "hello world",
      replyToId: null,
      createdAt: "2026-02-27T12:00:00Z",
      status: "pending",
    });
  });
});

describe("post reconciliation helpers", () => {
  it("confirms only the target optimistic message on successful POST", () => {
    const base = [
      createPendingMessage("p1", "one", "c1", "2026-02-27T12:00:00Z"),
      createPendingMessage("p2", "two", "c2", "2026-02-27T12:00:01Z"),
    ];

    const updated = confirmMessage(base, "c1", "s1", "2026-02-27T12:00:02Z");

    expect(updated[0].id).toBe("s1");
    expect(updated[0].status).toBe("confirmed");
    expect(updated[1].id).toBe("c2");
    expect(updated[1].status).toBe("pending");
  });

  it("transitions failed -> pending and supports failed dismissal", () => {
    const base = [
      createPendingMessage("p1", "one", "c1"),
      createPendingMessage("p2", "two", "c2"),
    ];

    const failed = setMessageStatus(base, "c1", "failed");
    expect(failed[0].status).toBe("failed");

    const retried = setMessageStatus(failed, "c1", "pending");
    expect(retried[0].status).toBe("pending");

    const dismissed = removeMessageByClientId(failed, "c1");
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0].clientId).toBe("c2");
  });
});

describe("poll reconciliation", () => {
  it("matches pending local messages to server messages by playerId+content", () => {
    const local = [createPendingMessage("p1", "same text", "c1", "2026-02-27T12:00:00Z")];
    const incoming: ServerChatMessage[] = [
      {
        id: "s1",
        playerId: "p1",
        content: "same text",
        replyToId: null,
        createdAt: "2026-02-27T12:00:03Z",
      },
    ];

    const { messages, knownIds } = reconcileIncomingChatMessages(
      local,
      incoming,
      new Set(),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("s1");
    expect(messages[0].clientId).toBe("c1");
    expect(messages[0].status).toBe("confirmed");
    expect(knownIds.has("s1")).toBe(true);
  });

  it("appends remote messages and deduplicates known IDs", () => {
    const existing: OptimisticChatMessage[] = [];
    const incoming: ServerChatMessage[] = [
      {
        id: "s1",
        playerId: "p2",
        content: "remote",
        replyToId: null,
        createdAt: "2026-02-27T12:00:00Z",
      },
    ];

    const first = reconcileIncomingChatMessages(existing, incoming, new Set());
    const second = reconcileIncomingChatMessages(
      first.messages,
      incoming,
      first.knownIds,
    );

    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].status).toBe("confirmed");
    expect(second.messages).toHaveLength(1);
  });

  it("returns messages sorted by createdAt after merging incoming data", () => {
    const existing = [createPendingMessage("p1", "middle", "c1", "2026-02-27T12:05:00Z")];
    const incoming: ServerChatMessage[] = [
      {
        id: "s-early",
        playerId: "p2",
        content: "early",
        replyToId: null,
        createdAt: "2026-02-27T12:00:00Z",
      },
      {
        id: "s-late",
        playerId: "p3",
        content: "late",
        replyToId: null,
        createdAt: "2026-02-27T12:10:00Z",
      },
    ];

    const { messages } = reconcileIncomingChatMessages(existing, incoming, new Set());
    expect(messages.map((m) => m.content)).toEqual(["early", "middle", "late"]);
  });
});
