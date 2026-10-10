"use client";

// The lighting rig. A three-point stage rig (warm key with soft shadows, cool
// fill, strong rim) tinted per arena, a coloured bounce, the set's practicals
// from its Light_* empties (with flicker), contact shadows under everything
// on the platform, fog tuned to the set's depth, and the sky dome.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type Ref } from "react";
import { Object3D, type DirectionalLight, type PointLight, type SpotLight } from "three";
import type { LightMarker } from "../arena/nodes";
import { flickerAt } from "../director/noise";
import { useArenaNodes, useQuality, useStageClock } from "../services";
import { ContactShadows } from "./contact-shadows";
import type { ArenaMood } from "./moods";
import { SkyDome } from "./sky";

/** Flicker channel for an amount: a light and its glowing mesh share one. */
export const flickerChannel = (amount: number) => Math.round(amount * 1000);

/** Half-size of the key light's shadow frustum: the platform plus a margin for fighters flying off it. */
const SHADOW_HALF = 5;

export function StageLighting({ mood, platformHalf = 3 }: { mood: ArenaMood; platformHalf?: number }) {
  const quality = useQuality();
  const keyRef = useRef<DirectionalLight>(null);

  useEffect(() => {
    const key = keyRef.current;
    if (!key) return;
    const size = quality.shadowMapSize;
    if (key.shadow.mapSize.x === size) return;
    key.shadow.mapSize.set(size, size);
    key.shadow.map?.dispose();
    key.shadow.map = null;
  }, [quality.shadowMapSize]);

  return (
    <>
      <color attach="background" args={[mood.fog.color]} />
      <fog attach="fog" args={[mood.fog.color, mood.fog.near, mood.fog.far]} />
      <SkyDome mood={mood} />
      <hemisphereLight args={[mood.bounce.sky, mood.bounce.ground, mood.bounce.intensity]} />
      <directionalLight
        ref={keyRef}
        color={mood.key.color}
        intensity={mood.key.intensity}
        position={mood.key.position as [number, number, number]}
        castShadow
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={quality.level >= 2 ? 2 : 4}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
      />
      <directionalLight color={mood.fill.color} intensity={mood.fill.intensity} position={mood.fill.position as [number, number, number]} />
      <directionalLight color={mood.rim.color} intensity={mood.rim.intensity} position={mood.rim.position as [number, number, number]} />
      <Practicals mood={mood} />
      <ContactShadows
        size={platformHalf * 2 + 1.2}
        resolution={quality.contactShadowSize}
        color={mood.shadow}
        opacity={0.62}
      />
    </>
  );
}

/** The set's own lights, created from its Light_* empties. */
function Practicals({ mood }: { mood: ArenaMood }) {
  const nodes = useArenaNodes();
  const lights = nodes?.lights ?? [];
  return (
    <>
      {lights.map((marker) => (
        <Practical key={`${nodes?.arena}:${marker.name}`} marker={marker} scale={mood.practicalScale} />
      ))}
    </>
  );
}

function Practical({ marker, scale }: { marker: LightMarker; scale: number }) {
  const clock = useStageClock();
  const ref = useRef<PointLight | SpotLight | DirectionalLight>(null);
  const target = useMemo(() => {
    const object = new Object3D();
    if (marker.target) object.position.copy(marker.target);
    else object.position.set(marker.position.x, marker.position.y - 1, marker.position.z);
    return object;
  }, [marker]);
  const base = marker.kind === "directional" ? marker.intensity * 0.5 : marker.intensity * scale;
  const channel = flickerChannel(marker.flicker);

  useFrame(() => {
    const light = ref.current;
    if (!light) return;
    light.intensity = base * flickerAt(marker.flicker, clock.elapsed, channel);
  });

  const position = marker.position.toArray() as [number, number, number];
  if (marker.kind === "directional") {
    // A far-off source (the rooftop moon): no falloff, so no practical scale.
    return (
      <>
        <primitive object={target} />
        <directionalLight
          ref={ref as Ref<DirectionalLight>}
          position={position}
          color={marker.color}
          intensity={marker.intensity * 0.5}
          target={target}
        />
      </>
    );
  }
  if (marker.kind === "point") {
    return (
      <pointLight
        ref={ref as Ref<PointLight>}
        position={position}
        color={marker.color}
        intensity={base}
        distance={marker.distance || 0}
        decay={2}
      />
    );
  }
  // Spots, and rect lights approximated as wide soft spots (RectAreaLight does
  // not light toon materials).
  const isRect = marker.kind === "rect";
  const angle = isRect ? Math.PI * 0.42 : Math.min(Math.PI / 2.2, ((marker.angle || 50) * Math.PI) / 180 / 2 + 0.05);
  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={ref as Ref<SpotLight>}
        position={position}
        color={marker.color}
        intensity={isRect ? base * 1.6 : base}
        distance={marker.distance || (isRect ? 16 : 0)}
        decay={isRect ? 1.4 : 2}
        angle={angle}
        penumbra={isRect ? 1 : 0.65}
        target={target}
      />
    </>
  );
}
