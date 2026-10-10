"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { getNarratorVoice, NARRATOR_VOICES } from "@/games/sloplash/voices";
import { collapse, press } from "@/lib/animations";
import { OptionSwitch } from "./host-option-switch";

export type TtsMode = "ON" | "OFF";

interface HostNarratorSettingsProps {
  mode: TtsMode;
  voice: string;
  onModeChange: (mode: TtsMode) => void;
  onVoiceChange: (voice: string) => void;
}

/** The password tier's narrator switch, with a voice picker once it is on. */
export function HostNarratorSettings({
  mode,
  voice,
  onModeChange,
  onVoiceChange,
}: HostNarratorSettingsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <OptionSwitch
      checked={mode === "ON"}
      onChange={(enabled) => onModeChange(enabled ? "ON" : "OFF")}
      label="Narrator"
    >
      <AnimatePresence>
        {mode === "ON" && (
          <motion.div
            variants={collapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="pb-3">
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={() => {
                    onVoiceChange("RANDOM");
                    setPickerOpen(false);
                  }}
                  className={`flex-1 h-11 px-3 rounded-xl border-2 text-sm font-semibold text-center transition-colors cursor-pointer ${
                    voice === "RANDOM"
                      ? "bg-punch/15 border-punch text-punch"
                      : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                  }`}
                  {...press}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                    Random
                  </span>
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setPickerOpen(!pickerOpen)}
                  className={`h-11 px-4 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer ${
                    voice !== "RANDOM"
                      ? "bg-punch/15 border-punch text-punch"
                      : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                  }`}
                  {...press}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {voice !== "RANDOM"
                      ? (getNarratorVoice(voice)?.name ?? "Pick Voice")
                      : "Pick Voice"}
                    <ChevronDownIcon
                      size={12}
                      className={`transition-transform duration-200 ${pickerOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </motion.button>
              </div>

              <AnimatePresence>
                {pickerOpen && (
                  <motion.div
                    variants={collapse}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="overflow-hidden"
                  >
                    <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border-2 border-edge bg-surface">
                      {NARRATOR_VOICES.map((option) => {
                        const selected = voice === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              onVoiceChange(option.id);
                              setPickerOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer border-b border-edge/40 last:border-b-0 ${
                              selected ? "bg-punch/10" : "hover:bg-raised/60"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-semibold text-sm ${selected ? "text-punch" : "text-ink"}`}
                                >
                                  {option.name}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                                    selected ? "bg-punch/15 text-punch" : "bg-raised text-ink-dim"
                                  }`}
                                >
                                  {option.trait}
                                </span>
                              </div>
                              <p
                                className={`text-xs mt-0.5 leading-snug ${
                                  selected ? "text-punch/70" : "text-ink-dim"
                                }`}
                              >
                                {option.description}
                              </p>
                            </div>
                            {selected && <CheckIcon size={16} className="shrink-0 text-punch" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </OptionSwitch>
  );
}
