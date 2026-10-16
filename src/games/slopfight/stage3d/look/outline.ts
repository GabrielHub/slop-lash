// Inverted-hull outlines: the back faces of a mesh, pushed out along their
// normals by a constant width in screen space (pixels at 1080p, scaled with
// the viewport height), drawn in a dark version of the base colour (never pure
// black). Supports skinning, instancing and fog, and the creature wobble when
// given the same uniforms as the body's toon material, so the hull stays glued
// to the jelly (with the same per-vertex wobble scale: the geometry's
// FINISH_ATTRIBUTE, see toon.ts). Use the same geometry as the body: `new Mesh(geometry,
// createOutlineMaterial(...))` or a SkinnedMesh bound to the same skeleton.
// On a creature, a glow part's hull is drawn bright in the part's own hue (from
// its vertex colours) instead of dark, so it reads as giving off light.

import {
  BackSide,
  Color,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type ColorRepresentation,
  type IUniform,
} from "three";
import { FINISH_ID } from "../creature/finish-look";
import { WOBBLE_PARS, WOBBLE_VERTEX, type WobbleUniforms } from "./toon";

export interface OutlineOptions {
  /** Outline colour (use the toy colour's `dark` value). */
  color: ColorRepresentation;
  /** Width in pixels at 1080p. Default 2.5. */
  width?: number;
  /** Share the body's wobble uniforms so the hull deforms with it. */
  wobble?: WobbleUniforms | null;
  /**
   * Push the hull this many outline widths away from the camera so it shows
   * at silhouettes but never pokes through concave creases (where a body
   * meets a limb). Default 0 (off).
   */
  depthBias?: number;
}

export type OutlineMaterial = ShaderMaterial & {
  uniforms: { uColor: IUniform<Color>; uWidth: IUniform<number>; uDepthBias: IUniform<number> } & Record<
    string,
    IUniform
  >;
};

const VERTEX = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
${WOBBLE_PARS}
uniform float uWidth;
uniform float uDepthBias;
#ifdef SLOP_FINISH
attribute vec3 color;
// A glow part's colour (negative elsewhere).
flat varying vec3 vHalo;
#endif

void main() {
  #ifdef SLOP_FINISH
  vHalo = abs( slopFinish.x - ${FINISH_ID.glow}.0 ) < 0.5 ? color : vec3( - 1.0 );
  #endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  ${WOBBLE_VERTEX}
  #include <skinning_vertex>
  #include <project_vertex>
  if ( uDepthBias > 0.0 ) {
    // One pixel (at 1080p) in view units at this depth; orthographic cameras have no depth term.
    float depth = projectionMatrix[ 2 ][ 3 ] != 0.0 ? -mvPosition.z : 1.0;
    float pixel = depth * ( 2.0 / 1080.0 ) / projectionMatrix[ 1 ][ 1 ];
    mvPosition.z -= uDepthBias * uWidth * pixel;
    gl_Position = projectionMatrix * mvPosition;
  }
  vec3 viewNormal = normalize( normalMatrix * objectNormal );
  vec4 clipNormal = projectionMatrix * vec4( viewNormal, 0.0 );
  float aspect = projectionMatrix[ 1 ][ 1 ] / projectionMatrix[ 0 ][ 0 ];
  vec2 dir = clipNormal.xy * vec2( aspect, 1.0 );
  float len = length( dir );
  dir = len > 1e-5 ? dir / len : vec2( 0.0 );
  gl_Position.xy += vec2( dir.x / aspect, dir.y ) * uWidth * ( 2.0 / 1080.0 ) * gl_Position.w;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
#include <common>
#include <fog_pars_fragment>
#ifdef SLOP_FINISH
flat varying vec3 vHalo;
#endif

void main() {
  vec3 color = uColor;
  #ifdef SLOP_FINISH
  if ( vHalo.r >= 0.0 ) {
    // Glow: a rim in the part's hue, bright enough for every hue to bloom into a halo.
    float lum = dot( vHalo, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = vHalo / max( lum, 0.04 ) * 2.2;
  }
  #endif
  gl_FragColor = vec4( color, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** An inverted-hull outline material; pair it with the body's geometry. */
export function createOutlineMaterial(opts: OutlineOptions): OutlineMaterial {
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uColor: { value: new Color(opts.color) },
      uWidth: { value: opts.width ?? 2.5 },
      uDepthBias: { value: opts.depthBias ?? 0 },
    },
  ]) as OutlineMaterial["uniforms"];
  if (opts.wobble) Object.assign(uniforms, opts.wobble);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: BackSide,
    fog: true,
    // The creature hull reads the body's per-vertex wobble scale (finishes), so rigid parts stay glued.
    defines: opts.wobble ? { SLOP_WOBBLE: "", SLOP_FINISH: "" } : {},
  }) as OutlineMaterial;
  return material;
}
