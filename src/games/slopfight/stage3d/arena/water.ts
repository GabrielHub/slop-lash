// Water for Hazard_Water (the Flooded Garage's surround): animated ripples,
// a fresnel sheen toward the mood's reflection colour, and wet reflections of
// the set's practical lights as rippling vertical streaks. Not lit by the
// rig (water reads its light from the practicals), but fogged like the set.
// The same water, cut at the dry line with foam along it, is the finale's
// flood over the pad (`flood: true`; uDry is the dry floor's half-size).

import {
  Color,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type BufferGeometry,
} from "three";

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
#ifdef FLOOD_SHEET
uniform float uDry;
uniform float uFoam;
uniform vec3 uFoamColor;
#endif

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
  #ifdef FLOOD_SHEET
    // Past the dry line only: the waterline is exactly the sim's.
    float shore = max(abs(vWorld.x), abs(vWorld.z)) - uDry;
    if (shore < 0.0) discard;
  #endif
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

  #ifdef FLOOD_SHEET
    // Foam along the waterline (a lapping band), and swells rolling in toward it.
    float lap = sin(vWorld.x * 6.3 + uTime * 2.1) * sin(vWorld.z * 5.7 - uTime * 1.6);
    float band = 0.075 + 0.035 * (0.5 + 0.5 * lap);
    float foam = 1.0 - smoothstep(band * 0.6, band, shore);
    float swell = smoothstep(0.86, 0.97, fract(shore * 1.4 + uTime * 0.55)) * (1.0 - smoothstep(0.2, 1.4, shore));
    col = mix(col, uFoamColor, clamp(foam + swell * 0.35, 0.0, 1.0) * uFoam);
  #endif

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
  /** The finale's flood sheet: cut at the dry line (uDry), foam along it (uFoam 0..1). */
  flood?: boolean;
}

/** The flood sheet's foam. */
const FOAM_COLOR = "#e4fbef";

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
    defines: options.flood ? { FLOOD_SHEET: "" } : {},
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
        ...(options.flood ? { uDry: { value: 10 }, uFoam: { value: 0 }, uFoamColor: { value: new Color(FOAM_COLOR) } } : {}),
      },
    ]),
  });
}

/** The flood sheets' geometry, one per size: four vertices, shared by every set built and kept like the GLBs' own (never disposed). */
const sheetGeometries = new Map<number, BufferGeometry>();

function floodSheetGeometry(halfSize: number): BufferGeometry {
  let geometry = sheetGeometries.get(halfSize);
  if (!geometry) {
    geometry = new PlaneGeometry(halfSize * 2, halfSize * 2, 1, 1).rotateX(-Math.PI / 2);
    const tint = [0.07, 0.3, 0.2];
    geometry.setAttribute("color", new Float32BufferAttribute(Array.from({ length: geometry.attributes.position!.count }, () => tint).flat(), 3));
    sheetGeometries.set(halfSize, geometry);
  }
  return geometry;
}

/**
 * The flood over the pad: a sheet of the arena's water `halfSize` square at
 * height `y`, drawn only past the dry line. Its vertex tint matches the
 * surround's open water. The geometry is shared: dispose only the material.
 */
export function createFloodSheet(material: ShaderMaterial, halfSize: number, y: number): Mesh<BufferGeometry, ShaderMaterial> {
  const mesh = new Mesh(floodSheetGeometry(halfSize), material);
  mesh.name = "Finale_Flood";
  mesh.position.y = y;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
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
