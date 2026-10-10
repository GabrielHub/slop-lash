"use client";

// The backdrop behind every set: a vertical gradient dome in the arena's mood
// (with stars on the rooftop), so there is never a flat void behind the set.
// Animated faintly (twinkle) from the presentation clock.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BackSide, Color, ShaderMaterial } from "three";
import { useStageClock } from "../services";
import type { ArenaMood } from "./moods";

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  float y = vDir.y;
  vec3 col = y > 0.0
    ? mix(uHorizon, uTop, pow(clamp(y * 1.6, 0.0, 1.0), 0.7))
    : mix(uHorizon, uBottom, clamp(-y * 3.0, 0.0, 1.0));
  // A soft glow band at the horizon (city light, window light).
  col += uHorizon * 0.25 * exp(-abs(y) * 14.0);
  if (uStars > 0.0 && y > 0.08) {
    vec3 cell = floor(vDir * 180.0);
    float star = step(0.9965, hash(cell));
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + hash(cell + 3.0) * 3.0) + hash(cell + 7.0) * 6.28);
    col += vec3(1.0, 0.92, 0.82) * star * twinkle * uStars * smoothstep(0.08, 0.35, y) * 1.4;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export function SkyDome({ mood }: { mood: ArenaMood }) {
  const clock = useStageClock();
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uBottom: { value: new Color() },
          uStars: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    (material.uniforms.uTop!.value as Color).set(mood.sky.top);
    (material.uniforms.uHorizon!.value as Color).set(mood.sky.horizon);
    (material.uniforms.uBottom!.value as Color).set(mood.sky.bottom);
    material.uniforms.uStars!.value = mood.sky.stars;
  }, [material, mood]);
  useFrame(() => {
    material.uniforms.uTime!.value = clock.elapsed;
  });
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false} scale={80}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}
