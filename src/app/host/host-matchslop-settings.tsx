"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { ModelIcon } from "@/components/model-icon";
import type { MatchSlopIdentity } from "@/games/matchslop/identities";
import { collapse, press } from "@/lib/animations";
import { AI_MODELS, type AIModel } from "@/lib/models";
import { getCostTier, MATCHSLOP_IDENTITY_OPTIONS } from "./host-model-options";

function IdentityChips({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MatchSlopIdentity;
  onChange: (identity: MatchSlopIdentity) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-24 shrink-0 text-sm text-ink-dim">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {MATCHSLOP_IDENTITY_OPTIONS.map((identity) => {
          const selected = value === identity.id;
          return (
            <motion.button
              key={identity.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(identity.id)}
              className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                selected
                  ? "bg-punch/15 text-punch ring-2 ring-punch/50"
                  : "bg-surface text-ink-dim ring-1 ring-edge hover:ring-edge-strong hover:text-ink"
              }`}
              {...press}
            >
              {identity.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** Who the table is and who the shared AI date is looking for. */
export function MatchSlopDatingSetup({
  seekerIdentity,
  personaIdentity,
  onSeekerChange,
  onPersonaChange,
}: {
  seekerIdentity: MatchSlopIdentity;
  personaIdentity: MatchSlopIdentity;
  onSeekerChange: (identity: MatchSlopIdentity) => void;
  onPersonaChange: (identity: MatchSlopIdentity) => void;
}) {
  return (
    <div className="space-y-2.5 px-4 py-4">
      <p className="text-sm font-semibold text-ink">Dating setup</p>
      <IdentityChips label="I'm a" value={seekerIdentity} onChange={onSeekerChange} />
      <IdentityChips label="Looking for" value={personaIdentity} onChange={onPersonaChange} />
    </div>
  );
}

/** Which model plays the date. Password tier only; Free Play pins it to Claude Haiku. */
export function PersonaModelPicker({
  selectedModel,
  pickedModelId,
  teammateIds,
  onPick,
}: {
  selectedModel: AIModel | undefined;
  pickedModelId: string | null;
  /** Models already in the AI lineup, flagged in the list. */
  teammateIds: readonly string[];
  onPick: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-4">
      <p className="mb-2 text-sm font-semibold text-ink">Date played by</p>
      <motion.button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-12 w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-3 text-left transition-colors ${
          open ? "border-punch bg-punch/10" : "border-edge bg-surface hover:border-edge-strong"
        }`}
        {...press}
      >
        {selectedModel && <ModelIcon model={selectedModel} size={22} className="shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {selectedModel?.name ?? "Pick a model"}
        </span>
        <ChevronDownIcon
          size={14}
          className={`shrink-0 text-ink-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={collapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border-2 border-edge bg-surface">
              {AI_MODELS.map((model) => {
                const selected = pickedModelId === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onPick(model.id);
                      setOpen(false);
                    }}
                    className={`flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-edge/40 px-3 py-2 text-left transition-colors last:border-b-0 ${
                      selected ? "bg-punch/10" : "hover:bg-raised/60"
                    }`}
                  >
                    <ModelIcon model={model} size={20} className="shrink-0" />
                    <span
                      className={`min-w-0 flex-1 truncate text-sm font-semibold ${selected ? "text-punch" : "text-ink"}`}
                    >
                      {model.name}
                    </span>
                    {teammateIds.includes(model.id) && (
                      <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-xs font-medium text-ink-dim">
                        In lineup
                      </span>
                    )}
                    <span className="w-8 shrink-0 text-right font-mono text-xs text-ink-dim">
                      {getCostTier(model)}
                    </span>
                    <span className="w-4 shrink-0 text-punch">
                      {selected && <CheckIcon size={16} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
