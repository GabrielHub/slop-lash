// <Creature>: a forged champion (or a partial one, growing) as a living,
// skinned toon creature. Feed it a `driver` (a plain mutable object updated
// every frame by its owner: position, facing, velocity, the sim's animation
// hint and optional physics proxies) and it walks, hops, slithers or flies,
// reaches for strikes, blinks and jiggles on its own.
//
//   const driver = useMemo(() => createDriver([0, 0, 0]), []);
//   <Creature champion={champion} driver={driver} onEvent={playSound} ref={handle} />
//   handle.current?.jiggle(1);          // on a hit
//
// While forging, pass the parts that have arrived so far (`parts`), plus
// `bodyPlan`, `palette` and later `face`; set `complete` when the sheet is
// final. Each new part pops on with a puff, the body re-forms, and the eyes
// open last. Every beat is reported through `onEvent` for sound.

import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Vector3 } from "three";
import { championHash, championScale, type Champion, type Face, type Palette, type Part } from "../../sheet";
import type { BodyPlan } from "../../vocab";
import { useQuality } from "../services";
import { createDriver, type CreatureDriver } from "./animator";
import { CreatureView, type CreatureEvent, type CreatureSource } from "./creature-view";

export type { CreatureDriver, DriverAnim, DriverPose, Expression } from "./animator";
export { createDriver } from "./animator";
export type { CreatureEvent } from "./creature-view";
export { warmMesher } from "./mesh-client";

export interface CreatureProps {
  /** A finished champion. */
  champion?: Champion | null;
  /** The parts so far while growing (overrides `champion.parts`). */
  parts?: readonly Part[];
  bodyPlan?: BodyPlan;
  palette?: Palette | null;
  face?: Face | null;
  /** 1..5 (default: the champion's, else 3). */
  heft?: number;
  /** Size multiplier (default: championScale, else 1). */
  scale?: number;
  /** The sheet is final (default: true for a champion without a `parts` override). */
  complete?: boolean;
  /** Read every frame; mutate it, don't replace it. Defaults to standing at the origin. */
  driver?: CreatureDriver;
  /** Per-creature variation (blink timing, wobble phase). */
  seed?: number;
  /** Multiplies frame time (hit stop, slow motion). Default 1. */
  timeScale?: number;
  outlineWidth?: number;
  castShadow?: boolean;
  /** Growth beats when parts arrive. Default true. */
  growth?: boolean;
  /** Only lights brighter than this leave a highlight (default 1.2; 0 = every light). Set once at mount. */
  specularMinLight?: number;
  /** A part landed on the growing body (for the "ding"). */
  onPartLanded?: (part: Part, position: Vector3) => void;
  /** Every beat: partLanded, reform, eyesOpen, meshed, footstep, hopLaunch, hopLand, flap. */
  onEvent?: (event: CreatureEvent) => void;
}

export interface CreatureHandle {
  view: CreatureView;
  /** A hit: the jelly jiggles for about half a second. */
  jiggle(strength?: number): void;
  /** A quick squash (positive) or stretch (negative). */
  squash(amount: number): void;
  /** Moved somewhere else at a cut (a replay): the feet plant afresh. */
  replant(): void;
  /** A bone's centre in parent space. */
  boneCentre(id: string, out: Vector3): boolean;
  /** The face's position in parent space. */
  facePosition(out: Vector3): boolean;
}

export const Creature = forwardRef<CreatureHandle, CreatureProps>(function Creature(props, ref) {
  const { meshGrid } = useQuality();
  const {
    champion,
    parts,
    bodyPlan,
    palette,
    face,
    heft,
    scale,
    complete,
    driver,
    seed = 1,
    timeScale = 1,
    outlineWidth,
    castShadow,
    growth,
    specularMinLight,
  } = props;
  const view = useMemo(
    () => new CreatureView({ seed, outlineWidth, castShadow, growth, specularMinLight }),
    // The view is created once; these options are construction-time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const fallbackDriver = useMemo(() => createDriver(), []);
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);

  const source: CreatureSource | null = useMemo(() => {
    const list = parts ?? champion?.parts;
    if (!list) return null;
    const isComplete = complete ?? (!!champion && !parts);
    return {
      parts: list,
      bodyPlan: bodyPlan ?? champion?.bodyPlan,
      palette: palette ?? champion?.palette ?? null,
      face: face !== undefined ? face : (champion?.face ?? null),
      heft: heft ?? champion?.stats.heft ?? 3,
      scale: scale ?? (champion ? championScale(champion) : 1),
      deliveries: champion?.moves.map((move) => move.delivery),
      complete: isComplete,
      resolution: isComplete ? meshGrid.final : meshGrid.growing,
      hash: champion && !parts ? championHash(champion) : undefined,
      item: champion?.item ?? null,
      markings: champion?.markings,
    };
  }, [champion, parts, bodyPlan, palette, face, heft, scale, complete, meshGrid.final, meshGrid.growing]);

  useEffect(() => {
    if (source) view.setSource(source);
  }, [view, source]);

  useEffect(() => () => view.dispose(), [view]);

  useImperativeHandle(
    ref,
    () => ({
      view,
      jiggle: (strength = 1) => view.jiggle(strength),
      squash: (amount: number) => view.squash(amount),
      replant: () => view.replant(),
      boneCentre: (id, out) => view.boneCentre(id, out),
      facePosition: (out) => view.facePosition(out),
    }),
    [view],
  );

  useFrame((_, delta) => {
    const events = view.update(delta * timeScale, driver ?? fallbackDriver);
    if (!events.length) return;
    const { onEvent, onPartLanded } = callbacks.current;
    for (const event of events) {
      onEvent?.(event);
      if (event.kind === "partLanded") onPartLanded?.(event.part, event.position);
    }
  });

  return <primitive object={view.root} />;
});
