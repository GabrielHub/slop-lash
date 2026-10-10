"use client";

// FINISHED: the podium. PhaseScene slams "CHAMPION" and cranes down onto the
// podium (the set shows it in this phase). The champion stands on the top
// step showboating (smug, hopping, a spin every other hop, a pinch of confetti
// on each landing), the runner-up and third on their steps, fourth on the
// floor beside them, annoyed. Confetti cannons fire in the champions' palette
// colours as the crane lands, the fanfare plays and The Voice reads the
// podium, third to first, then the champion's own line. A card drops from
// the rig over each runner-up with its name (the marquee names the winner),
// slid outward as far as it takes to clear the marquee's lines (and the
// other cards) in the final framing.
// Every so often the camera cuts to the scoreboard, where the final scores
// count up, and back.
//
// In the recap (`input.live` false: no viewer, no sounds, no Voice) the
// podium plays the same way, and the fight workstream's replay reel
// (RecapReel, a heads-up strip of fight cards along the bottom of the frame)
// mounts once the crane has landed.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { PerspectiveCamera, Vector3, type Vector3Tuple } from "three";
import { toVoiceFighter } from "../../narration";
import { championScale, type Champion } from "../../sheet";
import { RecapReel } from "../fight/scenes";
import { useStage } from "../services";
import { Confetti, type ConfettiHandle } from "../ui3d/confetti";
import { stageSfx } from "../ui3d/sound";
import { Card } from "../ui3d/card";
import { fitTextSize } from "../ui3d/text";
import { boardRows, type BoardRow } from "./board";
import { StandingChampion } from "./champions";
import { clearShift, grow, type Rect } from "./clearance";
import { cameraPoint, fighterColor, marqueeLines, nodePoint, paletteHexes, SceneMarquee, usePhaseSeconds, useSceneData, yawToward } from "./common";
import type { PhaseSceneProps } from "./phase-scene";
import { podiumFighters, type SceneData, type SceneFighter } from "./scene-data";
import { Scoreboard } from "./scoreboard";
import type { ArenaNodes } from "../arena/nodes";

/** Scene seconds: the crane lands, the Voice starts, the first scoreboard visit, the visit cycle and length. */
export const PODIUM_CRANE_S = 4;
const VOICE_AT_S = 2.2;
export const PODIUM_SCOREBOARD_AT_S = 15;
const SCOREBOARD_EVERY_S = 22;
const SCOREBOARD_HOLD_S = 6.5;
/** The recap's replay reel mounts once the crane has landed (the reel waits a little more itself). */
export const PODIUM_BEAT_S = PODIUM_CRANE_S;
/** Confetti bursts after the crane lands, then every few seconds. */
const BURST_EVERY_S = 6.5;

const PLACE_LABELS = ["CHAMPION", "2ND PLACE", "3RD PLACE", "4TH PLACE"];

/** Where each place stands (world): the podium tops for the first three, the floor beside them for fourth. */
export function podiumSpots(nodes: ArenaNodes | null): Vector3Tuple[] {
  const tops = nodes?.podium?.tops ?? [];
  const fallback: Vector3Tuple[] = [
    [0, 0.64, -0.4],
    [-1.15, 0.44, -0.4],
    [1.15, 0.28, -0.4],
  ];
  const spots = fallback.map((spot, index) => nodePoint(tops[index], spot) as Vector3Tuple);
  const third = spots[2]!;
  spots.push([third[0] + 1.05, 0, third[2] + 0.3]);
  return spots;
}

/** The final scoreboard: podium order, points counting up over the last round. */
export function finalRows(data: SceneData, placed: readonly (SceneFighter | null)[]): BoardRow[] {
  const rows = boardRows(data, data.round);
  const out: BoardRow[] = [];
  placed.forEach((fighter, place) => {
    const row = fighter ? rows.find((candidate) => candidate.fighter.id === fighter.id) : null;
    if (row) out.push({ ...row, rank: place + 1, from: rows.indexOf(row) });
  });
  return out.length ? out : rows;
}

/** The runner-ups' hanging cards. */
const PLATE_W = 0.94;
const PLATE_H = 0.36;
/** How far a card may slide outward to clear the marquee (metres, in steps). */
const PLATE_SHIFTS = Array.from({ length: 13 }, (_, index) => index * 0.05);

/** Where a place's card hangs (world, before any outward slide): over the champion's head. */
function plateAt(spot: Vector3Tuple, champion: Champion): Vector3Tuple {
  const y = spot[1] + championScale(champion) * (champion.bodyPlan === "FLIER" ? 1.5 : 1.08) + 0.14 + PLATE_H / 2;
  return [spot[0], y, spot[2] + 0.1];
}

/**
 * The outward x slide of each place's card (0 for the winner, who has none),
 * so that from Cam_Podium (the crane's final framing) it covers neither the
 * marquee's lines nor an earlier card, and stays in frame.
 */
function plateShifts(
  nodes: ArenaNodes | null,
  placed: readonly (SceneFighter | null)[],
  spots: readonly Vector3Tuple[],
  marquee: { text: string; sub: string | null },
  aspect: number,
): number[] {
  const anchor = nodes?.cameras.Cam_Podium;
  const camera = new PerspectiveCamera(anchor?.fov ?? 36, aspect, 0.1, 200);
  camera.position.copy(anchor?.position ?? new Vector3(0, 1.7, 5.4));
  camera.lookAt(anchor?.target ?? new Vector3(0, 0.95, -0.4));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const point = new Vector3();
  const project = (corners: readonly Vector3[]): Rect => {
    const rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const corner of corners) {
      point.copy(corner).project(camera);
      rect.x0 = Math.min(rect.x0, point.x);
      rect.x1 = Math.max(rect.x1, point.x);
      rect.y0 = Math.min(rect.y0, point.y);
      rect.y1 = Math.max(rect.y1, point.y);
    }
    return rect;
  };
  const zones: Rect[] = [];
  const plane = nodes?.marqueeText;
  if (plane) {
    const origin = plane.position.clone().addScaledVector(plane.normal, 0.012);
    const onPlane = (x: number, y: number) => new Vector3(x, y, 0).applyQuaternion(plane.quaternion).add(origin);
    for (const line of marqueeLines(plane, marquee.text, marquee.sub)) {
      const halfW = line.width / 2;
      const halfH = line.size * 0.6;
      const corners = [onPlane(-halfW, line.y - halfH), onPlane(halfW, line.y - halfH), onPlane(halfW, line.y + halfH), onPlane(-halfW, line.y + halfH)];
      zones.push(grow(project(corners), 0.015));
    }
  }
  const frame: Rect = { x0: -0.97, y0: -0.97, x1: 0.97, y1: 0.97 };
  const centreX = spots[0]?.[0] ?? 0;
  const shifts = placed.map(() => 0);
  placed.forEach((fighter, place) => {
    const spot = spots[place];
    if (place === 0 || !fighter?.champion || !spot) return;
    const at = plateAt(spot, fighter.champion);
    const yaw = yawToward(at, camera.position);
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(PLATE_W / 2);
    const up = new Vector3(0, PLATE_H / 2, 0);
    const outward = Math.sign(spot[0] - centreX) || 1;
    const rectAt = (shift: number) => {
      const centre = new Vector3(at[0] + outward * shift, at[1], at[2]);
      return project([
        centre.clone().sub(right).sub(up),
        centre.clone().add(right).sub(up),
        centre.clone().add(right).add(up),
        centre.clone().sub(right).add(up),
      ]);
    };
    const shift = clearShift(PLATE_SHIFTS, rectAt, zones, frame);
    shifts[place] = outward * shift;
    zones.push(grow(rectAt(shift), 0.01));
  });
  return shifts;
}

export function PodiumScene({ input, nodes }: PhaseSceneProps) {
  const services = useStage();
  const data = useSceneData();
  const phaseSeconds = usePhaseSeconds(input);
  const live = input.live;
  const placed = useMemo(() => (data ? podiumFighters(data) : []), [data]);
  const rows = useMemo(() => (data ? finalRows(data, placed) : []), [data, placed]);
  const spots = useMemo(() => podiumSpots(nodes), [nodes]);
  const camera = useMemo(() => cameraPoint(nodes, "Cam_Podium", [0, 1.7, 5.4]), [nodes]);
  const confetti = useRef<ConfettiHandle>(null);
  const [first, second, third] = placed;
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const marquee = useMemo(() => {
    const owner = first?.ownerName ? ` · ${first.ownerName}` : "";
    return {
      text: first?.champion ? first.champion.name.toUpperCase() : "CHAMPION",
      sub: first ? `Tonight's champion${owner}` : null,
    };
  }, [first]);
  const shifts = useMemo(() => plateShifts(nodes, placed, spots, marquee, aspect), [nodes, placed, spots, marquee, aspect]);

  // Confetti in the champions' colours: mostly the winner's.
  const colors = useMemo(() => {
    const winner = paletteHexes(first);
    return [...winner, ...winner, ...paletteHexes(second), ...paletteHexes(third)];
  }, [first, second, third]);

  // The Voice: third to first, then the champion's line (live rooms only).
  const lines = useMemo(() => {
    if (!first?.champion || !second?.champion) return [];
    const voiceOf = (fighter: SceneFighter) => toVoiceFighter(fighter.champion!, fighter.ownerName);
    return services.voice.voice.podium(voiceOf(first), voiceOf(second), third?.champion ? voiceOf(third) : undefined);
  }, [services, first, second, third]);
  useEffect(() => {
    if (live && lines.length) services.voice.prefetch(lines);
  }, [services, live, lines]);

  // The recap's reel mounts after the podium beat.
  const [reel, setReel] = useState(false);
  const beats = useRef({ voice: false, landed: false, rebased: false, bursts: 0, visits: 0 });
  useFrame(() => {
    const t = phaseSeconds();
    const b = beats.current;
    const sfx = stageSfx(services);
    if (!b.voice && t >= VOICE_AT_S) {
      b.voice = true;
      if (live && t < VOICE_AT_S + 3 && lines.length) services.voice.say(lines);
    }
    if (!b.landed && t >= PODIUM_CRANE_S) {
      b.landed = true;
      if (t < PODIUM_CRANE_S + 2) {
        sfx.play("winFanfare", { intensity: 0.8 });
        sfx.play("crowdCheer", { intensity: 0.8, gain: 0.7 });
        services.cheer(1);
      }
    }
    // Once the crane has landed, returning to the podium holds the final framing instead of craning again.
    if (!b.rebased && t >= PODIUM_CRANE_S + 0.6) {
      b.rebased = true;
      if (services.director.shot === "podium") services.director.setBase("podium", { duration: 0.001 }, false);
    }
    // Confetti cannons: the first pair as the crane lands, then a burst every few seconds.
    const due = t < PODIUM_CRANE_S - 0.3 ? 0 : 1 + Math.floor((t - (PODIUM_CRANE_S - 0.3)) / BURST_EVERY_S);
    if (due > b.bursts) {
      const fresh = due - b.bursts > 1 ? 1 : due - b.bursts;
      b.bursts = due;
      for (let i = 0; i < fresh; i += 1) fireConfetti(confetti.current, spots, colors, b.bursts === 1);
      if (b.bursts > 1) sfx.play("hype", { intensity: 0.25, gain: 0.35 });
    }
    // Visit the scoreboard now and then.
    const visit = t < PODIUM_SCOREBOARD_AT_S ? 0 : 1 + Math.floor((t - PODIUM_SCOREBOARD_AT_S) / SCOREBOARD_EVERY_S);
    if (visit > b.visits) {
      b.visits = visit;
      services.director.request("scoreboard", { hold: SCOREBOARD_HOLD_S, priority: 1 });
    }
    if (!live && !reel && t >= PODIUM_BEAT_S) setReel(true);
  });

  return (
    <>
      <SceneMarquee nodes={nodes} text={marquee.text} sub={marquee.sub} />
      <Scoreboard nodes={nodes} title="FINAL SCORES" rows={rows} figurines={false} sound={live} time={() => phaseSeconds() - PODIUM_SCOREBOARD_AT_S + 0.4} />
      <Confetti ref={confetti} capacity={700} life={5} />
      {placed.map((fighter, place) => {
        const spot = spots[place];
        if (!fighter?.champion || !spot) return null;
        const champion = fighter.champion;
        const yaw = yawToward(spot, camera);
        return (
          <group key={fighter.id}>
            <StandingChampion
              champion={champion}
              position={spot}
              yaw={yaw}
              seed={fighter.slot + 1}
              showboat={place === 0}
              expression={place === 3 ? "annoyed" : place === 1 ? "smug" : null}
              onHop={place === 0 ? (at) => confetti.current?.burst({ origin: [at.x, at.y + 0.2, at.z], count: 14, colors: paletteHexes(fighter), speed: 2.2, spread: 1.1, size: 0.045 }) : undefined}
            />
            <PlacePlate fighter={fighter} place={place} spot={spot} shift={shifts[place] ?? 0} camera={camera} />
          </group>
        );
      })}
      {reel && <RecapReel input={input} nodes={nodes} />}
    </>
  );
}

/** Two side cannons aimed in over the podium, and (the first time) a shower from the rig. */
function fireConfetti(handle: ConfettiHandle | null, spots: readonly Vector3Tuple[], colors: readonly string[], big: boolean) {
  if (!handle) return;
  const centre = spots[0] ?? [0, 0.64, -0.4];
  for (const side of [-1, 1]) {
    handle.burst({
      origin: [centre[0] + side * 2.7, 0.3, centre[2] + 0.4],
      direction: [-side * 0.55, 1, 0.1],
      count: big ? 150 : 70,
      colors,
      speed: big ? 6.2 : 5.2,
      spread: 0.32,
      size: 0.06,
    });
  }
  if (big) handle.burst({ origin: [centre[0], 4.2, centre[2]], count: 160, colors, speed: 1.2, spread: Math.PI / 2, size: 0.07 });
}

/**
 * A card hanging from the rig over each runner-up (clear of The Voice's lower
 * third), slid `shift` along x to clear the marquee: the champion's name on
 * its colour, the place and the owner. The winner has none: the marquee
 * behind the podium carries its name in lights, and a plate in front of it
 * would hide it.
 */
function PlacePlate({ fighter, place, spot, shift, camera }: { fighter: SceneFighter; place: number; spot: Vector3Tuple; shift: number; camera: { x: number; z: number } }) {
  const champion = fighter.champion;
  if (!champion || place === 0) return null;
  const height = PLATE_H;
  const width = PLATE_W;
  const base = plateAt(spot, champion);
  const at: Vector3Tuple = [base[0] + shift, base[1], base[2]];
  return (
    <group position={at} rotation={[0, yawToward(at, camera), 0]}>
      <Card
        width={width}
        height={height}
        accent={fighterColor(fighter)}
        title={champion.name}
        titleSize={fitTextSize(champion.name, width * 0.86, height * 0.3)}
        body={`${PLACE_LABELS[place]}${fighter.ownerName ? ` · ${fighter.ownerName}` : ""}`}
        bodySize={height * 0.2}
        enter="drop"
        cable={3}
        delay={PODIUM_CRANE_S - 0.6 + (3 - place) * 0.22}
        seed={place + 1}
        glow={0.12}
      />
    </group>
  );
}
