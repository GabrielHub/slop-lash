"use client";

import type { GameType } from "@/games/core/types";
import { GameShell } from "@/components/game-shell";
import { ControllerShell } from "@/components/controller-shell";
import { ChatGameShell } from "@/games/ai-chat-showdown/ui/chat-game-shell";
import { ChatControllerShell } from "@/games/ai-chat-showdown/ui/chat-controller-shell";

export function GameShellResolver({
  code,
  gameType,
  viewMode = "game",
}: {
  code: string;
  gameType: GameType;
  viewMode?: "game" | "stage";
}) {
  switch (gameType) {
    case "AI_CHAT_SHOWDOWN":
      return <ChatGameShell code={code} viewMode={viewMode} />;
    case "SLOPLASH":
    default:
      return <GameShell code={code} viewMode={viewMode} />;
  }
}

export function ControllerShellResolver({
  code,
  gameType,
}: {
  code: string;
  gameType: GameType;
}) {
  switch (gameType) {
    case "AI_CHAT_SHOWDOWN":
      return <ChatControllerShell code={code} />;
    case "SLOPLASH":
    default:
      return <ControllerShell code={code} />;
  }
}
