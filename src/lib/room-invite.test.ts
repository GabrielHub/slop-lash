import { describe, expect, test } from "vite-plus/test";
import {
  buildRoomInvitePath,
  buildRoomInviteShareData,
  getRoomInviteDetails,
  isRoomInviteCode,
  normalizeRoomInviteCode,
} from "./room-invite";

describe("room invites", () => {
  test("normalizes and validates current room codes", () => {
    expect(normalizeRoomInviteCode(" abc234 ")).toBe("ABC234");
    expect(isRoomInviteCode("abc234")).toBe(true);
    expect(isRoomInviteCode("ABCI01")).toBe(false);
    expect(isRoomInviteCode("ABC23")).toBe(false);
  });

  test("builds a capability-free join URL", () => {
    expect(buildRoomInvitePath("abc234")).toBe("/join/ABC234");
  });

  test("builds consistent preview and native-share copy", () => {
    expect(getRoomInviteDetails("ABC234")).toEqual({
      roomCode: "ABC234",
      path: "/join/ABC234",
      title: "Join room ABC234",
      description: "Join room ABC234 in SlopBox Party Pack — party games where AI plays too.",
    });
    expect(buildRoomInviteShareData("https://example.com", "ABC234")).toEqual({
      title: "Join my SlopBox room",
      text: "Join my SlopBox room ABC234.",
      url: "https://example.com/join/ABC234",
    });
  });

  test("rejects malformed room codes instead of creating misleading links", () => {
    expect(() => buildRoomInvitePath("not-a-room")).toThrow("Invalid room invite code");
  });
});
