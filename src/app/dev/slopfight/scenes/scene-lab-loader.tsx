"use client";

import dynamic from "next/dynamic";

const SceneLab = dynamic(() => import("@/games/slopfight/stage3d/scenes/dev/scene-lab"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the scene lab...</p>,
});

/** Keeps three.js out of the server bundle and behind one lazy import. */
export function SceneLabLoader() {
  return (
    <main data-game="slopfight" className="relative flex h-svh w-full overflow-hidden bg-canvas">
      <SceneLab />
    </main>
  );
}
