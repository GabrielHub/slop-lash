"use client";

import { getModelByModelId } from "@/lib/models";
import { getPlayerColor } from "@/lib/player-colors";
import { ModelIcon } from "@/components/model-icon";

interface PlayerAvatarProps {
  name: string;
  modelId: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders a model icon for AI players or a colored-initial badge for humans.
 * Consolidates the repeated avatar pattern used across scoreboard, carousel,
 * leaderboard, and voting components.
 */
export function PlayerAvatar({
  name,
  modelId,
  size = 22,
  className = "",
}: PlayerAvatarProps) {
  const model = modelId ? getModelByModelId(modelId) : null;

  if (model) {
    return <ModelIcon model={model} size={size} className={`shrink-0 ${className}`} />;
  }

  const color = getPlayerColor(name);
  return (
    <span
      className={`flex items-center justify-center rounded-sm font-bold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(size - 8, 10),
        color,
        backgroundColor: `${color}20`,
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
