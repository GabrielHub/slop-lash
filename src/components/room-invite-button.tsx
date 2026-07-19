"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { buildRoomInviteShareData } from "@/lib/room-invite";
import {
  shareRoomInvite,
  type RoomInviteShareData,
  type RoomInviteShareOutcome,
} from "@/lib/room-invite-share";

type InviteButtonTone = "default" | "chat" | "match" | "quiz";
type InviteButtonStatus = "idle" | "sharing" | RoomInviteShareOutcome;

const TONE_STYLES: Record<InviteButtonTone, CSSProperties> = {
  default: {
    background: "var(--surface)",
    borderColor: "var(--edge)",
    color: "var(--ink)",
  },
  chat: {
    background: "var(--cs-raised)",
    borderColor: "var(--cs-edge)",
    color: "var(--cs-ink)",
  },
  match: {
    background: "var(--ms-raised)",
    borderColor: "var(--ms-edge)",
    color: "var(--ms-ink)",
  },
  quiz: {
    background: "var(--qs-raised)",
    borderColor: "var(--qs-edge)",
    color: "var(--qs-ink)",
  },
};

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.7 6.8-4.4M8.6 13.3l6.8 4.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function getButtonLabel(status: InviteButtonStatus): string {
  switch (status) {
    case "sharing":
      return "Opening share...";
    case "shared":
      return "Invite shared";
    case "copied":
      return "Invite link copied";
    case "failed":
      return "Copy failed";
    case "canceled":
    case "idle":
      return "Share invite";
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

export function RoomInviteButton({
  roomCode,
  tone = "default",
  compact = false,
  className = "",
  style,
}: {
  roomCode: string;
  tone?: InviteButtonTone;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [status, setStatus] = useState<InviteButtonStatus>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharingRef = useRef(false);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const showFeedback = useCallback((outcome: RoomInviteShareOutcome) => {
    setStatus(outcome === "canceled" ? "idle" : outcome);
    if (outcome === "canceled") return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setStatus("idle"), 2200);
  }, []);

  const handleShare = useCallback(async () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setStatus("sharing");
    try {
      const data: RoomInviteShareData = buildRoomInviteShareData(window.location.origin, roomCode);
      const nativeShare =
        typeof navigator.share === "function"
          ? (shareData: typeof data) => navigator.share(shareData)
          : undefined;
      showFeedback(
        await shareRoomInvite(data, {
          share: nativeShare,
          copyText: copyTextToClipboard,
        }),
      );
    } catch {
      showFeedback("failed");
    } finally {
      sharingRef.current = false;
    }
  }, [roomCode, showFeedback]);

  const complete = status === "shared" || status === "copied";

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      disabled={status === "sharing"}
      aria-label={`Share invite to room ${roomCode}`}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border font-display text-sm font-bold transition-[filter,opacity,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${compact ? "px-3 py-2" : "px-4 py-3"} ${className}`}
      style={{ ...TONE_STYLES[tone], ...style }}
    >
      {complete ? <CheckIcon /> : <ShareIcon />}
      <span aria-live="polite">{getButtonLabel(status)}</span>
    </button>
  );
}
