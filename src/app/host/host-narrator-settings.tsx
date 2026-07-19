import { AnimatePresence, motion } from "motion/react";
import { Toggle } from "@/components/toggle";
import { getNarratorVoice, NARRATOR_VOICES } from "@/games/sloplash/voices";
import { buttonTap } from "@/lib/animations";
import type { TtsMode } from "@/lib/types";

interface HostNarratorSettingsProps {
  mode: TtsMode;
  pickerOpen: boolean;
  voice: string;
  onModeChange: (mode: TtsMode) => void;
  onPickerOpenChange: (open: boolean) => void;
  onVoiceChange: (voice: string) => void;
}

export function HostNarratorSettings({
  mode,
  pickerOpen,
  voice,
  onModeChange,
  onPickerOpenChange,
  onVoiceChange,
}: HostNarratorSettingsProps) {
  return (
    <div className="mb-6">
      <Toggle
        checked={mode === "ON"}
        onChange={(enabled) => onModeChange(enabled ? "ON" : "OFF")}
        label="Game Narrator"
        description="AI game-show host narrates the entire game aloud"
      >
        <AnimatePresence>
          {mode === "ON" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3">
                <div className="flex gap-2">
                  <motion.button
                    type="button"
                    onClick={() => {
                      onVoiceChange("RANDOM");
                      onPickerOpenChange(false);
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-semibold text-center transition-colors cursor-pointer ${
                      voice === "RANDOM"
                        ? "bg-punch/15 border-punch text-punch"
                        : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                    }`}
                    {...buttonTap}
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
                    onClick={() => onPickerOpenChange(!pickerOpen)}
                    className={`py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer ${
                      voice !== "RANDOM"
                        ? "bg-punch/15 border-punch text-punch"
                        : "bg-surface/80 border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                    }`}
                    {...buttonTap}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {voice !== "RANDOM"
                        ? (getNarratorVoice(voice)?.name ?? "Pick Voice")
                        : "Pick Voice"}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-transform duration-200"
                        style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </motion.button>
                </div>

                <AnimatePresence>
                  {pickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
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
                                onPickerOpenChange(false);
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
                              {selected && (
                                <svg
                                  className="shrink-0 text-punch"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
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
      </Toggle>
    </div>
  );
}
