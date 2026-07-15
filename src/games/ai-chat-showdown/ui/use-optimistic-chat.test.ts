import { describe, expect, it } from "vite-plus/test";
import {
  createPendingMessage,
  hasNewerOtherPlayerMessage,
  reconcileIncomingChatMessages,
  type ServerChatMessage,
} from "./use-optimistic-chat";

function serverMessage(
  id: string,
  playerId: string,
  createdAt: string,
  clientId: string | null = null,
): ServerChatMessage {
  return {
    id,
    clientId,
    playerId,
    content: `message ${id}`,
    replyToId: null,
    createdAt,
  };
}

describe("Convex chat pagination reconciliation", () => {
  it("does not treat an older loaded page or the current player's message as newly incoming", () => {
    const highWater = { id: "message-20", createdAt: "2026-07-15T20:00:00.000Z" };
    const olderPage = [
      serverMessage("message-10", "other", "2026-07-15T19:00:00.000Z"),
      serverMessage("message-09", "other", "2026-07-15T18:00:00.000Z"),
    ];
    const ownNewMessage = [serverMessage("message-21", "me", "2026-07-15T20:01:00.000Z")];

    expect(hasNewerOtherPlayerMessage(olderPage, new Set(), highWater, "me")).toBe(false);
    expect(hasNewerOtherPlayerMessage(ownNewMessage, new Set(), highWater, "me")).toBe(false);
    expect(
      hasNewerOtherPlayerMessage(
        [serverMessage("message-22", "other", "2026-07-15T20:02:00.000Z")],
        new Set(),
        highWater,
        "me",
      ),
    ).toBe(true);
  });

  it("reconciles a Convex mutation result by clientId and merges older pages chronologically", () => {
    const pending = createPendingMessage(
      "me",
      "<b>message sent</b>",
      "client-1",
      "2026-07-15T20:00:00.000Z",
    );
    const confirmed: ServerChatMessage = {
      ...serverMessage("message-20", "me", "2026-07-15T20:00:01.000Z", "client-1"),
      content: "message sent",
    };
    const first = reconcileIncomingChatMessages([pending], [confirmed], new Set());
    const withOlderPage = reconcileIncomingChatMessages(
      first.messages,
      [serverMessage("message-10", "other", "2026-07-15T19:00:00.000Z")],
      first.knownIds,
    );

    expect(withOlderPage.messages).toHaveLength(2);
    expect(withOlderPage.messages.map((message) => message.id)).toEqual([
      "message-10",
      "message-20",
    ]);
    expect(withOlderPage.messages[1]).toMatchObject({
      clientId: "client-1",
      content: "message sent",
      status: "confirmed",
    });
  });

  it("does not absorb a server message into a pending send that has a different clientId", () => {
    const pending = createPendingMessage("me", "gg", "client-B", "2026-07-15T20:00:00.000Z");
    const otherTabEcho: ServerChatMessage = {
      ...serverMessage("message-30", "me", "2026-07-15T20:00:01.000Z", "client-A"),
      content: "gg",
    };

    const result = reconcileIncomingChatMessages([pending], [otherTabEcho], new Set());

    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((message) => message.clientId)).toEqual(["client-B", "client-A"]);
    expect(result.messages.find((message) => message.clientId === "client-B")).toMatchObject({
      status: "pending",
    });
  });

  it("still matches a server message with no clientId to an identical pending send", () => {
    const pending = createPendingMessage("me", "gg", "client-B", "2026-07-15T20:00:00.000Z");
    const echoWithoutClientId = {
      ...serverMessage("message-31", "me", "2026-07-15T20:00:01.000Z"),
      content: "gg",
    };

    const result = reconcileIncomingChatMessages([pending], [echoWithoutClientId], new Set());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: "message-31",
      clientId: "client-B",
      status: "confirmed",
    });
  });
});
