"use client";

// <MotionGroup>: the kit's shared mover. It places its children at
// `position` (parent space) and plays the motion language on them:
//
// - an entrance (`enter`: rise | drop | pop | none) after `delay` seconds, or,
//   when `flyFrom` is given at mount, a toss along an arc from there;
// - idle life while it rests (a slow bob and sway, never still);
// - a fly-to along an arc whenever `position` changes after it has entered;
// - the flick-off exit while `leaving` is true (it hides when done).
//
// Every beat reports through `onBeat` ("start" when an entrance or flight
// begins, "land" at the impact moment: the cable's catch, the token's landing,
// the rise's settle), which is where sounds go. Uses the presentation clock
// (freezes in hit stop) unless `realtime`.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Vector3, type Group, type Vector3Tuple } from "three";
import { useStage } from "../services";
import {
  arcDuration,
  arcPose,
  createPose,
  ENTER_SECONDS,
  enterPose,
  exitPose,
  idlePose,
  type Arc,
  type EnterKind,
} from "./motion";

export type MotionBeat = "start" | "land" | "gone";

export interface MotionGroupProps {
  /** Rest position in the parent's space. Changing it after the entrance flies there along an arc. */
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  /** Uniform scale of the rest pose. */
  scale?: number;
  enter?: EnterKind;
  /** rise: how far below it starts; drop: how far above (world units). */
  enterDistance?: number;
  /** Seconds before the entrance starts (stagger a row of cards). */
  delay?: number;
  /** Arrive by a toss along an arc from this point (parent space) instead of `enter`. */
  flyFrom?: Vector3Tuple | null;
  /** Arc peak above the higher end (fly-from and fly-to). */
  arcHeight?: number;
  /** Plays the flick-off; the group hides when it is done. */
  leaving?: boolean;
  /** Idle bob/sway amount (0: still). Default 1. */
  idle?: number;
  /** Idle like something hanging on a cable (a wider swing). */
  hanging?: boolean;
  /** Variation (swing direction, idle phase). */
  seed?: number;
  /** Real time instead of the presentation clock (ignores hit stop and slow-mo). */
  realtime?: boolean;
  onBeat?: (beat: MotionBeat) => void;
  children?: ReactNode;
}

type Mode = "waiting" | "enter" | "arc" | "rest" | "exit" | "gone";

const toVec = (tuple: Vector3Tuple | undefined, out: Vector3) => (tuple ? out.set(tuple[0], tuple[1], tuple[2]) : out.set(0, 0, 0));

export function MotionGroup({
  position,
  rotation,
  scale = 1,
  enter = "pop",
  enterDistance,
  delay = 0,
  flyFrom = null,
  arcHeight = 0.8,
  leaving = false,
  idle = 1,
  hanging = false,
  seed = 1,
  realtime = false,
  onBeat,
  children,
}: MotionGroupProps) {
  const services = useStage();
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const pose = useMemo(() => createPose(), []);
  const rest = useMemo(() => toVec(position, new Vector3()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useRef<{ mode: Mode; t: number; arc: Arc | null; landed: boolean; age: number }>({
    mode: "waiting",
    t: -delay,
    arc: null,
    landed: false,
    age: 0,
  });
  const beat = useRef(onBeat);
  beat.current = onBeat;

  // At mount: a toss from `flyFrom`, else the entrance.
  useEffect(() => {
    const s = state.current;
    if (flyFrom) {
      const distance = Math.hypot(rest.x - flyFrom[0], rest.y - flyFrom[1], rest.z - flyFrom[2]);
      s.arc = {
        fromX: flyFrom[0],
        fromY: flyFrom[1],
        fromZ: flyFrom[2],
        toX: rest.x,
        toY: rest.y,
        toZ: rest.z,
        height: arcHeight,
        duration: arcDuration(distance),
      };
    }
    // Mount-only: later changes to flyFrom do nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new rest position after the entrance: fly there.
  const px = position?.[0] ?? 0;
  const py = position?.[1] ?? 0;
  const pz = position?.[2] ?? 0;
  useEffect(() => {
    const s = state.current;
    if (rest.x === px && rest.y === py && rest.z === pz) return;
    const group = outer.current;
    if ((s.mode === "rest" || s.mode === "arc") && group) {
      const from = group.position;
      const distance = Math.hypot(px - from.x, py - from.y, pz - from.z);
      s.arc = { fromX: from.x, fromY: from.y, fromZ: from.z, toX: px, toY: py, toZ: pz, height: arcHeight * 0.6, duration: arcDuration(distance) };
      s.mode = "arc";
      s.t = 0;
      s.landed = false;
      beat.current?.("start");
    }
    rest.set(px, py, pz);
  }, [px, py, pz, rest, arcHeight]);

  useEffect(() => {
    const s = state.current;
    if (leaving && s.mode === "waiting") {
      // Never shown yet (mounted leaving, or still in its delay): stay hidden.
      s.mode = "gone";
    } else if (leaving && s.mode !== "exit" && s.mode !== "gone") {
      s.mode = "exit";
      s.t = 0;
    } else if (!leaving && (s.mode === "exit" || s.mode === "gone")) {
      // Coming back: enter again.
      s.mode = "waiting";
      s.t = 0;
      s.landed = false;
    }
  }, [leaving]);

  useFrame(() => {
    const group = outer.current;
    const body = inner.current;
    if (!group || !body) return;
    const { clock } = services;
    const dt = realtime ? clock.realDelta : clock.delta;
    const s = state.current;
    s.t += dt;
    s.age += dt;

    let landedNow = false;
    let done = false;
    switch (s.mode) {
      case "waiting":
        if (s.t >= 0) {
          s.mode = s.arc ? "arc" : "enter";
          s.t = 0;
          beat.current?.("start");
        }
        group.visible = false;
        return;
      case "enter": {
        done = enterPose(enter, s.t, pose, { distance: enterDistance, seed });
        const landAt = enter === "drop" ? 0.42 : enter === "rise" ? 0.32 : 0;
        if (!s.landed && s.t >= landAt) landedNow = true;
        if (done) s.mode = "rest";
        group.position.copy(rest);
        break;
      }
      case "arc": {
        const arc = s.arc!;
        done = arcPose(arc, s.t, pose);
        if (!s.landed && s.t >= 0.14 + arc.duration) landedNow = true;
        group.position.set(pose.x, pose.y, pose.z);
        pose.x = pose.y = pose.z = 0;
        if (done) {
          s.mode = "rest";
          s.arc = null;
        }
        break;
      }
      case "rest":
        pose.x = pose.y = pose.z = pose.rx = pose.rz = 0;
        pose.sx = pose.sy = pose.sz = 1;
        group.position.copy(rest);
        break;
      case "exit":
        done = exitPose(s.t, pose, { seed });
        group.position.copy(rest);
        if (done) {
          s.mode = "gone";
          beat.current?.("gone");
        }
        break;
      case "gone":
        group.visible = false;
        return;
    }
    if (landedNow) {
      s.landed = true;
      beat.current?.("land");
    }
    if (idle > 0 && s.mode !== "exit") idlePose(s.age, pose, { seed, amount: idle, hanging });
    group.visible = true;
    body.position.set(pose.x, pose.y, pose.z);
    body.scale.set(pose.sx * scale, pose.sy * scale, pose.sz * scale);
    body.rotation.set(pose.rx, 0, pose.rz);
  });

  return (
    <group ref={outer} visible={false} rotation={rotation}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

/** Seconds an entrance of `kind` takes (for staggering follow-up beats). */
export function enterSeconds(kind: EnterKind): number {
  return ENTER_SECONDS[kind];
}
