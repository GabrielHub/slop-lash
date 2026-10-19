"use client";

// The rooftop's finale, The Storm: rain driven downwind and lightning over
// the skyline. The rain is one draw call: streak quads whose positions the
// vertex shader computes from presentation time (so it freezes in a hit
// stop), wrapped in a box that follows the camera, so wherever the director
// cuts the streaks are close enough to read on a TV. The flash itself is the
// post grade's (look/effects.ts); here the bolt shows against the sky while
// it lasts. Both follow `services.finale` and do nothing while it is calm.

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from "three";
import { lightningAt, type StageFinale } from "./finale";
import { useQuality, useStage } from "../services";

/** Streaks per quality rung (one draw call; thin, so overdraw stays small). */
const RAIN_COUNT = [1600, 1400, 1100, 700];
/** The box of rain around the view: its size, and how far in front of the camera its centre sits. */
const BOX = new Vector3(15, 11, 15);
const BOX_AHEAD = 5;
/** Drop velocity, m/s: falling, and blown downwind. */
const FALL = 12.5;
const DRIFT = 6.5;

const rainVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aSeed;
uniform float uTime;
uniform float uAmount;
uniform vec3 uCenter;
uniform vec3 uSize;
uniform vec3 uVel;
uniform vec3 uSlant;
uniform float uLength;
uniform float uWidth;
varying float vAlong;
varying float vSide;
varying float vFade;
void main() {
  float shown = step(aSeed.w, uAmount);
  vec3 boxMin = uCenter - 0.5 * uSize;
  float speed = 0.85 + 0.3 * fract(aSeed.w * 13.7);
  // World-fixed drops, wrapped into the box that follows the camera.
  vec3 p = aSeed.xyz * uSize + uVel * speed * uTime;
  p = boxMin + mod(p - boxMin, uSize);
  float len = uLength * (0.7 + 0.6 * fract(aSeed.w * 7.31));
  vec3 along = p - uSlant * len * (1.0 - position.y);
  vec3 toCam = normalize(cameraPosition - along);
  vec3 side = normalize(cross(uSlant, toCam));
  vec3 world = along + side * position.x * uWidth;
  float dist = length(cameraPosition - world);
  // Drops right at the lens would streak over the fighters: they fade in from a few metres.
  vFade = shown * smoothstep(1.2, 3.5, dist);
  vAlong = position.y;
  vSide = position.x;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = shown > 0.5 ? projectionMatrix * mvPosition : vec4(2.0, 2.0, 2.0, 1.0);
  #include <fog_vertex>
}
`;

const rainFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFlash;
varying float vAlong;
varying float vSide;
varying float vFade;
void main() {
  float a = vAlong * vAlong * (1.0 - abs(vSide)) * vFade * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + uFlash * 2.2), min(1.0, a * (1.0 + uFlash)));
  #include <fog_fragment>
}
`;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createRain(count: number): Mesh<BufferGeometry, ShaderMaterial> {
  const random = rng(9091);
  const positions: number[] = [];
  const seeds: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const seed = [random(), random(), random(), random()];
    for (const [side, end] of [[-1, 0], [1, 0], [1, 1], [-1, 1]] as const) {
      positions.push(side, end, 0);
      seeds.push(...seed);
    }
    const k = i * 4;
    indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 4));
  geometry.setIndex(indices);
  const material = new ShaderMaterial({
    vertexShader: rainVertex,
    fragmentShader: rainFragment,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uCenter: { value: new Vector3() },
        uSize: { value: BOX.clone() },
        uVel: { value: new Vector3(0, -FALL, 0) },
        uSlant: { value: new Vector3(0, -1, 0) },
        uLength: { value: 0.75 },
        uWidth: { value: 0.016 },
        uColor: { value: new Color("#cdd8ff") },
        uOpacity: { value: 0.5 },
        uFlash: { value: 0 },
      },
    ]),
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "Finale_Rain";
  // Positions come from the shader; never cull, never cast.
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

/** A jagged bolt in its own plane (x across, y up, 0..1 tall), with two forks. */
function createBolt(seed: number): BufferGeometry {
  const random = rng(seed);
  const positions: number[] = [];
  const indices: number[] = [];
  const ribbon = (points: Array<[number, number]>, width: number) => {
    const start = positions.length / 3;
    points.forEach(([x, y], i) => {
      const w = width * (1 - (i / points.length) * 0.6);
      positions.push(x - w, y, 0, x + w, y, 0);
    });
    for (let i = 0; i < points.length - 1; i += 1) {
      const k = start + i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  };
  const trunk: Array<[number, number]> = [];
  let x = 0;
  for (let i = 0; i <= 14; i += 1) {
    trunk.push([x, 1 - i / 14]);
    x += (random() - 0.5) * 0.16;
  }
  ribbon(trunk, 0.012);
  for (const from of [4, 8]) {
    const [fx, fy] = trunk[from]!;
    const fork: Array<[number, number]> = [[fx, fy]];
    let bx = fx;
    const lean = random() < 0.5 ? -1 : 1;
    for (let i = 1; i <= 5; i += 1) {
      bx += lean * (0.03 + random() * 0.05);
      fork.push([bx, fy - i * 0.045]);
    }
    ribbon(fork, 0.007);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

const BOLT_VARIANTS = 3;
/**
 * The bolt: it comes down `spread` (NDC) to one side of the frame, this far
 * out (m, horizontally: past the near city blocks, in front of the skyline
 * card), from high above the frame to the street, `width` x `height` m. The
 * near blocks hide whatever of it is behind them.
 */
const BOLT = { distance: 46, foot: -30, height: 100, width: 30, spread: 0.45 };

const tmpForward = new Vector3();
const tmpRay = new Vector3();

/** `finale` defaults to the stage's; a replay drawn into its own texture passes its own. */
export function StormFx({ finale: own }: { finale?: StageFinale } = {}) {
  const services = useStage();
  const quality = useQuality();
  const count = RAIN_COUNT[Math.min(RAIN_COUNT.length - 1, quality.level)]!;
  const rain = useMemo(() => createRain(count), [count]);
  const bolts = useMemo(() => {
    const material = new MeshBasicMaterial({
      color: new Color("#e9e4ff").multiplyScalar(5),
      fog: false,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const meshes = Array.from({ length: BOLT_VARIANTS }, (_, i) => {
      const mesh = new Mesh(createBolt(3 + i * 17), material);
      mesh.name = `Finale_Bolt_${i}`;
      mesh.frustumCulled = false;
      mesh.visible = false;
      return mesh;
    });
    return { material, meshes };
  }, []);
  useEffect(
    () => () => {
      rain.geometry.dispose();
      rain.material.dispose();
    },
    [rain],
  );
  useEffect(
    () => () => {
      bolts.material.dispose();
      for (const mesh of bolts.meshes) mesh.geometry.dispose();
    },
    [bolts],
  );

  useFrame((state) => {
    const finale = own ?? services.finale;
    const storm = finale.spec?.id === "storm" ? finale : null;
    const amount = storm ? storm.strength : 0;
    const u = rain.material.uniforms;
    u.uAmount!.value = amount;
    const camera = state.camera;
    tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
    if (tmpForward.lengthSq() < 1e-6) tmpForward.set(0, 0, -1);
    tmpForward.normalize();
    // The bolts and the rain clear the frame once the storm has passed.
    for (const mesh of bolts.meshes) mesh.visible = false;
    if (!storm || amount <= 0) return;
    u.uTime!.value = services.clock.elapsed;
    (u.uCenter!.value as Vector3).copy(camera.position).addScaledVector(tmpForward, BOX_AHEAD);
    (u.uVel!.value as Vector3).set(storm.dirX * DRIFT, -FALL, storm.dirZ * DRIFT);
    // Gusts lean the streaks further downwind.
    const lean = Math.min(1.5, Math.max(0, storm.wind - 0.4)) * 3;
    (u.uSlant!.value as Vector3).set(storm.dirX * (DRIFT + lean), -FALL, storm.dirZ * (DRIFT + lean)).normalize();
    const flash = lightningAt(storm.sinceMs) * (storm.driven ? 1 : amount);
    u.uFlash!.value = flash;

    // The bolt: far out in front of the camera, over the skyline, while the flash lasts.
    if (flash > 0.2 && storm.sinceMs >= 0) {
      const strike = Math.floor(storm.sinceMs / 1000);
      const mesh = bolts.meshes[strike % BOLT_VARIANTS]!;
      // Alternate sides, out toward the frame's edges (the middle is usually the marquee).
      const side = (strike % 2 === 0 ? -1 : 1) * BOLT.spread * (0.75 + 0.25 * (((strike * 7919) % 11) / 10));
      tmpRay.set(side, 0, 0.5).unproject(camera).sub(camera.position).setY(0);
      if (tmpRay.lengthSq() < 1e-6) tmpRay.copy(tmpForward);
      tmpRay.normalize();
      mesh.position.copy(camera.position).addScaledVector(tmpRay, BOLT.distance);
      mesh.position.y = BOLT.foot;
      mesh.rotation.set(0, Math.atan2(-tmpForward.x, -tmpForward.z), 0);
      mesh.scale.set(BOLT.width, BOLT.height, 1);
      mesh.visible = true;
      bolts.material.opacity = Math.min(1, flash * 1.6);
    }
  });

  return (
    <>
      <primitive object={rain} />
      {bolts.meshes.map((mesh) => (
        <primitive key={mesh.name} object={mesh} />
      ))}
    </>
  );
}
