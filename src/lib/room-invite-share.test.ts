import { describe, expect, test, vi } from "vite-plus/test";
import { shareRoomInvite, type RoomInviteShareData } from "./room-invite-share";

const invite: RoomInviteShareData = {
  title: "Join my SlopBox room",
  text: "Join my SlopBox room ABC234.",
  url: "https://example.com/join/ABC234",
};

describe("shareRoomInvite", () => {
  test("uses native sharing when available", async () => {
    const share = vi.fn(async () => undefined);
    const copyText = vi.fn(async () => true);

    await expect(shareRoomInvite(invite, { share, copyText })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(invite);
    expect(copyText).not.toHaveBeenCalled();
  });

  test("does nothing when the native share sheet is canceled", async () => {
    const canceled = { name: "AbortError" };
    const copyText = vi.fn(async () => true);

    await expect(
      shareRoomInvite(invite, {
        share: vi.fn(async () => Promise.reject(canceled)),
        copyText,
      }),
    ).resolves.toBe("canceled");
    expect(copyText).not.toHaveBeenCalled();
  });

  test("copies the link when native sharing is unavailable or fails", async () => {
    const copyText = vi.fn(async () => true);
    await expect(shareRoomInvite(invite, { copyText })).resolves.toBe("copied");
    await expect(
      shareRoomInvite(invite, {
        share: vi.fn(async () => Promise.reject(new Error("Blocked"))),
        copyText,
      }),
    ).resolves.toBe("copied");
    expect(copyText).toHaveBeenCalledTimes(2);
  });

  test("reports when neither sharing nor copying succeeds", async () => {
    await expect(shareRoomInvite(invite, { copyText: vi.fn(async () => false) })).resolves.toBe(
      "failed",
    );
  });
});
