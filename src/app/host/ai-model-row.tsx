"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { CheckIcon } from "@/components/icons";
import { ModelIcon } from "@/components/model-icon";
import { press } from "@/lib/animations";
import type { AIModel } from "@/lib/models";

/** One selectable AI player in the host page roster. */
export function AiModelRow({
  model,
  selected,
  disabled = false,
  detail,
  onClick,
}: {
  model: AIModel;
  selected: boolean;
  disabled?: boolean;
  detail: ReactNode;
  onClick: () => void;
}) {
  let stateClass: string;
  if (selected) {
    stateClass = "bg-ai-soft/80 border-ai text-ink";
  } else if (disabled) {
    stateClass = "bg-surface/80 border-edge text-ink-dim opacity-45";
  } else {
    stateClass = "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink";
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`w-full min-h-14 px-3 py-2 rounded-xl border-2 text-left transition-colors flex items-center gap-3 cursor-pointer disabled:cursor-not-allowed ${stateClass}`}
      layout
      {...press}
    >
      <ModelIcon model={model} size={24} className="shrink-0" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm truncate">{model.name}</span>
          <span className="text-xs text-ink-dim/70 shrink-0">{model.provider}</span>
        </div>
        <span className="text-xs text-ink-dim">{detail}</span>
      </div>
      {selected && <CheckIcon className="ml-auto shrink-0 text-ai" />}
    </motion.button>
  );
}
