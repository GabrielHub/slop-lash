"use client";

import dynamic from "next/dynamic";

const CreatureLab = dynamic(() => import("@/games/slopfight/stage3d/creature/lab"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the creature lab...</p>,
});

/** The lazy creature lab, full screen, outside any room (three.js loads only here). */
export function StageProbe() {
  return (
    <main data-game="slopfight" className="relative h-svh w-full overflow-hidden bg-canvas">
      <CreatureLab />
    </main>
  );
}
