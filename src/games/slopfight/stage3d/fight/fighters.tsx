"use client";

// The two fighters on stage: each a <Creature> driven from the fight player's
// pose driver (so the rendered body is where its physics proxy is), with its
// hit jiggle and hop squash applied through the creature handle. Their bars
// and side markers are in hud.tsx.

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import { TOY_COLOR_VALUES } from "../../vocab";
import { Creature, type CreatureEvent, type CreatureHandle } from "../creature/creature";
import { useStageClock } from "../services";
import type { FightPlayer } from "./player";

/** The rig's highlights: only the stage key and rims leave a vinyl highlight on a creature. */
export const STAGE_SPECULAR_MIN_LIGHT = 1.3;

/**
 * The presentation clock's time scale for the creatures, as React state that
 * changes only when the scale moves by a step (hit stop, slow-mo ramps), so
 * the creatures freeze and slow with the world without re-rendering per frame.
 */
export function useClockScale(): number {
  const clock = useStageClock();
  const [scale, setScale] = useState(1);
  const current = useRef(1);
  useFrame(() => {
    const quantized = clock.frozen || clock.paused ? 0 : Math.round(clock.scale * 10) / 10;
    if (quantized !== current.current) {
      current.current = quantized;
      setScale(quantized);
    }
  }, -90);
  return scale;
}

export interface FightCreatureProps {
  player: FightPlayer;
  side: Side;
  timeScale: number;
  onCreatureEvent?: (side: Side, event: CreatureEvent) => void;
  /** Hide (a fighter that fell out of the scene after a ring-out). */
  visible?: boolean;
  handleRef?: (side: Side, handle: CreatureHandle | null) => void;
}

export function FightCreature({ player, side, timeScale, onCreatureEvent, visible = true, handleRef }: FightCreatureProps) {
  const handle = useRef<CreatureHandle | null>(null);
  const driver = player.drivers[side];
  const champion = player.champion(side);
  useFrame(() => {
    const creature = handle.current;
    if (!creature) return;
    if (driver.jiggle > 0) {
      creature.jiggle(driver.jiggle);
      driver.jiggle = 0;
    }
    if (driver.squash !== 0) {
      creature.squash(driver.squash);
      driver.squash = 0;
    }
  });
  useEffect(() => {
    handleRef?.(side, handle.current);
    return () => handleRef?.(side, null);
  }, [handleRef, side]);
  return (
    <group visible={visible}>
      <Creature
        ref={handle}
        champion={champion}
        driver={driver.driver}
        seed={side === "A" ? 11 : 23}
        timeScale={timeScale}
        specularMinLight={STAGE_SPECULAR_MIN_LIGHT}
        onEvent={onCreatureEvent ? (event) => onCreatureEvent(side, event) : undefined}
      />
    </group>
  );
}

/** A readable bar colour from the palette: the primary, lifted off dark tones (the recap's replay bars). */
export function barColor(champion: Champion): string {
  const primary = TOY_COLOR_VALUES[champion.palette.primary].hex;
  const value = Number.parseInt(primary.slice(1), 16);
  const luminance = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  if (luminance < 70) return TOY_COLOR_VALUES[champion.palette.secondary].hex;
  return primary;
}
