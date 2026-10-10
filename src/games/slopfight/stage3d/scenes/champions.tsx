"use client";

// Champions standing around the set outside the fight: on a mark, on a
// podium step, walking from a pedestal to a mark. Each owns its driver (in
// world space; the creature is not nested in a transformed group).

import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { Champion } from "../../sheet";
import { setDriverFromMotion } from "../creature/animator";
import { Creature, createDriver, type CreatureEvent, type CreatureHandle } from "../creature/creature";
import { useStage } from "../services";
import { easeInOutCubic } from "../ui3d/motion";
import { stageSfx } from "../ui3d/sound";
import { STAGE_SPECULAR } from "./forge";
import { walkPose, type WalkPath } from "./walk";

/** Footfall and hop sounds for a walking champion (live rooms only). */
export function useCreatureSounds() {
  const services = useStage();
  return useMemo(
    () => (event: CreatureEvent) => {
      const sfx = stageSfx(services);
      if (event.kind === "hopLand") sfx.play("boing", { intensity: Math.min(1, 0.2 + event.strength * 0.3), gain: 0.35 });
      else if (event.kind === "footstep") sfx.play("tap", { intensity: Math.min(0.5, 0.1 + event.strength * 0.2), gain: 0.18 });
    },
    [services],
  );
}

const SHOWBOAT = { intent: "showboat" } as const;

export interface StandingChampionProps {
  champion: Champion;
  position: [number, number, number];
  /** Facing (0 faces +z). */
  yaw: number;
  seed?: number;
  /** Smug, bouncing celebration (the podium winner). */
  showboat?: boolean;
  /** A face override ("annoyed" for fourth place). */
  expression?: "smug" | "annoyed" | "wide" | null;
  /** Called on each showboat landing. */
  onHop?: (position: Vector3) => void;
  scale?: number;
}

export interface StandingChampionHandle {
  creature: CreatureHandle | null;
  /** The champion's current ground point (world). */
  position: Vector3;
}

/** A champion standing on a spot, idling (and, for a winner, hopping with joy). */
export const StandingChampion = forwardRef<StandingChampionHandle, StandingChampionProps>(function StandingChampion(
  { champion, position, yaw, seed = 1, showboat = false, expression = null, onHop, scale },
  ref,
) {
  const services = useStage();
  const driver = useMemo(() => createDriver(position, yaw), []); // eslint-disable-line react-hooks/exhaustive-deps
  const creature = useRef<CreatureHandle>(null);
  const point = useMemo(() => new Vector3(...position), []); // eslint-disable-line react-hooks/exhaustive-deps
  const previous = useMemo(() => new Vector3(...position), []); // eslint-disable-line react-hooks/exhaustive-deps
  const hop = useRef({ t: seed * 0.37, airborne: false });
  const hopCallback = useRef(onHop);
  useEffect(() => {
    hopCallback.current = onHop;
  }, [onHop]);
  useImperativeHandle(ref, () => ({ get creature() { return creature.current; }, position: point }), [point]);
  const sounds = useCreatureSounds();
  useFrame(() => {
    const dt = services.clock.delta;
    previous.copy(point);
    point.set(position[0], position[1], position[2]);
    if (showboat) {
      const h = hop.current;
      h.t += dt;
      const period = 1.5;
      const phase = h.t % period;
      const air = 0.5;
      if (phase < air) {
        const s = phase / air;
        point.y += 4 * 0.32 * s * (1 - s);
        h.airborne = true;
      } else if (h.airborne) {
        h.airborne = false;
        creature.current?.squash(0.3);
        creature.current?.jiggle(0.5);
        stageSfx(services).play("boing", { intensity: 0.4, gain: 0.4 });
        hopCallback.current?.(point);
      }
      driver.anim = SHOWBOAT;
      driver.expression = "smug";
      // A full spin in the air on every other hop.
      const spin = Math.floor(h.t / period) % 2 === 1 && phase < air ? easeInOutCubic(phase / air) * Math.PI * 2 : 0;
      driver.yaw = yaw + spin;
    } else {
      driver.anim = null;
      driver.yaw = yaw;
      driver.expression = expression;
    }
    setDriverFromMotion(driver, point, previous, dt);
    // Hops are a pose, not travel: don't let the vertical bounce read as walking.
    driver.velocity[1] = 0;
  });
  return <Creature ref={creature} champion={champion} driver={driver} seed={seed} specularMinLight={STAGE_SPECULAR} onEvent={sounds} scale={scale} />;
});

export interface WalkingChampionProps {
  champion: Champion;
  path: WalkPath;
  /** Seconds into the walk (negative: still on the pedestal). */
  time: () => number;
  /** Written every frame with the champion's ground point (world): a camera target. */
  point?: Vector3;
  seed?: number;
  onArrive?: () => void;
}

/** A champion walking its path on a clock: hop off the pedestal, walk to the mark, turn to the room. */
export function WalkingChampion({ champion, path, time, point: shared, seed = 1, onArrive }: WalkingChampionProps) {
  const services = useStage();
  const driver = useMemo(() => createDriver(path.from, path.endYaw), []); // eslint-disable-line react-hooks/exhaustive-deps
  const own = useMemo(() => new Vector3(...path.from), []); // eslint-disable-line react-hooks/exhaustive-deps
  const point = shared ?? own;
  const previous = useMemo(() => new Vector3(...path.from), []); // eslint-disable-line react-hooks/exhaustive-deps
  const arrived = useRef(false);
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  }, [onArrive]);
  const creature = useRef<CreatureHandle>(null);
  const sounds = useCreatureSounds();
  const first = useRef(true);
  useFrame(() => {
    previous.copy(point);
    const pose = walkPose(path, time(), point);
    if (first.current) {
      first.current = false;
      previous.copy(point);
    }
    setDriverFromMotion(driver, point, previous, services.clock.delta, pose.yaw);
    if (pose.arrived && !arrived.current) {
      arrived.current = true;
      creature.current?.squash(0.2);
      arrive.current?.();
    }
  });
  return <Creature ref={creature} champion={champion} driver={driver} seed={seed} specularMinLight={STAGE_SPECULAR} onEvent={sounds} />;
}
