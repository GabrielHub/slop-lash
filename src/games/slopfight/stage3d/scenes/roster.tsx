"use client";

// ROSTER: the walk-ons. One champion at a time hops off its pedestal and
// walks (hops, slithers, flies: the creature's own gait) to its roster mark
// while the camera tracks it (`walk_on_track`), then the shot opens back out
// to the roster wide as it arrives, its roster card rises from the floor
// behind it and The Voice reads its line. The next one sets off while the
// card settles. The phase ends on the roster wide (the base shot) with all
// four on their marks, so the face-off can match-cut from it.
//
// The schedule is pure (walk.ts: rosterSchedule) and keyed to the phase
// clock, so a stage that mounts mid-phase shows the walk-ons already done
// (cards up, no repeated lines).

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import { getArena } from "../../arenas";
import { finishGroups } from "../../finishes";
import { toVoiceFighter } from "../../narration";
import { bodyPlanLabel, type Champion } from "../../sheet";
import { TOY_COLOR_VALUES, type Finish } from "../../vocab";
import { useStage } from "../services";
import { Card, faceZ } from "../ui3d/card";
import { Chip, chipWidth, MoveRow, PipRow } from "../ui3d/chips";
import { onCardTone, textOn, UI_COLORS } from "../ui3d/materials";
import { stageSfx } from "../ui3d/sound";
import { fitTextSize, StageText } from "../ui3d/text";
import { WalkingChampion } from "./champions";
import { cameraPoint, nodePoint, pedestalTop, SceneMarquee, usePhaseSeconds, useSceneData, yawToward } from "./common";
import { ScoreboardSign, type PhaseSceneProps } from "./phase-scene";
import type { SceneFighter } from "./scene-data";
import { pedestalWalk, rosterSchedule, walkDuration, type RosterBeat, type WalkPath } from "./walk";
import type { ArenaNodes } from "../arena/nodes";

/** Roster card size (world units) and how far upstage of its mark it stands. */
export const ROSTER_CARD_W = 1.4;
export const ROSTER_CARD_H = 1.34;
const CARD_BEHIND = 0.95;
/** Room left between the card's top and the top of the roster wide's frame. */
const CARD_TOP_MARGIN = 0.32;
/** The card's centre never drops below this (it stands above the champions' heads). */
const CARD_MIN_Y = 1.6;

/** A mark for a slot (world, on the floor). */
export function rosterMark(nodes: ArenaNodes | null, slot: number): [number, number, number] {
  const mark = nodes?.marks.roster[slot];
  const point = nodePoint(mark, [-2.25 + 1.5 * slot, 0, -0.4]);
  return [point[0], 0, point[2]];
}

interface Walker {
  fighter: SceneFighter;
  champion: Champion;
  path: WalkPath;
  mark: [number, number, number];
  point: Vector3;
}

export function RosterScene({ input, nodes }: PhaseSceneProps) {
  const services = useStage();
  const data = useSceneData({ feeds: false });
  const phaseSeconds = usePhaseSeconds(input);
  const round = input.round;

  // Who walks, in slot order, and their paths.
  const fighters = useMemo(() => (data?.fighters ?? []).filter((fighter) => fighter.champion), [data]);
  const fighterKey = fighters.map((fighter) => `${fighter.id}:${fighter.version}`).join("|");
  const shot = useMemo(() => rosterCamera(nodes), [nodes]);
  const camera = useMemo(() => cameraPoint(nodes, "Cam_Roster", [0, 1.9, 6.6]), [nodes]);
  const walkers = useMemo<Walker[]>(
    () =>
      fighters.map((fighter) => {
        const mark = rosterMark(nodes, fighter.slot);
        const path = pedestalWalk(pedestalTop(nodes, fighter.slot), mark, yawToward(mark, camera));
        return { fighter, champion: fighter.champion!, path, mark, point: new Vector3(...path.from) };
      }),
    // Rebuilt only when the cast or the set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fighterKey, nodes, camera],
  );
  const beats = useMemo(() => rosterSchedule(walkers.map((walker) => walkDuration(walker.path))), [walkers]);

  // One Voice line per fighter (prefetched now, read on arrival).
  const lines = useMemo(() => {
    const cast = walkers.map((walker) => toVoiceFighter(walker.champion, walker.fighter.ownerName));
    return services.voice.voice.roster(cast, round, input.arena);
  }, [services, walkers, round, input.arena]);
  useEffect(() => {
    if (lines.length) services.voice.prefetch(lines);
  }, [services, lines]);

  // Cards up so far (state: they mount as they rise); those already up at mount skip the rise.
  const mountedAt = useRef<number | null>(null);
  const [cards, setCards] = useState(0);
  const cardCount = useRef(0);
  const fired = useRef({ track: new Set<number>(), say: new Set<number>() });

  useFrame(() => {
    const t = phaseSeconds();
    if (mountedAt.current === null) mountedAt.current = t;
    let count = 0;
    while (count < beats.length && t >= beats[count]!.cardAt) count += 1;
    if (count !== cardCount.current) {
      cardCount.current = count;
      setCards(count);
    }
    beats.forEach((beat, index) => {
      const walker = walkers[index];
      if (!walker) return;
      if (!fired.current.track.has(index) && t >= beat.trackAt) {
        fired.current.track.add(index);
        // Only track a walk-on that is happening now (not one a late mount missed).
        if (t < beat.trackAt + 0.6) {
          services.director.request("walk_on_track", { targets: [walker.point], hold: beat.trackHold, force: true, priority: 1 });
        }
      }
      if (!fired.current.say.has(index) && t >= beat.sayAt) {
        fired.current.say.add(index);
        if (t < beat.sayAt + 2) {
          const line = lines.find((candidate) => candidate.key === `roster:${round}:${index}`);
          if (line) services.voice.say(line);
          services.cheer(0.45);
          stageSfx(services).play("crowdCheer", { intensity: 0.35, gain: 0.45 });
        }
      }
    });
  });

  const arenaName = getArena(input.arena).name;
  return (
    <>
      <SceneMarquee nodes={nodes} text="THE ROSTER" sub={`Round ${round} · ${arenaName}`} />
      <ScoreboardSign nodes={nodes} lines={[`ROUND ${round}`, arenaName.toUpperCase()]} />
      {walkers.map((walker, index) => (
        <WalkingChampion
          key={walker.fighter.id}
          champion={walker.champion}
          path={walker.path}
          point={walker.point}
          seed={walker.fighter.slot + 1}
          time={() => phaseSeconds() - (beats[index]?.start ?? 0)}
        />
      ))}
      {walkers.slice(0, cards).map((walker, index) => (
        <RosterCard
          key={walker.fighter.id}
          fighter={walker.fighter}
          champion={walker.champion}
          mark={walker.mark}
          shot={shot}
          settled={isSettled(beats[index], mountedAt.current)}
        />
      ))}
    </>
  );
}

function isSettled(beat: RosterBeat | undefined, mountedAt: number | null): boolean {
  return !!beat && mountedAt !== null && mountedAt > beat.cardAt + 1.2;
}

/** The top of a camera's frame (world y) at a horizontal distance, for an anchor looking down at its target. */
export function frameTopAt(camera: { position: readonly number[]; target: readonly number[]; fov: number }, distance: number): number {
  const [cx, cy, cz] = camera.position as [number, number, number];
  const [tx, ty, tz] = camera.target as [number, number, number];
  const pitch = Math.atan2(cy - ty, Math.hypot(tx - cx, tz - cz));
  const up = (camera.fov * Math.PI) / 360 - pitch;
  return cy + distance * Math.tan(up);
}

/**
 * Where a champion's roster card stands (world): upstage of its mark, as
 * high as the roster wide allows (its top a margin under the frame's top
 * edge) so it clears the champions' heads.
 */
export function rosterCardPosition(mark: readonly number[], camera: RosterCamera): [number, number, number] {
  const z = mark[2]! - CARD_BEHIND;
  const distance = Math.hypot(mark[0]! - camera.position[0]!, z - camera.position[2]!);
  const y = Math.max(CARD_MIN_Y, frameTopAt(camera, distance) - CARD_TOP_MARGIN - ROSTER_CARD_H / 2);
  return [mark[0]!, y, z];
}

export interface RosterCamera {
  position: readonly number[];
  target: readonly number[];
  /** Vertical field of view, degrees. */
  fov: number;
}

/** Cam_Roster as plain numbers (the garage's anchor when the set has none). */
export function rosterCamera(nodes: ArenaNodes | null): RosterCamera {
  const anchor = nodes?.cameras.Cam_Roster;
  if (!anchor) return { position: [0, 1.9, 6.6], target: [0, 0.6, -0.4], fov: 38 };
  return { position: anchor.position.toArray(), target: anchor.target.toArray(), fov: anchor.fov };
}

const traitLabel = (trait: string) => trait.replace(/_/g, " ");

interface RosterCardProps {
  fighter: SceneFighter;
  champion: Champion;
  mark: readonly number[];
  shot: RosterCamera;
  settled: boolean;
}

/** A finish chip's paint: the finish's own signature colour. */
const FINISH_CHIP: Readonly<Record<Finish, string>> = {
  vinyl: UI_COLORS.bone,
  metal: "#A9B2BB",
  gold: "#E8B53C",
  crystal: "#BFDFFA",
  stone: "#8F8B83",
  wood: "#A86F3C",
  ice: "#AEE6F2",
  lava: "#E8552A",
  slime: "#93D93F",
  glow: "#4FD9B6",
};

/**
 * The roster card: the champion's name on its colour, the body-plan tag and
 * owner, its three moves with their type glyphs and power, two chips (its
 * first trait, then what it is made of when that is not all vinyl, else its
 * second trait) and its three stats as pips.
 */
export function RosterCard({ fighter, champion, mark, shot, settled }: RosterCardProps) {
  const W = ROSTER_CARD_W;
  const H = ROSTER_CARD_H;
  const position = rosterCardPosition(mark, shot);
  const yaw = yawToward(position, shot.position);
  const palette = champion.palette;
  const primary = TOY_COLOR_VALUES[palette.primary].hex;
  const secondary = onCardTone(TOY_COLOR_VALUES[palette.secondary].hex);
  const accent = onCardTone(TOY_COLOR_VALUES[palette.accent].hex);
  const z = faceZ();
  const left = -W / 2 + 0.07;
  const tag = bodyPlanLabel(champion);
  const tagSize = 0.08;
  const owner = fighter.ownerName ? `by ${fighter.ownerName}` : "House champion";
  const d = settled ? 0 : 0.45;
  const finish = finishGroups(champion)[0];
  const chips = [
    ...champion.traits.slice(0, finish ? 1 : 2).map((trait, index) => {
      const color = index === 0 ? secondary : accent;
      return { key: trait, label: traitLabel(trait), color, textColor: textOn(color) };
    }),
    ...(finish
      ? [{ key: finish.finish, label: finish.label, color: FINISH_CHIP[finish.finish], textColor: textOn(FINISH_CHIP[finish.finish]) }]
      : []),
  ];
  // Rows from the top: band 0.2, tag row, three moves, then chips | pips.
  const tagY = H / 2 - 0.33;
  const moveY = (index: number) => tagY - 0.19 - index * 0.15;
  const bottomY = moveY(2) - 0.2;
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <Card
        enter={settled ? "none" : "rise"}
        enterDistance={2.6}
        width={W}
        height={H}
        accent={primary}
        title={champion.name}
        titleSize={fitTextSize(champion.name, W * 0.86, 0.13)}
        seed={fighter.slot + 3}
        idle={0.5}
        glow={0.14}
      >
        <Chip label={tag} size={tagSize} color={UI_COLORS.plum} textColor={UI_COLORS.bone} position={[left + chipWidth(tag, tagSize) / 2, tagY, z + 0.01]} appearDelay={d} />
        <Suspense fallback={null}>
          <StageText
            size={fitTextSize(owner, W * 0.44, 0.08)}
            color={UI_COLORS.inkDim}
            outline={0}
            glow={0.08}
            anchorX="right"
            position={[W / 2 - 0.08, tagY, z + 0.006]}
            castShadow={false}
          >
            {owner}
          </StageText>
        </Suspense>
        {champion.moves.slice(0, 3).map((move, index) => (
          <MoveRow
            key={index}
            name={move.name}
            type={move.type}
            power={move.power}
            width={W - 0.16}
            size={0.082}
            position={[0, moveY(index), z + 0.004]}
            appearDelay={d + 0.12 + index * 0.12}
            sound={!settled}
          />
        ))}
        {chips.map(({ key, label, color, textColor }, index) => {
          // Clear of the pip column (which starts at W / 2 - 0.07 - W * 0.5).
          const size = Math.min(0.08, (W * 0.38) / Math.max(1, label.length * 0.62 + 1.5));
          return (
            <Chip
              key={key}
              label={label}
              size={size}
              color={color}
              textColor={textColor}
              position={[left + chipWidth(label, size) / 2, bottomY - index * 0.15, z + 0.01]}
              appearDelay={d + 0.5 + index * 0.1}
              sound={!settled}
            />
          );
        })}
        {(["heft", "reach", "chaos"] as const).map((stat, index) => (
          <PipRow
            key={stat}
            label={stat.toUpperCase()}
            value={champion.stats[stat]}
            width={W * 0.5}
            size={0.08}
            color={onCardTone(primary)}
            position={[W / 2 - 0.07 - (W * 0.5) / 2, bottomY + 0.06 - index * 0.11, z + 0.004]}
            appearDelay={d + 0.6 + index * 0.08}
          />
        ))}
      </Card>
    </group>
  );
}
