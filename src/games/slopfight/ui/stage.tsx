"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { useRoom } from "@/room/context";
import { LobbyBridge } from "../stage3d/scenes/lobby-bridge";
import { RecapFallback } from "./recap-fallback";

// The TV: one full-bleed canvas from the lobby to the podium, with nothing
// drawn over it. The lobby lives in the scene (room code, QR, seats and the
// host's START button); LobbyBridge runs the shell's lobby hooks (join
// sounds, Enter/Space for START) in the DOM and hands them to the scene. The
// 3D layer is reachable only through the `next/dynamic` import below, so
// phones and the lobby routes never fetch it. A recap opened on a device
// without WebGL gets the night in words instead (RecapFallback).

function StageLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center portrait:min-h-svh">
      <p className="rounded-2xl border-2 border-edge bg-surface px-[1.5rem] py-[1rem] font-display text-[1.25rem] font-bold text-ink-dim">
        Setting up the arena...
      </p>
    </div>
  );
}

const StageRoot = dynamic(() => import("../stage3d/stage-root"), {
  ssr: false,
  loading: StageLoading,
});

let webgl2: boolean | null = null;

/** Whether this browser can create a WebGL2 context (the stage needs one). */
function hasWebGL2(): boolean {
  if (webgl2 === null) {
    try {
      webgl2 = document.createElement("canvas").getContext("webgl2") !== null;
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

const noSubscribe = () => () => {};

export function SlopfightStage() {
  const { live } = useRoom();
  // The server renders the canvas path; the client corrects it after hydration.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL2, () => true);
  if (!live && !webgl) return <RecapFallback />;
  return (
    <div className="relative flex-1 overflow-hidden portrait:min-h-svh">
      <LobbyBridge>
        <StageRoot />
      </LobbyBridge>
    </div>
  );
}
