"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildRoomInviteShareData } from "@/lib/room-invite";
import { recapPath } from "./session";
import {
  shareRoomInvite,
  type RoomInviteShareData,
  type RoomInviteShareOutcome,
} from "@/lib/room-invite-share";

export type ShareStatus = "idle" | "sharing" | RoomInviteShareOutcome;

/** What a share control says for its current state; `idle` is the caller's own label. */
export function shareStatusLabel(status: ShareStatus, idle: string): string {
  switch (status) {
    case "sharing":
      return "Opening share...";
    case "shared":
      return "Shared";
    case "copied":
      return "Link copied";
    case "failed":
      return "Couldn't copy the link";
    case "canceled":
    case "idle":
      return idle;
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy selection path for restricted browsers.
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

/** The invite for a room: a `/join/CODE` link that prefills the code. */
export function inviteShareData(roomCode: string): RoomInviteShareData {
  return buildRoomInviteShareData(window.location.origin, roomCode);
}

/** A finished game's results page; `gameNumber` picks which game of the room. */
export function recapShareData(
  roomCode: string,
  gameName: string,
  gameNumber = 1,
): RoomInviteShareData {
  return {
    title: `${gameName} results`,
    text: `How our ${gameName} game went.`,
    url: new URL(recapPath(roomCode, gameNumber), window.location.origin).toString(),
  };
}

/**
 * Shares a link through the phone's native share sheet, or copies it where
 * there is none. `status` reports the outcome for two seconds, then resets.
 */
export function useShareLink() {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharingRef = useRef(false);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const share = useCallback(async (build: () => RoomInviteShareData) => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setStatus("sharing");
    let outcome: RoomInviteShareOutcome;
    try {
      const data = build();
      const nativeShare =
        typeof navigator.share === "function"
          ? (shareData: RoomInviteShareData) => navigator.share(shareData)
          : undefined;
      outcome = await shareRoomInvite(data, { share: nativeShare, copyText: copyTextToClipboard });
    } catch {
      outcome = "failed";
    } finally {
      sharingRef.current = false;
    }
    setStatus(outcome === "canceled" ? "idle" : outcome);
    if (outcome === "canceled") return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setStatus("idle"), 2200);
  }, []);

  return { status, share, done: status === "shared" || status === "copied" };
}
