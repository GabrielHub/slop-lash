"use client";

import dynamic from "next/dynamic";

const FightLab = dynamic(() => import("@/games/slopfight/stage3d/fight/fight-lab"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the fight lab...</p>,
});

/** Keeps three.js and Rapier out of the server bundle and behind one lazy import. */
export function FightLabLoader() {
  return (
    <main data-game="slopfight" className="relative h-svh w-full overflow-hidden bg-canvas">
      <FightLab />
    </main>
  );
}
