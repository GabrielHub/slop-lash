// Water for Hazard_Water (the Flooded Garage's surround): animated ripples,
// a fresnel sheen toward the mood's reflection colour, and wet reflections of
// the set's practical lights as rippling vertical streaks. Not lit by the
// rig (water reads its light from the practicals), but fogged like the set.

import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from "three";

const MAX_LIGHTS = 4;

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  #ifdef USE_COLOR
    vTint = color.rgb;
  #else
    vTint = vec3(1.0);
  #endif
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSheen;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform int uLightCount;
uniform vec3 uRippleOrigins[3];
varying vec3 vWorld;
varying vec3 vTint;

vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.3) * cos(dot(p, vec2(0.8, 0.3)) * 3.1 + t * 1.3) * 0.05;
  g += vec2(-0.4, 0.9) * cos(dot(p, vec2(-0.4, 0.9)) * 4.7 - t * 1.7) * 0.035;
  g += vec2(0.6, -0.7) * cos(dot(p, vec2(0.6, -0.7)) * 9.3 + t * 2.9) * 0.02;
  for (int i = 0; i < 3; i++) {
    vec2 d = p - uRippleOrigins[i].xz;
    float r = length(d) + 1e-4;
    float ring = sin(r * 11.0 - t * 3.2 - float(i) * 2.1) * exp(-r * 0.45) * 0.06;
    g += (d / r) * ring;
  }
  return g;
}

void main() {
  vec2 grad = waveGrad(vWorld.xz, uTime);
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 4.0);

  vec3 base = mix(uDeep, uShallow, clamp(vTint.g * 1.6, 0.0, 1.0)) * (0.7 + 0.3 * vTint);
  vec3 col = mix(base, uSheen * 0.55, fres * 0.75);

  // Wet reflections: each practical mirrors into a streak that ripples.
  vec3 r = reflect(-viewDir, n);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i] - vWorld;
    vec3 l = normalize(toLight);
    vec3 h = r - l;
    // Stretch vertically (anisotropic streaks), tighter horizontally.
    float spot = exp(-(h.x * h.x + h.z * h.z) * 120.0 - h.y * h.y * 6.0);
    float falloff = 1.0 / (1.0 + dot(toLight, toLight) * 0.01);
    col += uLightColor[i] * spot * falloff * 1.3;
  }
  // Ripple crests catch a little sheen.
  col += uSheen * smoothstep(0.035, 0.07, length(grad)) * 0.08;

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export interface WaterOptions {
  deep: string;
  shallow: string;
  sheen: string;
  lights: Array<{ position: Vector3; color: string; intensity: number }>;
  rippleOrigins?: Vector3[];
}

export function createWaterMaterial(options: WaterOptions): ShaderMaterial {
  const lights = options.lights.slice(0, MAX_LIGHTS);
  const positions = Array.from({ length: MAX_LIGHTS }, (_, i) => lights[i]?.position.clone() ?? new Vector3());
  const colors = Array.from({ length: MAX_LIGHTS }, (_, i) =>
    lights[i] ? new Color(lights[i].color).multiplyScalar(Math.min(2, lights[i].intensity / 6)) : new Color(0, 0, 0),
  );
  const origins = options.rippleOrigins ?? [new Vector3(-4.2, 0, 2), new Vector3(4.3, 0, -3.3), new Vector3(-1.8, 0, 4.6)];
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    vertexColors: true,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new Color(options.deep) },
        uShallow: { value: new Color(options.shallow) },
        uSheen: { value: new Color(options.sheen) },
        uLightPos: { value: positions },
        uLightColor: { value: colors },
        uLightCount: { value: lights.length },
        uRippleOrigins: { value: origins.slice(0, 3) },
      },
    ]),
  });
}

/** A shimmering, additive overlay for Hazard_Water_Ripples (ring decals on the water). */
export function createRippleMaterial(sheen: string): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      varying vec3 vTint;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        #ifdef USE_COLOR
          vTint = color.rgb;
        #else
          vTint = vec3(1.0);
        #endif
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uSheen;
      varying vec3 vWorld;
      varying vec3 vTint;
      void main() {
        float pulse = 0.5 + 0.5 * sin(uTime * 1.6 + vWorld.x * 1.3 + vWorld.z * 0.9);
        gl_FragColor = vec4(uSheen * vTint * (0.25 + 0.5 * pulse), 0.35 + 0.4 * pulse);
        #include <fog_fragment>
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uSheen: { value: new Color(sheen) } }]),
  });
}
