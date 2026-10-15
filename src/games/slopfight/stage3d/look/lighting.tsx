"use client";

// The lighting rig. Each arena uses its authored practicals and baked bounce,
// with a faint ambient fill. The set's practicals come
// from its Light_* empties, contact shadows under everything
// on the platform, fog tuned to the set's depth, and the sky dome.

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Object3D, type DirectionalLight, type SpotLight } from "three";
import type { ArenaGeometry } from "../../arenas";
import type { LightMarker } from "../arena/nodes";
import { useArenaNodes, useQuality } from "../services";
import type { StagePhase } from "../stage-input";
import { ContactShadows } from "./contact-shadows";
import { readIrradianceProbe } from "./irradiance";
import type { ArenaMood } from "./moods";
import { SkyDome } from "./sky";

/** Half-size of the key light's shadow frustum: the platform plus a margin for fighters flying off it. */
const SHADOW_HALF = 5;

function useShadowMapSize(ref: RefObject<DirectionalLight | SpotLight | null>, size: number | undefined) {
  useEffect(() => {
    const light = ref.current;
    if (!light || size === undefined) return;
    light.shadow.mapSize.set(size, size);
    // R3F updates mapSize before the effect, but Three keeps the old target.
    // Compare the allocation itself so live quality switches recreate it.
    const map = light.shadow.map;
    if (!map || (map.width === size && map.height === size)) return;
    map.dispose();
    light.shadow.map = null;
  }, [ref, size]);
}

export function StageLighting({ mood, geometry, phase }: { mood: ArenaMood; geometry: ArenaGeometry; phase: StagePhase }) {
  const quality = useQuality();
  const nodes = useArenaNodes();
  const probe = useMemo(() => readIrradianceProbe(nodes?.get("Probe_Ambient")?.userData.sf_probe_sh), [nodes]);
  // Missing assets also lose their practicals. Keep the canonical stand-in lit.
  const key = nodes?.lights.length ? mood.key : { color: mood.key.color, intensity: 1.8, position: [4.5, 7.5, 6] as const };
  const keyRef = useRef<DirectionalLight>(null);

  useShadowMapSize(keyRef, quality.shadowMapSize);

  return (
    <>
      <color attach="background" args={[mood.fog.color]} />
      <fog attach="fog" args={[mood.fog.color, mood.fog.near, mood.fog.far]} />
      <SkyDome mood={mood} />
      {probe ? <primitive object={probe} /> : <hemisphereLight args={[mood.bounce.sky, mood.bounce.ground, mood.bounce.intensity]} />}
      {key.intensity > 0 && <directionalLight
        ref={keyRef}
        color={key.color}
        intensity={key.intensity}
        position={key.position as [number, number, number]}
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
      />}
      {mood.fill.intensity > 0 && <directionalLight color={mood.fill.color} intensity={mood.fill.intensity} position={mood.fill.position as [number, number, number]} />}
      {mood.rim.intensity > 0 && <directionalLight color={mood.rim.color} intensity={mood.rim.intensity} position={mood.rim.position as [number, number, number]} />}
      <ArenaPracticals lights={nodes?.lights ?? []} scale={mood.practicalScale} shadowMapSize={quality.shadowMapSize} phase={phase} />
      <ContactShadows
        geometry={geometry}
        size={geometry.halfSize * 2 + 1.2}
        y={geometry.topY + 0.012}
        resolution={quality.contactShadowSize}
        color={mood.shadow}
        opacity={0.62}
      />
    </>
  );
}

/** The set's own lights, created from its Light_* empties. */
export function ArenaPracticals({ lights, scale, shadowMapSize, phase = "FIGHT" }: { lights: readonly LightMarker[]; scale: number; shadowMapSize?: number; phase?: StagePhase }) {
  return (
    <>
      {lights.filter((marker) => !marker.phases || marker.phases.includes(phase)).map((marker) => (
        <Practical key={marker.name} marker={marker} scale={scale} shadowMapSize={shadowMapSize} />
      ))}
    </>
  );
}

function Practical({ marker, scale, shadowMapSize }: { marker: LightMarker; scale: number; shadowMapSize?: number }) {
  const ref = useRef<SpotLight>(null);
  useShadowMapSize(ref, shadowMapSize);
  const target = useMemo(() => {
    const object = new Object3D();
    if (marker.target) object.position.copy(marker.target);
    else object.position.set(marker.position.x, marker.position.y - 1, marker.position.z);
    return object;
  }, [marker]);
  // Keep illumination steady. Tiny emissive variations on the bulbs do not
  // need to pump the exposure or move the crowd across toon-light bands.

  const position = marker.position.toArray() as [number, number, number];
  if (marker.kind === "directional") {
    // A far-off source (the rooftop moon): no falloff, so no practical scale.
    return (
      <>
        <primitive object={target} />
        <directionalLight
          position={position}
          color={marker.color}
          intensity={marker.intensity * 0.5}
          target={target}
        />
      </>
    );
  }
  const base = marker.intensity * scale;
  if (marker.kind === "point") {
    return (
      <pointLight
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
        ref={ref}
        position={position}
        color={marker.color}
        intensity={isRect ? base * 1.6 : base}
        distance={marker.distance || (isRect ? 16 : 0)}
        decay={isRect ? 1.4 : 2}
        angle={angle}
        penumbra={isRect ? 1 : 0.65}
        target={target}
        castShadow={marker.castShadow === true && shadowMapSize !== undefined}
        shadow-mapSize={[shadowMapSize ?? 512, shadowMapSize ?? 512]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.025}
        shadow-camera-near={0.5}
        shadow-camera-far={marker.distance || 30}
      />
    </>
  );
}
