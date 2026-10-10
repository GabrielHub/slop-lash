"use client";

// The SlopFight stage: the persistent 3D canvas, lazy-loaded by the mode's UI
// (ui/index.tsx) through next/dynamic with ssr: false. Reads the room through
// the shell's context (R3F v9 bridges React context into the canvas) and turns
// it into a StageInput. Outside a room (the creature gallery's probe) it shows
// the lobby in the default arena.
//
// URL switches: ?quality=high|medium|low pins a tier (otherwise auto),
// ?debug=1 shows the frame-time readout.

import { useEffect, useMemo, useState } from "react";
import { useOptionalRoom, type RoomContextValue } from "@/room/context";
import { parseQualityParam, type QualityTier } from "./look/quality";
import { StageCanvas } from "./stage-canvas";
import { stageInputFromView, standaloneStageInput } from "./stage-input";

/** ?quality= and ?debug=, read once (this module only ever renders in the browser). */
function readStageParams(): { quality: QualityTier | null; debug: boolean } {
  if (typeof window === "undefined") return { quality: null, debug: false };
  const search = new URLSearchParams(window.location.search);
  return { quality: parseQualityParam(search), debug: search.get("debug") === "1" };
}

export default function StageRoot() {
  const room = useOptionalRoom();
  const [params] = useState(readStageParams);
  const view = room?.view;
  const offset = room?.clockOffsetMs ?? 0;
  const live = room?.live ?? false;
  const input = useMemo(
    () => (view ? stageInputFromView(view, offset, live) : standaloneStageInput()),
    [view, offset, live],
  );
  useE2EProbe(room);
  return <StageCanvas input={input} quality={params.quality} debug={params.debug} />;
}

/**
 * Development only: the room this stage renders on `window.__slopfightStage`
 * (`view`, `clockOffsetMs`, `live`, `serverNow()`), so the E2E harness
 * (scripts/slopfight/e2e) waits on the TV's own phase changes and logs them
 * with server timestamps.
 */
function useE2EProbe(room: RoomContextValue | null): void {
  const view = room?.view;
  const offset = room?.clockOffsetMs ?? 0;
  const live = room?.live ?? false;
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !view) return;
    (window as unknown as { __slopfightStage?: unknown }).__slopfightStage = {
      view,
      clockOffsetMs: offset,
      live,
      serverNow: () => Date.now() + offset,
    };
  }, [view, offset, live]);
}
