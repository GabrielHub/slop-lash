"use client";

import { motion } from "motion/react";
import { ModelIcon } from "@/components/model-icon";
import { Toggle } from "@/components/toggle";
import { buttonTap } from "@/lib/animations";
import { AI_MODELS, type AIModel } from "@/lib/models";

export type QuizSlopContentSource = "CATALOG" | "AI";

export function QuizSlopContentSourceField({
  contentSource,
  verifier,
  onChange,
}: {
  contentSource: QuizSlopContentSource;
  verifier: AIModel | undefined;
  onChange: (source: QuizSlopContentSource) => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border-2 border-edge bg-surface/70 p-4">
      <p className="mb-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-ink-dim/70">
        Question source
      </p>
      <Toggle
        checked={contentSource === "AI"}
        onChange={(enabled) => onChange(enabled ? "AI" : "CATALOG")}
        label="Fresh AI Question Pack"
        description={
          contentSource === "AI"
            ? "Your chosen model writes a frozen question pack before play. A separate house verifier checks it; unsafe packs fall back to the catalog."
            : "Uses the reviewed catalog. Fast, dependable, and legally distinct from studying."
        }
      />
      {contentSource === "AI" && verifier ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-ai/30 bg-ai-soft/35 px-3 py-2.5">
          <ModelIcon model={verifier} size={22} className="shrink-0" />
          <p className="min-w-0 text-sm leading-relaxed text-ink-dim">
            <span className="font-semibold text-ink">{verifier.name}</span> handles the fixed
            verifier pass after the generator writes each batch.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function QuizSlopGeneratorPicker({
  selectedModelId,
  onChange,
}: {
  selectedModelId: string;
  onChange: (modelId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-ink-dim/70">
          Question Generator
        </p>
        <span className="text-xs text-ink-dim/70">one model, no AI players</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {AI_MODELS.map((model) => {
          const selected = selectedModelId === model.id;
          return (
            <motion.button
              type="button"
              key={model.id}
              onClick={() => onChange(model.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                selected
                  ? "border-ai bg-ai-soft/80 text-ink"
                  : "border-edge bg-surface/80 text-ink-dim hover:border-edge-strong hover:text-ink"
              }`}
              layout
              {...buttonTap}
            >
              <ModelIcon model={model} size={24} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{model.name}</span>
                  <span className="shrink-0 text-xs text-ink-dim/60">{model.provider}</span>
                </span>
                <span className="font-mono text-xs text-ink-dim/70">
                  rewrites reviewed facts into a frozen question pack
                </span>
              </span>
              {selected ? (
                <span
                  aria-label="Selected"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ai text-xs font-black text-accent-ink"
                >
                  ✓
                </span>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
