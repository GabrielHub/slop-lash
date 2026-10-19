"use client";

// BUILD, FOUNDRY and UPGRADE share one set-up: the easels on one side of the
// set (one per player, live strokes or the typing shimmer), the pedestals on
// the other (the forge beats, see forge.tsx), the marquee and the clock.
//
// Direction: PhaseScene runs the entry (wipe) and the base shot (the easels
// at Build and Upgrade). The scene carries over between Build or Upgrade and
// the Foundry. It adds transient cuts to the foundry for the beats there: a
// forge starting (after its drawing peels off the easel), the name card
// dropping, the sketch dissolving. Once every player's champion is in, the
// base moves to the foundry for good (after the last drawing's peel), so the
// room watches the forging instead of empty easels and FOUNDRY opens there
// with no cut. The conveyor hum runs while anything forges (live rooms only).

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { getArena, type ArenaId } from "../../arenas";
import { sfx } from "../../audio";
import { warmMesher } from "../creature/creature";
import { useStage } from "../services";
import { ClockRing } from "../ui3d/clock-ring";
import { useDoodleTexture } from "./doodle-texture";
import { easelFor, nodePoint, SceneMarquee, useSceneData } from "./common";
import { Easel, HiddenEasel } from "./easel";
import { ForgePedestal, type ForgeBeat } from "./forge";
import type { PhaseSceneProps } from "./phase-scene";
import type { SceneFighter } from "./scene-data";
import type { ArenaNodes } from "../arena/nodes";
import type { StagePhase } from "../stage-input";

const NO_ARENAS: readonly ArenaId[] = [];

interface Pending {
  at: number;
  run: () => void;
}

/** A drawing's peel off the easel plays this long before the camera leaves it. */
const PEEL_WATCH_MS = 1_500;
/** A typed champion's easel shows its send this long. */
const SEND_WATCH_MS = 300;

/** The layer this phase draws on: 0 at Build, the round's at Upgrade (and its Foundry). */
function topLayerOf(phase: StagePhase, round: number): number {
  return phase === "UPGRADE" || (phase === "FOUNDRY" && round > 1) ? round : 0;
}

/** Its champion for this phase has gone to the Foundry (or come back from it). */
function sentThisPhase(fighter: SceneFighter, topLayer: number): boolean {
  const sent = fighter.status === "FORGING" || fighter.status === "READY" || fighter.status === "FAILED";
  const upgraded = topLayer > 0 ? fighter.version >= topLayer || fighter.status === "FORGING" : true;
  return sent && upgraded;
}

/**
 * Server ms when the camera turns to the foundry for good: once every
 * player's champion is in (always in FOUNDRY), after the last one's send
 * played on its easel. Null while anyone is still drawing or typing.
 */
export function foundryTurnAt(fighters: readonly SceneFighter[], phase: StagePhase, round: number): number | null {
  const players = fighters.filter((fighter) => !fighter.house);
  const topLayer = topLayerOf(phase, round);
  if (phase !== "FOUNDRY" && (players.length === 0 || !players.every((fighter) => sentThisPhase(fighter, topLayer)))) return null;
  let at = 0;
  for (const fighter of players) {
    if (!fighter.forge) continue;
    at = Math.max(at, fighter.forge.startedAt + (fighter.inputKind === "DRAW" ? PEEL_WATCH_MS : SEND_WATCH_MS));
  }
  return at;
}

export function ForgeFloorScene({ input, nodes }: PhaseSceneProps) {
  const services = useStage();
  const data = useSceneData();
  const phase = input.phase;
  const round = input.round;
  const fighters = data?.fighters ?? [];
  const arenas = data?.mode.arenas ?? NO_ARENAS;
  const parked = data?.mode.foundryParked ?? false;

  // Marquee copy per phase.
  const names = arenas.map((id) => getArena(id).name);
  const marquee =
    phase === "UPGRADE"
      ? { text: "ADD ONE THING", sub: `Round ${round} upgrades` }
      : phase === "FOUNDRY"
        ? { text: "THE FOUNDRY", sub: parked ? "The Foundry jammed" : "Forging champions..." }
        : { text: "BUILD YOUR CHAMPION", sub: names.length ? `Tonight: ${names.join(" · ")}` : null };

  // Start the mesher workers before the first forge streams in (hides their warm-up).
  useEffect(() => warmMesher(), []);

  // The Voice: tonight's arenas at Build, the upgrade call at Upgrade.
  useEffect(() => {
    const voice = services.voice;
    if (phase === "BUILD" && arenas.length === 3) voice.say(voice.voice.arenas(arenas));
    if (phase === "UPGRADE") {
      const line = voice.voice.upgrade(round);
      if (line) voice.say(line);
    }
  }, [services, phase, round, arenas]);

  // Transient cuts to the foundry for its beats.
  const pending = useRef<Pending[]>([]);
  const onBeat = useMemo(
    () => (beat: ForgeBeat, fighter: SceneFighter) => {
      const now = services.clock.elapsed;
      const toFoundry = (delay: number, hold: number) =>
        pending.current.push({
          at: now + delay,
          run: () => {
            if (services.director.baseShot !== "foundry") services.director.request("foundry", { hold, priority: 1 });
          },
        });
      if (beat === "start") toFoundry(fighter.inputKind === "DRAW" ? 1.4 : 0.3, 5);
      else if (beat === "firstPart") toFoundry(0, 5);
      else if (beat === "card") {
        toFoundry(0, fighter.inputKind === "DRAW" ? 6 : 4);
        services.cheer(0.5);
      } else if (beat === "failed") toFoundry(0.2, 4);
    },
    [services],
  );
  useFrame(() => {
    if (pending.current.length === 0) return;
    const now = services.clock.elapsed;
    const due = pending.current.filter((item) => item.at <= now);
    if (due.length === 0) return;
    pending.current = pending.current.filter((item) => item.at > now);
    for (const item of due) item.run();
  });

  // Everyone's in: the base moves to the foundry (FOUNDRY's direction is this scene's).
  const turnAt = foundryTurnAt(fighters, phase, round);
  useEffect(() => {
    if (turnAt === null) return;
    const { director, clock } = services;
    const turn = () => {
      if (director.baseShot !== "foundry") director.setBase("foundry", {}, director.shot !== "foundry");
    };
    const wait = turnAt - clock.now;
    if (wait <= 0) {
      turn();
      return;
    }
    const timer = window.setTimeout(turn, wait);
    return () => window.clearTimeout(timer);
  }, [services, turnAt]);

  // The conveyor hums while anything forges (live rooms only).
  const anyForging = fighters.some((fighter) => fighter.status === "FORGING");
  useEffect(() => {
    if (!services.live || !anyForging) return;
    try {
      sfx.loop("conveyor", { gain: 0.55, fadeIn: 0.8 });
    } catch {
      /* audio unavailable */
    }
    return () => {
      try {
        sfx.stopLoop("conveyor", 0.8);
      } catch {
        /* audio unavailable */
      }
    };
  }, [services, anyForging]);

  const clockAt = clockSpot(nodes);
  return (
    <>
      <SceneMarquee nodes={nodes} text={marquee.text} sub={marquee.sub} />
      {phase !== "FOUNDRY" && <ClockRing position={clockAt.position} rotation={clockAt.rotation} radius={0.34} label={phase === "UPGRADE" ? "UPGRADE" : "BUILD"} delay={0.6} />}
      {fighters.map((fighter) => (
        <Station key={fighter.id} fighter={fighter} nodes={nodes} phase={phase} round={round} parked={parked} onBeat={onBeat} />
      ))}
    </>
  );
}

/** Where the clock ring hangs: above the middle of the easel row, facing the build camera. */
function clockSpot(nodes: ArenaNodes | null): { position: [number, number, number]; rotation: [number, number, number] } {
  const a = easelFor(nodes, 1);
  const b = easelFor(nodes, 2);
  const pa = nodePoint(a?.canvas ?? a?.node, [-7.36, 1.26, -0.92]);
  const pb = nodePoint(b?.canvas ?? b?.node, [-7.36, 1.26, 0.92]);
  const camera = nodes?.cameras.Cam_Build?.position;
  const x = (pa[0] + pb[0]) / 2;
  const z = (pa[2] + pb[2]) / 2;
  const yaw = camera ? Math.atan2(camera.x - x, camera.z - z) : Math.PI / 2;
  return { position: [x + 0.2, Math.max(pa[1], pb[1]) + 1.25, z], rotation: [0, yaw, 0] };
}

function Station({
  fighter,
  nodes,
  phase,
  round,
  parked,
  onBeat,
}: {
  fighter: SceneFighter;
  nodes: ArenaNodes | null;
  phase: StagePhase;
  round: number;
  parked: boolean;
  onBeat: (beat: ForgeBeat, fighter: SceneFighter) => void;
}) {
  const topLayer = topLayerOf(phase, round);
  const doodle = useDoodleTexture(fighter.strokes, topLayer);
  const easel = easelFor(nodes, fighter.slot);
  const layerStrokes = fighter.strokes.some((row) => row.layer === topLayer);
  // Stays lifted into the Foundry: the scene carries over, so a late peel plays out.
  const lifted = fighter.inputKind === "DRAW" && layerStrokes && sentThisPhase(fighter, topLayer);
  const hasDoodle = fighter.inputKind === "DRAW" && fighter.strokes.length > 0;
  return (
    <>
      {easel && (fighter.house ? <HiddenEasel easel={easel} /> : <Easel fighter={fighter} easel={easel} doodle={doodle} lifted={lifted} delay={0.3 + fighter.slot * 0.18} />)}
      <ForgePedestal fighter={fighter} nodes={nodes} phase={phase} round={round} doodle={hasDoodle ? doodle : null} parked={parked} onBeat={onBeat} />
    </>
  );
}
