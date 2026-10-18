// The doodle's paper: an unlit-ish material for a doodle texture with a fade
// toward blank cream (the easel after the doodle lifted off), a dissolve
// (noise threshold with a glowing gold edge, for sketch-to-champion) and a
// soft rim of light. One instance per doodle plane; dispose with the plane.
// It applies the map's offset/repeat like three's own materials do: the
// doodle raster's rows run top to bottom and its texture flips them upright
// that way.

import { AdditiveBlending, Color, DoubleSide, Matrix3, ShaderMaterial, type Texture } from "three";
import { DRAWING_CANVAS_HEX } from "../../vocab";

export interface DoodleUniforms {
  [name: string]: { value: unknown };
  map: { value: Texture | null };
  /** The map's uv transform (its offset/repeat), fixed when the material is made. */
  uvTransform: { value: Matrix3 };
  uFade: { value: number };
  uDissolve: { value: number };
  uEdge: { value: Color };
  uPaper: { value: Color };
  uLight: { value: number };
  uOpacity: { value: number };
  uGlow: { value: number };
}

export type DoodleMaterial = ShaderMaterial & { uniforms: DoodleUniforms };

const vertexShader = /* glsl */ `
  uniform mat3 uvTransform;
  varying vec2 vUv;
  void main() {
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uFade;
  uniform float uDissolve;
  uniform vec3 uEdge;
  uniform vec3 uPaper;
  uniform float uLight;
  uniform float uOpacity;
  uniform float uGlow;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec4 tex = texture2D(map, vUv);
    vec3 color = mix(tex.rgb, uPaper, uFade);
    // Paper vignette so the sheet reads as an object, not a hole.
    vec2 c = vUv - 0.5;
    color *= uLight * (1.0 - dot(c, c) * 0.35);
    float alpha = uOpacity;
    if (uDissolve > 0.0) {
      float n = noise(vUv * 9.0) * 0.7 + noise(vUv * 23.0) * 0.3;
      float edge = n - uDissolve * 1.15 + 0.1;
      if (edge < 0.0) discard;
      float rim = 1.0 - smoothstep(0.0, 0.08, edge);
      color = mix(color, uEdge * 1.6, rim);
    }
    color += uEdge * uGlow;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export function createDoodleMaterial(map: Texture | null): DoodleMaterial {
  map?.updateMatrix();
  const material = new ShaderMaterial({
    uniforms: {
      map: { value: map },
      uvTransform: { value: map ? map.matrix.clone() : new Matrix3() },
      uFade: { value: 0 },
      uDissolve: { value: 0 },
      uEdge: { value: new Color("#f5c94c") },
      uPaper: { value: new Color(DRAWING_CANVAS_HEX) },
      uLight: { value: 1 },
      uOpacity: { value: 1 },
      uGlow: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: true,
  });
  return material as DoodleMaterial;
}

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vY;
  void main() {
    vUv = uv;
    vY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // Bright at the base, fading up; slow rising bands.
    float fade = pow(1.0 - vUv.y, 1.6);
    float bands = 0.65 + 0.35 * sin(vUv.y * 22.0 - uTime * 4.0);
    float sides = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 3.0 + uTime * 0.7);
    float a = fade * bands * sides * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export type BeamMaterial = ShaderMaterial & {
  uniforms: { uColor: { value: Color }; uIntensity: { value: number }; uTime: { value: number } };
};

/** The foundry beam: an additive, open cylinder of light rising from the pedestal. */
export function createBeamMaterial(color: string): BeamMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uIntensity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  }) as BeamMaterial;
}
