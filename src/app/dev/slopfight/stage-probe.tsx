"use client";

import dynamic from "next/dynamic";

const StageRoot = dynamic(() => import("@/games/slopfight/stage3d/stage-root"), {
  ssr: false,
  loading: () => <p className="p-4 text-ink-dim">Loading the 3D stage...</p>,
});

/** The lazy stage probe, full screen, outside any room. */
export function StageProbe() {
  return (
    <main data-game="slopfight" className="relative h-svh w-full overflow-hidden bg-canvas">
      <StageRoot />
    </main>
  );
}
