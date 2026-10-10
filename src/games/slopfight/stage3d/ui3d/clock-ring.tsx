"use client";

// <ClockRing>: the phase countdown as a set piece: a ring of chunky ticks
// that go dark one by one around a big number. It reads the server deadline
// through the presentation clock (`clock.now`), so it pauses with hit stop
// like everything else. Teal, gold at 10 s, tomato at 5 s; in the last
// seconds it throbs and ticks (`countdownTick`, live rooms only). It pops away
// when there is no deadline (timers off, or a phase that waits for players).
//
//   <ClockRing position={[-5.6, 2.4, 0.2]} radius={0.42} />           // the room's phase deadline
//   <ClockRing deadline={fight.startsAt} startedAt={...} label="BETS" /> // any server deadline

import { useFrame } from "@react-three/fiber";
import { Suspense, useRef, useState } from "react";
import type { Group, Mesh } from "three";
import { useStage } from "../services";
import { discGeometry, tickGeometry } from "./geometry";
import { darkOf, UI_COLORS, uiOutline, uiToon } from "./materials";
import { MotionGroup, type MotionGroupProps } from "./motion-group";
import { ringDown } from "./motion";
import { useRoomOrNull } from "./room";
import { stageSfx } from "./sound";
import { StageText } from "./text";

const TICKS = 24;
const TONES = { normal: "#2A9D8F", warning: UI_COLORS.gold, urgent: "#e8553d" } as const;

/** The tone for seconds left (matches the shell's countdowns: gold at 10, red at 5). */
export function clockTone(remaining: number): keyof typeof TONES {
  if (remaining <= 5) return "urgent";
  if (remaining <= 10) return "warning";
  return "normal";
}

export interface ClockRingProps extends Omit<MotionGroupProps, "children" | "leaving"> {
  /** Server deadline in ms. Omit to use the room's phase deadline; null hides the ring. */
  deadline?: number | null;
  /** When the countdown started (server ms; defaults to the room's phase start). */
  startedAt?: number;
  radius?: number;
  /** A small label under the number ("BUILD"). */
  label?: string | null;
  /** Tick sound in the last seconds (live rooms only). Default true. */
  sound?: boolean;
  /** Hide it even with a deadline. */
  hidden?: boolean;
}

export function ClockRing({ deadline, startedAt, radius = 0.45, label = null, sound = true, hidden = false, enter = "pop", ...motion }: ClockRingProps) {
  const services = useStage();
  const room = useRoomOrNull();
  const end = deadline === undefined ? (room?.view.room.phaseDeadline ?? null) : deadline;
  const start = startedAt ?? room?.view.room.phaseStartedAt ?? (end !== null ? end - 60_000 : 0);
  const ticks = useRef<(Mesh | null)[]>([]);
  const face = useRef<Group>(null);
  const [seconds, setSeconds] = useState(() => (end === null ? 0 : Math.max(0, Math.ceil((end - services.clock.now) / 1000))));
  const last = useRef({ seconds, throb: 0 });

  useFrame(() => {
    if (end === null) return;
    const now = services.clock.now;
    const total = Math.max(1000, end - start);
    const left = Math.max(0, end - now);
    const fraction = left / total;
    const whole = Math.ceil(left / 1000);
    const state = last.current;
    if (whole !== state.seconds) {
      if (whole < state.seconds && whole <= 5 && whole > 0) {
        state.throb = 0;
        if (sound) stageSfx(services).play("countdownTick", { intensity: whole <= 3 ? 0.7 : 0.4, gain: 0.7 });
      }
      state.seconds = whole;
      setSeconds(whole);
    }
    state.throb += services.clock.realDelta;
    const tone = TONES[clockTone(whole)];
    const lit = fraction * TICKS;
    for (let index = 0; index < TICKS; index += 1) {
      const tick = ticks.current[index];
      if (!tick) continue;
      // Tick 0 is at 12 o'clock; ticks go dark clockwise from there.
      const on = index < lit;
      const edge = on && index >= lit - 1;
      const material = uiToon(on ? tone : "#5b4a52", { glow: on ? 0.28 : 0.04, specular: on ? 0.5 : 0.1 });
      if (tick.material !== material) tick.material = material;
      const shrink = edge ? 0.55 + 0.45 * (lit - index) : 1;
      tick.scale.set(1, on ? shrink : 0.7, 1);
    }
    const group = face.current;
    if (group) {
      const urgent = whole <= 5 && whole > 0;
      const pulse = urgent ? ringDown(state.throb, 0.12, 3, 6) : 0;
      group.scale.set(1 + pulse, 1 + pulse * 1.4, 1);
    }
  });

  const tone = TONES[clockTone(seconds)];
  const disc = discGeometry(radius, radius * 0.22);
  const inner = discGeometry(radius * 0.7, radius * 0.08);
  const tick = tickGeometry(radius * 0.09, radius * 0.2, radius * 0.08);
  return (
    <MotionGroup enter={enter} leaving={hidden || end === null} {...motion}>
      <group ref={face}>
        <mesh geometry={disc} material={uiToon(UI_COLORS.plum, { glow: 0.1 })} castShadow />
        <mesh geometry={disc} material={uiOutline(UI_COLORS.plum, 2.4)} />
        <mesh geometry={inner} material={uiToon(darkOf(UI_COLORS.plum, 0.35), { glow: 0.06 })} position={[0, 0, radius * 0.11]} />
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * Math.PI * 2;
          const r = radius * 0.84;
          return (
            <mesh
              key={index}
              ref={(mesh) => {
                ticks.current[index] = mesh;
              }}
              geometry={tick}
              material={uiToon(tone, { glow: 0.28, specular: 0.5 })}
              position={[Math.sin(angle) * r, Math.cos(angle) * r, radius * 0.13]}
              rotation={[0, 0, -angle]}
            />
          );
        })}
        <Suspense fallback={null}>
          <StageText
            size={radius * (seconds >= 100 ? 0.62 : 0.8)}
            color={seconds <= 5 ? TONES.urgent : UI_COLORS.bone}
            outlineColor={UI_COLORS.plumEdge}
            outline={0.08}
            glow={0.3}
            position={[0, label ? radius * 0.1 : 0, radius * 0.16]}
            castShadow={false}
          >
            {String(seconds)}
          </StageText>
          {label && (
            <StageText size={radius * 0.17} color={UI_COLORS.gold} outline={0} glow={0.2} position={[0, -radius * 0.42, radius * 0.16]} castShadow={false}>
              {label}
            </StageText>
          )}
        </Suspense>
      </group>
    </MotionGroup>
  );
}
