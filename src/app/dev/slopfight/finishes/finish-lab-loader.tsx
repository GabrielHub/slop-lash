"use client";

import dynamic from "next/dynamic";

const FinishLab = dynamic(() => import("@/games/slopfight/stage3d/creature/finish-lab"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the finish lab...</p>,
});

/** Keeps three.js out of the server bundle and behind one lazy import. */
export function FinishLabLoader() {
  return (
    <main data-game="slopfight" className="relative h-svh w-full overflow-hidden bg-canvas">
      <FinishLab />
    </main>
  );
}
