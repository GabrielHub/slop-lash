"use client";

import { AudioControls } from "@/components/audio-controls";

export function QuizslopSoundToggle() {
  return (
    <AudioControls className="[&_button]:min-h-11 [&_button]:min-w-11" color="var(--qs-ink-dim)" />
  );
}
