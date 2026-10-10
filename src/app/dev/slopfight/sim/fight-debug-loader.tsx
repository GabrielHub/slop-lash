"use client";

import dynamic from "next/dynamic";

const FightDebugView = dynamic(() => import("@/games/slopfight/stage3d/fight/debug-view"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the fight sim...</p>,
});

/** Keeps three.js and Rapier out of the server bundle and behind one lazy import. */
export function FightDebugLoader() {
  return (
    <main data-game="slopfight" className="relative h-svh w-full overflow-hidden bg-canvas">
      <FightDebugView />
    </main>
  );
}
