import type { buildRoomInviteShareData } from "./room-invite";

export type RoomInviteShareData = ReturnType<typeof buildRoomInviteShareData>;
export type RoomInviteShareOutcome = "shared" | "copied" | "canceled" | "failed";

interface RoomInviteShareHandlers {
  share?: (data: RoomInviteShareData) => Promise<void>;
  copyText: (text: string) => Promise<boolean>;
}

function isCanceledShare(cause: unknown): boolean {
  return (
    typeof cause === "object" && cause !== null && "name" in cause && cause.name === "AbortError"
  );
}

export async function shareRoomInvite(
  data: RoomInviteShareData,
  handlers: RoomInviteShareHandlers,
): Promise<RoomInviteShareOutcome> {
  if (handlers.share) {
    try {
      await handlers.share(data);
      return "shared";
    } catch (cause) {
      if (isCanceledShare(cause)) return "canceled";
    }
  }

  return (await handlers.copyText(data.url)) ? "copied" : "failed";
}
