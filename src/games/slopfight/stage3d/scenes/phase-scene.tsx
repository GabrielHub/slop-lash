"use client";

// The phase slot. One scene per phase renders inside the persistent canvas;
// the Wave 3 workstreams register theirs in PHASE_SCENES (scenes/registry.ts)
// and until then a placeholder names the phase on the set's marquee.
//
// PhaseScene also runs the default direction for every phase change: the
// entry transition (slam, wipe, ...) and, at its covered moment, the cut to
// the phase's base shot and a clock resync (the presentation clock absorbs
// any hit-stop / slow-mo debt on a hard cut). A registered scene can take
// over by setting `ownsDirection` in its PHASE_DIRECTION entry.

import { Suspense, useEffect, useRef, type ReactNode } from "react";
import type { ArenaNodes } from "../arena/nodes";
import { StageBoundary } from "../boundary";
import type { ShotRequest } from "../director/director";
import type { ShotId } from "../director/shots";
import type { TransitionKind } from "../events";
import { useArenaNodes, useStage } from "../services";
import type { StageInput, StagePhase } from "../stage-input";
import { fitTextSize, MARQUEE_TEXT, OnPlane, StageText } from "../ui3d/text";
import { PHASE_SCENES } from "./registry";

export interface PhaseSceneProps {
  input: StageInput;
  nodes: ArenaNodes | null;
}

export interface PhaseDirection {
  /** What the marquee says during the phase. */
  marquee: string;
  /** The phase's base shot. */
  shot: ShotId;
  request?: ShotRequest;
  /** The entry transition when the phase changes. */
  enter: Exclude<TransitionKind, "matchCut">;
  /** Slam text (defaults to the marquee). */
  slam?: string;
  /** The podium is up in this phase. */
  showPodium?: boolean;
  /** The registered scene runs its own transitions and shots. */
  ownsDirection?: boolean;
}

export const PHASE_DIRECTION: Record<StagePhase, PhaseDirection> = {
  LOBBY: { marquee: "SLOPFIGHT", shot: "crane_establish", request: { duration: 8 }, enter: "cut" },
  BUILD: { marquee: "BUILD", shot: "easels", enter: "wipe" },
  FOUNDRY: { marquee: "THE FOUNDRY", shot: "foundry", enter: "wipe" },
  ROSTER: { marquee: "THE ROSTER", shot: "roster", enter: "wipe" },
  // The fight workstream's FACE_OFF scene runs its own entry (the match cut from the roster).
  FACE_OFF: { marquee: "FACE-OFF", shot: "face_off_low", request: { side: "A" }, enter: "slam", ownsDirection: true },
  FIGHT: { marquee: "FIGHT!", shot: "fight_wide", enter: "slam" },
  RESULT: { marquee: "RESULT", shot: "winner_pose", enter: "wipe" },
  STANDINGS: { marquee: "STANDINGS", shot: "scoreboard", enter: "wipe" },
  UPGRADE: { marquee: "UPGRADES", shot: "easels", enter: "wipe" },
  FINISHED: { marquee: "CHAMPION", shot: "podium", enter: "slam", showPodium: true },
};

/** Run the entry transition and the base-shot cut whenever the phase key changes. */
function usePhaseDirection(input: StageInput) {
  const services = useStage();
  const last = useRef<string | null>(null);
  const { phase, phaseKey } = input;

  useEffect(() => {
    const direction = PHASE_DIRECTION[phase];
    const first = last.current === null;
    if (last.current === phaseKey) return;
    last.current = phaseKey;
    if (direction.ownsDirection) return;
    const { director, transitions, clock } = services;
    const cover = () => {
      clock.resync();
      director.setBase(direction.shot, direction.request ?? {});
    };
    if (first || direction.enter === "cut") {
      cover();
      return;
    }
    switch (direction.enter) {
      case "slam":
        void transitions.play("slam", { text: direction.slam ?? direction.marquee, onCover: cover });
        break;
      case "wipe":
        void transitions.play("wipe", { onCover: cover });
        break;
      case "iris":
        void transitions.play("iris", { target: null, full: true, onCover: cover });
        break;
      case "letterboxIn":
      case "letterboxOut":
        void transitions.play(direction.enter, { onCover: cover });
        break;
    }
  }, [services, phase, phaseKey]);
}

/** The phase's name on the set's marquee, in its own colours. */
export function MarqueeSign({ nodes, text }: { nodes: ArenaNodes | null; text: string }) {
  const plane = nodes?.marqueeText;
  if (!plane) return null;
  const color = plane.textColor ?? "#fff2c2";
  const size = fitTextSize(text, plane.width * 0.88, plane.height * 0.66);
  return (
    <OnPlane plane={plane}>
      {plane.bgColor && (
        <mesh position={[0, 0, -0.006]} receiveShadow>
          <planeGeometry args={[plane.width, plane.height]} />
          <meshStandardMaterial color={plane.bgColor} roughness={0.85} />
        </mesh>
      )}
      <StageText {...MARQUEE_TEXT} size={size} color={color}>
        {text}
      </StageText>
    </OnPlane>
  );
}

/** The scoreboard's resting card: the round and, in the lobby, the room code. */
export function ScoreboardSign({ nodes, lines }: { nodes: ArenaNodes | null; lines: readonly string[] }) {
  const plane = nodes?.scoreboardText;
  if (!plane || lines.length === 0) return null;
  const color = plane.textColor ?? "#f4f0e0";
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
  const size = fitTextSize(longest, plane.width * 0.85, (plane.height * 0.7) / lines.length);
  return (
    <OnPlane plane={plane}>
      {plane.bgColor && (
        <mesh position={[0, 0, -0.006]} receiveShadow>
          <planeGeometry args={[plane.width, plane.height]} />
          <meshStandardMaterial color={plane.bgColor} roughness={0.9} />
        </mesh>
      )}
      <StageText {...MARQUEE_TEXT} size={size} color={color} lineHeight={1.2}>
        {lines.join("\n")}
      </StageText>
    </OnPlane>
  );
}

/** Until a phase's scene lands: the phase on the marquee, the round on the scoreboard. */
export function PlaceholderScene({ input, nodes }: PhaseSceneProps) {
  const lines =
    input.phase === "LOBBY"
      ? input.roomCode
        ? ["JOIN THE FIGHT", `CODE ${input.roomCode}`]
        : ["TONIGHT", "THREE ARENAS"]
      : [`ROUND ${input.round}`];
  return (
    <>
      <MarqueeSign nodes={nodes} text={PHASE_DIRECTION[input.phase].marquee} />
      <ScoreboardSign nodes={nodes} lines={lines} />
    </>
  );
}

export function PhaseScene({ input, children }: { input: StageInput; children?: ReactNode }) {
  usePhaseDirection(input);
  const nodes = useArenaNodes();
  const Scene = PHASE_SCENES[input.phase] ?? PlaceholderScene;
  const arena = nodes?.arena ?? "none";
  // A scene that throws drops back to the placeholder instead of taking the
  // canvas down; the next phase (or set) tries the registered scene again.
  return (
    <Suspense fallback={null}>
      <StageBoundary
        label={`${input.phase} scene`}
        resetKey={`${input.phaseKey}:${arena}`}
        fallback={<PlaceholderScene input={input} nodes={nodes} />}
      >
        <Scene key={`${input.phase}:${arena}`} input={input} nodes={nodes} />
      </StageBoundary>
      {children}
    </Suspense>
  );
}
