// The SlopFight toon material: soft vinyl toys under a stage light.
//
// A MeshToonMaterial with its direct-light term replaced (onBeforeCompile):
// - two-band cel shading with a soft terminator, computed on wrapped N.L so
//   the terminator sits past the equator and the dark band never goes black;
// - the dark side glows faintly with a saturated version of the base colour,
//   strongest facing away from the light (a translucent toy);
// - a small, sharp vinyl highlight (from the key light only: dim lights leave none);
// - a warm fresnel rim;
// - cast shadows fold into the light band (a shadow is the dark band, not a
//   black hole), and it works with every three.js light, fog, vertex colours,
//   skinning and instancing.
// Creatures add `wobble`: jelly vertex displacement (idle breathing, a ripple
// driven by speed, a hit jiggle, and the top trailing behind motion), shared
// with the outline material so the hull follows the body. Creature materials
// (the wobbling ones) also shade finishes (SLOP_FINISH, look/finish-glsl.ts):
// their geometry carries FINISH_ATTRIBUTE (finish id, wobble scale), and the
// wobble scale also reaches the outline hull, so rigid parts barely jelly.
//
// Works for vertex-coloured static meshes (arenas, props) as well as skinned
// creatures: createToonMaterial({ wobble: false }).

import {
  Color,
  MeshToonMaterial,
  ShaderChunk,
  Vector3,
  type ColorRepresentation,
  type IUniform,
} from "three";
import { FINISH_FRAGMENT_PARS, FINISH_SETUP, FINISH_VERTEX, FINISH_VERTEX_PARS } from "./finish-glsl";

/** The creature geometry attribute: [finish id, wobble scale] per vertex (creature/mesher.ts). */
export const FINISH_ATTRIBUTE = "slopFinish";

/**
 * Finish pattern detail, shared by every creature material: 1 runs the full
 * patterns, 0 the cheap path (the low quality tier).
 */
export const FINISH_DETAIL: IUniform<number> = { value: 1 };

export interface WobbleUniforms {
  [name: string]: IUniform;
  uTime: IUniform<number>;
  /** Ripple amplitude, in creature heights (speed-driven). */
  uWobbleAmp: IUniform<number>;
  /** Ripple spatial frequency (per creature height). */
  uWobbleFreq: IUniform<number>;
  /** Hit jiggle amplitude, in creature heights (decays on the CPU). */
  uJiggle: IUniform<number>;
  /** How far the top trails behind motion, creature space, in creature heights. */
  uLag: IUniform<Vector3>;
  /** Idle breathing amplitude, in creature heights. */
  uBreath: IUniform<number>;
  /** Rest height of the creature (bind space y of its top). */
  uHeight: IUniform<number>;
  /** Per-creature phase offset. */
  uSeed: IUniform<number>;
}

export function createWobbleUniforms(seed = 0, height = 1): WobbleUniforms {
  return {
    uTime: { value: 0 },
    uWobbleAmp: { value: 0 },
    uWobbleFreq: { value: 2.2 },
    uJiggle: { value: 0 },
    uLag: { value: new Vector3() },
    uBreath: { value: 0.012 },
    uHeight: { value: height },
    uSeed: { value: seed },
  };
}

/**
 * Vertex-shader declarations for the wobble (needs `normal` in bind space).
 * With SLOP_FINISH, the jelly (breath, ripple, jiggle) scales by the vertex's
 * wobble scale; the lag sways the whole body (the view scales it on the CPU).
 */
export const WOBBLE_PARS = /* glsl */ `
#ifdef SLOP_WOBBLE
uniform float uTime;
uniform float uWobbleAmp;
uniform float uWobbleFreq;
uniform float uJiggle;
uniform vec3 uLag;
uniform float uBreath;
uniform float uHeight;
uniform float uSeed;
#ifdef SLOP_FINISH
attribute vec2 slopFinish;
#endif
vec3 slopWobble( vec3 p, vec3 n, float scale ) {
  float hgt = max( uHeight, 0.05 );
  float h = clamp( p.y / hgt, 0.0, 1.4 );
  float body = smoothstep( 0.04, 0.4, h );
  float breath = uBreath * sin( uTime * 2.1 + uSeed ) * body * ( 1.25 - h );
  float ripple = sin( dot( p, vec3( 5.3, 7.1, 4.7 ) ) * uWobbleFreq / hgt + uTime * 10.0 + uSeed );
  float jig = uJiggle * sin( uTime * 36.0 + p.y * 11.0 / hgt + uSeed );
  vec3 d = n * ( breath + ripple * uWobbleAmp + jig ) * hgt * body * scale;
  d += uLag * ( h * h ) * hgt;
  return p + d;
}
#endif
`;

/** Replaces `#include <begin_vertex>`: applies the wobble in bind space, before skinning. */
export const WOBBLE_VERTEX = /* glsl */ `
#include <begin_vertex>
#ifdef SLOP_WOBBLE
#ifdef SLOP_FINISH
transformed = slopWobble( transformed, normal, slopFinish.y );
#else
transformed = slopWobble( transformed, normal, 1.0 );
#endif
#endif
`;

export interface ToonOptions {
  /** Base colour, multiplied with vertex colours. Default white. */
  color?: ColorRepresentation;
  /** Use the geometry's `color` attribute. Default true. */
  vertexColors?: boolean;
  /** Brightness of the dark band (0..1). Default 0.36. */
  shade?: number;
  /** Tint of the dark band (cool). */
  shadeTint?: ColorRepresentation;
  /** Where the band flips, in wrapped N.L (0..1). Default 0.5. */
  threshold?: number;
  /** Half-width of the terminator. Default 0.06. */
  softness?: number;
  /** Wrap lighting amount. Default 0.4. */
  wrap?: number;
  /** Dark-side glow strength. Default 0.35. */
  translucency?: number;
  /** Vinyl highlight strength. Default 0.4. */
  specular?: number;
  /** Highlight size as an N.H threshold (higher is smaller). Default 0.995. */
  specularSize?: number;
  /**
   * Lights dimmer than this (mean of linear colour x intensity) leave no
   * highlight, so a toy shows one vinyl glint from the key instead of one per
   * light. Tune it to the rig (between the key and the dimmer lights). Default 0
   * (off: every light leaves a highlight).
   */
  specularMinLight?: number;
  /** Rim strength. Default 0.26. */
  rim?: number;
  rimColor?: ColorRepresentation;
  /** Rim width (0..1 of the grazing range). Default 0.28. */
  rimWidth?: number;
  emissive?: ColorRepresentation;
  /** Add the creature wobble (pass shared uniforms to keep the outline in step). */
  wobble?: WobbleUniforms | boolean;
}

export interface ToonUniforms {
  [name: string]: IUniform;
  uShade: IUniform<number>;
  uShadeTint: IUniform<Color>;
  uThreshold: IUniform<number>;
  uSoft: IUniform<number>;
  uWrap: IUniform<number>;
  uTranslucency: IUniform<number>;
  uSpec: IUniform<number>;
  uSpecSize: IUniform<number>;
  uSpecMinLight: IUniform<number>;
  uRim: IUniform<number>;
  uRimColor: IUniform<Color>;
  uRimWidth: IUniform<number>;
}

export type ToonMaterial = MeshToonMaterial & {
  userData: { toon: ToonUniforms; wobble: WobbleUniforms | null };
};

const TOON_PARS = /* glsl */ `
varying vec3 vViewPosition;

struct ToonMaterial {
  vec3 diffuseColor;
};

uniform float uShade;
uniform vec3 uShadeTint;
uniform float uThreshold;
uniform float uSoft;
uniform float uWrap;
uniform float uTranslucency;
uniform float uSpec;
uniform float uSpecSize;
uniform float uSpecMinLight;
uniform float uRim;
uniform vec3 uRimColor;
uniform float uRimWidth;

// The shadow factor of the light being shaded (the lights loop writes it).
float toonShadow = 1.0;

vec3 slopSaturate( vec3 c, float amount ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  return max( mix( vec3( l ), c, amount ), 0.0 );
}
${FINISH_FRAGMENT_PARS}
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  #ifdef SLOP_FINISH
  float shadeK = fShade;
  vec3 shadeTint = fShadeTint;
  float threshold = fThreshold;
  float soft = fSoft;
  float translucency = fTrans;
  float specK = fSpec;
  float specSize = fSpecSize;
  float specGate = fSpecGate;
  #else
  float shadeK = uShade;
  vec3 shadeTint = uShadeTint;
  float threshold = uThreshold;
  float soft = uSoft;
  float translucency = uTranslucency;
  float specK = uSpec;
  float specSize = uSpecSize;
  float specGate = uSpecMinLight;
  #endif
  float ndl = dot( geometryNormal, directLight.direction );
  float wrapped = ( ndl + uWrap ) / ( 1.0 + uWrap );
  float band = smoothstep( threshold - soft, threshold + soft, wrapped ) * toonShadow;
  vec3 light = mix( shadeK * shadeTint, vec3( 1.0 ), band );
  reflectedLight.directDiffuse += directLight.color * light * BRDF_Lambert( material.diffuseColor );
  float back = ( 1.0 - band ) * clamp( 0.5 - 0.5 * ndl, 0.0, 1.0 );
  reflectedLight.directDiffuse += directLight.color * back * translucency * BRDF_Lambert( slopSaturate( material.diffuseColor, 1.6 ) );
  vec3 halfDir = normalize( directLight.direction + geometryViewDir );
  float ndh = max( dot( geometryNormal, halfDir ), 0.0 );
  float lightLevel = dot( directLight.color, vec3( 0.3333 ) );
  float gate = specGate > 0.0 ? smoothstep( specGate * 0.75, specGate * 1.25, lightLevel ) : 1.0;
  float spec = smoothstep( specSize - 0.002, specSize + 0.002, ndh ) * band * gate;
  reflectedLight.directSpecular += directLight.color * spec * specK;
  #ifdef SLOP_FINISH
  if ( slopKind != FINISH_VINYL ) slopDirect( directLight.color, ndh, band, gate, reflectedLight );
  #endif
  toonShadow = 1.0;
}

void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

const SHADOW_WRITE = "directLight.color *= ( directLight.visible && receiveShadow ) ?";
const LIGHTS_BEGIN = ShaderChunk.lights_fragment_begin.split(SHADOW_WRITE).join(
  "toonShadow = ( directLight.visible && receiveShadow ) ?",
);

const OUTGOING = "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;";
const OUTGOING_TOON = /* glsl */ `
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + totalEmissiveRadiance;
{
  float ndv = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  #ifdef SLOP_FINISH
  float rimWidth = fRimWidth;
  vec3 rimColor = fRimColor;
  float rimK = fRim;
  #else
  float rimWidth = uRimWidth;
  vec3 rimColor = uRimColor;
  float rimK = uRim;
  #endif
  float rim = smoothstep( 1.0 - rimWidth - 0.06, 1.0 - rimWidth + 0.06, 1.0 - ndv );
  outgoingLight += rimColor * rimK * rim * ( 0.3 + 0.7 * diffuseColor.rgb );
  #ifdef SLOP_FINISH
  if ( slopKind != FINISH_VINYL ) outgoingLight = slopFinishOut( outgoingLight, diffuseColor.rgb, normal, normalize( vViewPosition ), ndv, rim );
  #endif
}
`;

/** The toon material for creatures, props and arenas. */
export function createToonMaterial(opts: ToonOptions = {}): ToonMaterial {
  const material = new MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    vertexColors: opts.vertexColors ?? true,
    emissive: opts.emissive ?? 0x000000,
  }) as ToonMaterial;
  const toon: ToonUniforms = {
    uShade: { value: opts.shade ?? 0.36 },
    uShadeTint: { value: new Color(opts.shadeTint ?? "#8f86c4") },
    uThreshold: { value: opts.threshold ?? 0.5 },
    uSoft: { value: opts.softness ?? 0.06 },
    uWrap: { value: opts.wrap ?? 0.4 },
    uTranslucency: { value: opts.translucency ?? 0.35 },
    uSpec: { value: opts.specular ?? 0.4 },
    uSpecSize: { value: opts.specularSize ?? 0.995 },
    uSpecMinLight: { value: opts.specularMinLight ?? 0 },
    uRim: { value: opts.rim ?? 0.26 },
    uRimColor: { value: new Color(opts.rimColor ?? "#ffb877") },
    uRimWidth: { value: opts.rimWidth ?? 0.28 },
  };
  const wobble =
    opts.wobble === true ? createWobbleUniforms() : opts.wobble ? opts.wobble : null;
  material.userData = { toon, wobble };
  // Creatures (the wobbling materials) shade finishes; one program for all of them.
  if (wobble) material.defines = { ...material.defines, SLOP_WOBBLE: "", SLOP_FINISH: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, toon);
    if (wobble) Object.assign(shader.uniforms, wobble, { uFinishDetail: FINISH_DETAIL });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WOBBLE_PARS}\n${FINISH_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `${WOBBLE_VERTEX}\n${FINISH_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <lights_toon_pars_fragment>", TOON_PARS)
      .replace("#include <lights_toon_fragment>", `#include <lights_toon_fragment>\n${FINISH_SETUP}`)
      .replace("#include <lights_fragment_begin>", LIGHTS_BEGIN)
      .replace(OUTGOING, OUTGOING_TOON);
  };
  material.customProgramCacheKey = () => `slop-toon-2${wobble ? "-wobble-finish" : ""}`;
  return material;
}
