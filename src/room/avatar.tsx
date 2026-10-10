"use client";

import { ModelIcon } from "@/components/model-icon";
import { getModelByModelId } from "@/lib/models";
import { getPlayerColor } from "@/lib/player-colors";

/**
 * A round player token sized in CSS units (rem on the stage, so it scales with
 * the TV): the model's icon for an AI, the initial in the player's colour for
 * a human.
 */
export function Avatar({
  name,
  modelId,
  size,
  className = "",
}: {
  name: string;
  modelId: string | null;
  /** Any CSS length, e.g. "5rem" or "28px". */
  size: string;
  className?: string;
}) {
  const model = modelId ? getModelByModelId(modelId) : null;
  const color = model ? "var(--ai-badge)" : getPlayerColor(name);
  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 select-none items-center justify-center rounded-full font-display font-extrabold leading-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: `calc(${size} * 0.46)`,
        color,
        background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
        boxShadow: `inset 0 0 0 calc(${size} * 0.045) color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {model ? (
        <ModelIcon model={model} size={96} className="size-[58%] object-contain" />
      ) : (
        (name.trim()[0]?.toUpperCase() ?? "?")
      )}
    </span>
  );
}
