"use client";

import dynamic from "next/dynamic";

const StageLab = dynamic(() => import("@/games/slopfight/stage3d/dev/stage-lab"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the stage lab...</p>,
});

/** Keeps three.js out of the server bundle and behind one lazy import. */
export function StageLabLoader() {
  return (
    <main data-game="slopfight" className="relative h-svh w-full overflow-hidden bg-canvas">
      <StageLab />
    </main>
  );
}
