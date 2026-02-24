"use client";

import Image from "next/image";
import { GamePlayer } from "@/lib/types";
import { getModelByModelId, getModelIconForTheme } from "@/lib/models";
import { useTheme } from "@/components/theme-provider";

export function PlayerList({
  players,
  showScores = false,
}: {
  players: GamePlayer[];
  showScores?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <div className="space-y-2">
      {players.map((player, i) => {
        const model = player.modelId
          ? getModelByModelId(player.modelId)
          : null;
        const iconSrc = model ? getModelIconForTheme(model, theme) : null;

        return (
          <div
            key={player.id}
            className={`flex items-center justify-between p-3 rounded-xl bg-surface border-2 border-edge animate-fade-in-up delay-${Math.min(i + 1, 8)}`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {iconSrc ? (
                <Image
                  src={iconSrc}
                  alt={model?.provider ?? ""}
                  width={22}
                  height={22}
                  className="rounded-sm shrink-0"
                />
              ) : (
                <span className="w-[22px] h-[22px] flex items-center justify-center rounded-sm bg-human-soft text-human text-xs font-bold shrink-0">
                  H
                </span>
              )}
              <span className="font-semibold text-sm truncate">
                {player.name}
              </span>
              {player.type === "AI" && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-ai-soft text-ai shrink-0">
                  AI
                </span>
              )}
            </div>
            {showScores && (
              <span className="font-mono font-bold text-gold text-sm tabular-nums">
                {player.score}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
