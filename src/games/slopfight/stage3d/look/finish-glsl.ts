// GLSL for creature finishes (what a part is made of), spliced into the toon
// material under SLOP_FINISH (look/toon.ts). One program serves every finish:
// the mesher writes a per-vertex finish id (constant over each triangle, read
// flat) and the fragment shader branches on it, so a vinyl pixel runs the
// plain toon path and only finished pixels pay for their pattern. Finish ids
// are FINISHES' indices (creature/finish-look.ts FINISH_ID); the GLSL names
// them through FINISH_DEFINES (FINISH_METAL ...), so reordering FINISHES
// cannot silently swap looks:
//
//   0 vinyl    the plain toon (pixel-identical to a material without finishes)
//   1 metal    stylized chrome: a quantized horizon band in the reflection
//              (bright sky, a dark band at the horizon, a mid ground), tight
//              bright glints, a cool rim
//   2 gold     the same family, warm and saturated, with a warm halo round each glint
//   3 crystal  facets stuck to the body: Voronoi cells in bind space, each cell
//              snapping the normal in its own random frame, thin bright edges,
//              an iridescent rim, a bright shade band and a translucent dark side
//   4 stone    matte, speckled, a hard, chunky dark band, no glint
//   5 wood     grain rings in bind space, warm, a low sheen
//   6 ice      pale, strongly translucent, frosty rim, glossy, faint inner cracks
//   7 lava     a dark crust whose cell borders glow (emissive, so they bloom) and pulse
//   8 slime    glossy, translucent, a wet sheen
//   9 glow     lit from within: the palette colour, emissive, pulsing slowly
//
// Patterns live in bind space (the creature's rest pose, in creature heights),
// so they stick to the body as it animates. uFinishDetail 0 (the low quality
// tier) takes cheaper paths (a 2x2x2 Voronoi, one noise octave).

import { FINISHES } from "../../vocab";
import { FINISH_ID } from "../creature/finish-look";

/** `#define FINISH_<NAME> <id>` per finish, from FINISH_ID. */
export const FINISH_DEFINES = FINISHES.map((finish) => `#define FINISH_${finish.toUpperCase()} ${FINISH_ID[finish]}`).join("\n");

/** Vertex declarations (toon only; the outline only needs the wobble scale). */
export const FINISH_VERTEX_PARS = /* glsl */ `
#ifdef SLOP_FINISH
flat varying float vFinish;
varying vec3 vBindPos;
varying vec3 vBindX;
varying vec3 vBindY;
#endif
`;

/** After skinning has set up `skinMatrix`: the finish id, bind position and the bind frame in view space. */
export const FINISH_VERTEX = /* glsl */ `
#ifdef SLOP_FINISH
vFinish = slopFinish.x;
vBindPos = position;
#ifdef USE_SKINNING
vBindX = normalMatrix * ( mat3( skinMatrix ) * vec3( 1.0, 0.0, 0.0 ) );
vBindY = normalMatrix * ( mat3( skinMatrix ) * vec3( 0.0, 1.0, 0.0 ) );
#else
vBindX = normalMatrix * vec3( 1.0, 0.0, 0.0 );
vBindY = normalMatrix * vec3( 0.0, 1.0, 0.0 );
#endif
#endif
`;

/** Fragment declarations and helpers; spliced after the toon's own uniforms. */
export const FINISH_FRAGMENT_PARS = /* glsl */ `
#ifdef SLOP_FINISH
${FINISH_DEFINES}
flat varying float vFinish;
varying vec3 vBindPos;
varying vec3 vBindX;
varying vec3 vBindY;
uniform float uTime;
uniform float uHeight;
uniform float uFinishDetail;

// This fragment's finish and its lighting parameters (slopFinishSetup fills
// them from the material's uniforms, then overrides them per finish).
int slopKind = 0;
float fShade;
vec3 fShadeTint;
float fThreshold;
float fSoft;
float fTrans;
float fSpec;
float fSpecSize;
float fSpecGate;
float fRim;
vec3 fRimColor;
float fRimWidth;
// Direct light reaching this point (it scales the metals' reflections).
vec3 slopLight = vec3( 0.0 );
// Crystal facet edges and ice cracks; the facet cell's hash.
float slopEdge = 0.0;
float slopCell = 0.0;

vec3 slopHash3( vec3 cell ) {
  uvec3 v = uvec3( ivec3( cell ) + 4096 );
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return vec3( v ) * ( 1.0 / 4294967295.0 );
}

float slopNoise( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = p - i;
  f = f * f * ( 3.0 - 2.0 * f );
  float a = mix( slopHash3( i ).x, slopHash3( i + vec3( 1.0, 0.0, 0.0 ) ).x, f.x );
  float b = mix( slopHash3( i + vec3( 0.0, 1.0, 0.0 ) ).x, slopHash3( i + vec3( 1.0, 1.0, 0.0 ) ).x, f.x );
  float c = mix( slopHash3( i + vec3( 0.0, 0.0, 1.0 ) ).x, slopHash3( i + vec3( 1.0, 0.0, 1.0 ) ).x, f.x );
  float d = mix( slopHash3( i + vec3( 0.0, 1.0, 1.0 ) ).x, slopHash3( i + vec3( 1.0, 1.0, 1.0 ) ).x, f.x );
  return mix( mix( a, b, f.y ), mix( c, d, f.y ), f.z );
}

// Nearest and second-nearest feature distances of a jittered grid, and the
// nearest cell. 3x3x3 neighbours; 2x2x2 (the nearer half) when cheap.
vec2 slopVoronoi( vec3 p, out vec3 cell ) {
  vec3 base = floor( p );
  vec3 f = p - base;
  bool cheap = uFinishDetail < 0.5;
  vec3 start = cheap ? step( 0.5, f ) - 1.0 : vec3( -1.0 );
  int n = cheap ? 2 : 3;
  float d1 = 9.0;
  float d2 = 9.0;
  cell = base;
  for ( int z = 0; z < 3; z ++ ) {
    if ( z >= n ) break;
    for ( int y = 0; y < 3; y ++ ) {
      if ( y >= n ) break;
      for ( int x = 0; x < 3; x ++ ) {
        if ( x >= n ) break;
        vec3 o = start + vec3( float( x ), float( y ), float( z ) );
        vec3 point = o + 0.5 + ( slopHash3( base + o ) - 0.5 ) * 0.8;
        vec3 d = point - f;
        float dd = dot( d, d );
        if ( dd < d1 ) {
          d2 = d1;
          d1 = dd;
          cell = base + o;
        } else if ( dd < d2 ) {
          d2 = dd;
        }
      }
    }
  }
  return vec2( sqrt( d1 ), sqrt( d2 ) );
}

vec3 slopRotate( vec3 v, vec3 axis, float angle ) {
  float c = cos( angle );
  float s = sin( angle );
  return v * c + cross( axis, v ) * s + axis * dot( axis, v ) * ( 1.0 - c );
}

// What the room's bounce light looks like in a direction (view space), as radiance.
vec3 slopEnv( const in vec3 dirView ) {
  vec3 e = getAmbientLightIrradiance( ambientLightColor );
  #if defined( USE_LIGHT_PROBES )
  e += getLightProbeIrradiance( lightProbe, dirView );
  #endif
  #if ( NUM_HEMI_LIGHTS > 0 )
  for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) e += getHemisphereLightIrradiance( hemisphereLights[ i ], dirView );
  #endif
  return e * RECIPROCAL_PI;
}

// Before the lights: the finish's parameters, its pattern in the albedo, a
// crystal's facet normal, lava and glow emission.
void slopFinishSetup( inout vec3 albedo, inout vec3 n, inout vec3 emissive, const in vec3 viewDir ) {
  slopKind = int( vFinish + 0.5 );
  fShade = uShade;
  fShadeTint = uShadeTint;
  fThreshold = uThreshold;
  fSoft = uSoft;
  fTrans = uTranslucency;
  fSpec = uSpec;
  fSpecSize = uSpecSize;
  fSpecGate = uSpecMinLight;
  fRim = uRim;
  fRimColor = uRimColor;
  fRimWidth = uRimWidth;
  if ( slopKind == FINISH_VINYL ) return;
  vec3 q = vBindPos / max( uHeight, 0.05 );
  bool full = uFinishDetail > 0.5;
  if ( slopKind == FINISH_METAL || slopKind == FINISH_GOLD ) {
    // Metal and gold: a little diffuse; the reflection and glints do the work.
    albedo *= slopKind == FINISH_METAL ? 0.14 : 0.22;
    fShade = uShade * 0.8;
    if ( slopKind == FINISH_GOLD ) fShadeTint = vec3( 0.78, 0.46, 0.26 );
    fTrans = 0.0;
    fSpec = slopKind == FINISH_METAL ? 1.8 : 1.4;
    fSpecSize = slopKind == FINISH_METAL ? 0.9965 : 0.995;
    fSpecGate = uSpecMinLight * 0.5;
    fRim = 0.4;
    fRimWidth = 0.22;
    fRimColor = slopKind == FINISH_METAL ? vec3( 0.8, 0.9, 1.0 ) : vec3( 1.0, 0.84, 0.5 );
  } else if ( slopKind == FINISH_CRYSTAL ) {
    // Crystal: snap the normal within the cell's own random frame (in bind
    // space), so each cell is a flat facet that flashes as the body turns.
    vec3 cell;
    vec2 f = slopVoronoi( q * 6.5, cell );
    vec3 h = slopHash3( cell + 17.0 );
    slopCell = h.x;
    vec3 bx = normalize( vBindX );
    vec3 by = normalize( vBindY - bx * dot( bx, vBindY ) );
    vec3 bz = cross( bx, by );
    vec3 nb = vec3( dot( n, bx ), dot( n, by ), dot( n, bz ) );
    vec3 axis = normalize( h - 0.5 + vec3( 0.001, 0.002, 0.003 ) );
    float angle = 0.5 + h.z * 5.5;
    vec3 m = slopRotate( nb, axis, angle );
    vec3 snapped = normalize( floor( m * 1.35 + 0.5 ) );
    vec3 fb = slopRotate( snapped, axis, - angle );
    vec3 facet = normalize( fb.x * bx + fb.y * by + fb.z * bz );
    // A facet never turns fully away from the camera.
    float facing = dot( facet, viewDir );
    if ( facing < 0.08 ) facet = normalize( facet + viewDir * ( 0.08 - facing ) );
    n = normalize( mix( n, facet, 0.82 ) );
    slopEdge = 1.0 - smoothstep( 0.015, 0.05, f.y - f.x );
    fShade = min( 0.9, uShade * 1.3 );
    fThreshold = uThreshold - 0.04;
    fSoft = 0.02;
    fTrans = 0.85;
    fSpec = 1.5;
    fSpecSize = 0.992;
    fSpecGate = uSpecMinLight * 0.5;
    fRim = 0.0;
    fRimWidth = 0.3;
  } else if ( slopKind == FINISH_STONE ) {
    // Stone: speckles, a hard terminator, more of the body in the dark band, no glint.
    float fine = slopNoise( q * 58.0 );
    float broad = full ? slopNoise( q * 6.0 + 3.1 ) : 0.5;
    albedo *= 0.86 + 0.26 * broad;
    albedo *= 1.0 - 0.32 * smoothstep( 0.7, 0.74, fine );
    albedo += vec3( 0.06, 0.057, 0.052 ) * ( 1.0 - smoothstep( 0.22, 0.26, fine ) );
    fShade = uShade * 0.85;
    fThreshold = uThreshold + 0.08;
    fSoft = 0.012;
    fTrans = 0.0;
    fSpec = 0.0;
    fRim = uRim * 0.45;
  } else if ( slopKind == FINISH_WOOD ) {
    // Wood: rings round the creature's upright axis, warped, with fine streaks.
    float warp = slopNoise( q * vec3( 3.0, 0.9, 3.0 ) );
    float ring = fract( ( length( q.xz ) + warp * 0.2 + q.y * 0.04 ) * 10.0 );
    float line = 1.0 - smoothstep( 0.08, 0.2, ring );
    float late = smoothstep( 0.35, 0.75, ring );
    float streak = full ? slopNoise( vec3( q.x * 46.0, q.y * 4.0, q.z * 46.0 ) ) : 0.5;
    albedo *= mix( 1.0, 0.5, line ) * ( 0.92 + 0.14 * late ) * ( 0.88 + 0.24 * streak );
    fTrans = 0.08;
    fSpec = 0.12;
    fSpecSize = 0.985;
    fRim = uRim * 0.8;
    fRimColor = vec3( 1.0, 0.72, 0.45 );
  } else if ( slopKind == FINISH_ICE ) {
    // Ice: bright, glowing through on the dark side, glossy, faint inner cracks.
    vec3 cell;
    vec2 f = slopVoronoi( q * 4.5, cell );
    slopEdge = ( 1.0 - smoothstep( 0.015, 0.045, f.y - f.x ) ) * 0.7;
    albedo = mix( albedo, vec3( 1.0 ), slopEdge * 0.4 );
    fShade = min( 0.9, uShade * 1.3 );
    fShadeTint = vec3( 0.5, 0.68, 1.0 );
    fTrans = 0.7;
    fSpec = 1.3;
    fSpecSize = 0.992;
    fSpecGate = uSpecMinLight * 0.6;
    fRim = 0.6;
    fRimWidth = 0.4;
    fRimColor = vec3( 0.9, 0.97, 1.0 );
  } else if ( slopKind == FINISH_LAVA ) {
    // Lava: a dark crust; the cell borders glow and pulse slowly (HDR, so they bloom).
    vec3 cell;
    vec2 f = slopVoronoi( q * 5.0, cell );
    float h = slopHash3( cell + 5.0 ).x;
    float gap = f.y - f.x;
    float width = full ? 0.6 + 0.8 * slopNoise( q * 9.0 + 1.7 ) : 1.0;
    float crack = 1.0 - smoothstep( 0.018 * width, 0.05 * width, gap );
    float core = 1.0 - smoothstep( 0.0, 0.02 * width, gap );
    float aura = 1.0 - smoothstep( 0.0, 0.16, gap );
    float pulse = 0.72 + 0.28 * sin( uTime * 1.7 + h * 6.2831 );
    vec3 hot = mix( vec3( 1.0, 0.24, 0.03 ), vec3( 1.0, 0.68, 0.2 ), core );
    emissive += hot * crack * pulse * 3.0 + vec3( 0.5, 0.07, 0.01 ) * aura * aura * pulse * 0.5;
    albedo *= ( 0.8 + 0.4 * slopNoise( q * 14.0 ) ) * ( 1.0 - crack * 0.6 );
    fShade = uShade * 0.95;
    fShadeTint = vec3( 0.75, 0.5, 0.55 );
    fTrans = 0.0;
    fSpec = 0.2;
    fRim = 0.42;
    fRimWidth = 0.24;
    fRimColor = vec3( 1.0, 0.42, 0.1 );
  } else if ( slopKind == FINISH_SLIME ) {
    // Slime: glossy and saturated, glowing through like jelly, bubbles inside.
    vec3 cell;
    vec2 f = slopVoronoi( q * 8.0 + vec3( 0.0, uTime * 0.06, 0.0 ), cell );
    float h = slopHash3( cell + 9.0 ).x;
    float r = 0.1 + 0.12 * fract( h * 7.3 );
    float bubble = step( 0.35, h ) * ( 1.0 - smoothstep( r - 0.03, r, f.x ) );
    float ring = bubble * smoothstep( r * 0.55, r * 0.95, f.x );
    albedo = mix( albedo, albedo * 1.45 + 0.05, bubble * 0.5 );
    albedo += vec3( 0.12 ) * ring;
    fShade = min( 0.9, uShade * 1.35 );
    fTrans = 0.95;
    fSpec = 1.6;
    fSpecSize = 0.986;
    fSpecGate = uSpecMinLight * 0.6;
    fRim = 0.4;
    fRimColor = slopSaturate( albedo, 1.4 ) * 1.5 + 0.2;
  } else {
    // Glow: the palette colour from within, normalised so every colour blooms, pulsing slowly.
    float pulse = 0.8 + 0.2 * sin( uTime * 2.3 + q.y * 3.0 );
    // Normalised between peak and luminance: bright enough to bloom, and a red
    // stays red rather than burning to orange.
    vec3 hue = slopSaturate( albedo, 1.6 );
    float peak = max( hue.r, max( hue.g, hue.b ) );
    float lum = dot( hue, vec3( 0.2126, 0.7152, 0.0722 ) );
    float norm = max( mix( peak, lum, 0.5 ), 0.08 );
    float centre = clamp( dot( n, viewDir ), 0.0, 1.0 );
    emissive += hue / norm * ( 0.75 + 1.05 * centre * centre ) * pulse;
    albedo *= 0.3;
    fShade = min( 0.95, uShade * 1.8 );
    fTrans = 0.6;
    fSpec = 0.3;
    fRim = 0.5;
    fRimColor = albedo * 1.5 + 0.35;
  }
}

// Per light, after the plain toon terms: the light reaching the point, and
// the extra lobes (gold's warm halo, ice and slime's wet sheen).
void slopDirect( const in vec3 lightColor, const in float ndh, const in float band, const in float gate, inout ReflectedLight reflectedLight ) {
  slopLight += lightColor * ( 0.35 + 0.65 * toonShadow );
  if ( slopKind == FINISH_GOLD ) {
    reflectedLight.directSpecular += lightColor * vec3( 1.0, 0.8, 0.45 ) * smoothstep( 0.972, 0.98, ndh ) * band * gate * 0.25;
  } else if ( slopKind == FINISH_ICE || slopKind == FINISH_SLIME ) {
    reflectedLight.directSpecular += lightColor * smoothstep( 0.945, 0.955, ndh ) * band * gate * 0.16;
  }
}

// After the lights: the metals' reflection, crystal's edges, glints and rim.
vec3 slopFinishOut( const in vec3 col, const in vec3 base, const in vec3 n, const in vec3 viewDir, const in float ndv, const in float rimMask ) {
  vec3 outCol = col;
  vec3 r = reflect( - viewDir, n );
  // The horizon slides with height on the body, so flat panels show a line too.
  float y = inverseTransformDirection( r, viewMatrix ).y + ( vBindPos.y / max( uHeight, 0.05 ) - 0.4 ) * 0.4;
  vec3 light = slopLight * 0.24 + slopEnv( r ) * 1.8 + 0.12;
  float sky = smoothstep( 0.04, 0.08, y );
  if ( slopKind == FINISH_CRYSTAL ) {
    // Crystal: the facets catch the sky, edges shine, the rim shifts hue.
    outCol += mix( base, vec3( 1.0 ), 0.06 ) * light * 0.22 * sky;
    // Edges catch the light in the gem's own colour, whitening only where bright.
    outCol += mix( base * 1.6, vec3( 1.0 ), 0.35 ) * slopEdge * ( slopLight * 0.06 + 0.03 );
    vec3 iri = 0.5 + 0.5 * cos( 6.2831 * ( ndv * 1.2 + slopCell + vec3( 0.0, 0.33, 0.67 ) ) );
    outCol += mix( vec3( 1.0 ), iri, 0.65 ) * rimMask * 0.45 * ( 0.2 + 0.8 * base );
    // Deep gems stay deep: the tone curve would wash a bright red to salmon.
    outCol = slopSaturate( outCol, 1.2 );
  } else if ( slopKind == FINISH_METAL || slopKind == FINISH_GOLD ) {
    // Metal and gold: a quantized horizon in the reflection: a white streak
    // overhead, a mid sky, a dark horizon band, a warm ground.
    float zenith = smoothstep( 0.62, 0.66, y );
    float ground = 1.0 - smoothstep( - 0.14, - 0.1, y );
    bool gold = slopKind == FINISH_GOLD;
    // The room's colour and a brightness held in a band, so chrome reads in a
    // dim arena and does not blow out in a bright one.
    float level = dot( light, vec3( 0.3333 ) );
    vec3 room = mix( vec3( 1.0 ), light / max( level, 1e-3 ), 0.5 ) * clamp( level, 0.5, 1.1 );
    vec3 hue = base / max( max( base.r, max( base.g, base.b ) ), 1e-3 );
    float rise = smoothstep( 0.08, 0.62, y );
    vec3 skyC = gold ? hue * mix( vec3( 0.62, 0.5, 0.36 ), vec3( 0.85, 0.78, 0.6 ), rise ) : mix( hue, vec3( 1.0 ), 0.5 ) * mix( 0.32, 0.55, rise );
    vec3 zenithC = gold ? vec3( 1.0, 0.86, 0.52 ) : vec3( 0.95, 0.97, 1.0 );
    vec3 horizonC = gold ? hue * vec3( 0.16, 0.07, 0.02 ) : hue * 0.035;
    vec3 groundC = gold ? hue * vec3( 0.45, 0.3, 0.12 ) : mix( hue, vec3( 1.0, 0.9, 0.8 ), 0.5 ) * 0.2;
    vec3 env = mix( horizonC, skyC, sky );
    env = mix( env, zenithC, zenith );
    env = mix( env, groundC, ground );
    outCol += env * room;
  } else if ( slopKind == FINISH_ICE ) {
    outCol += vec3( 0.9, 0.97, 1.0 ) * slopEdge * ( slopLight * 0.04 + 0.02 );
  } else if ( slopKind == FINISH_SLIME ) {
    // Jelly: lit from inside where it faces the camera.
    outCol += slopSaturate( base, 1.3 ) * ndv * ndv * ( slopLight * 0.05 + 0.04 );
  }
  return outCol;
}
#endif
`;

/** Replaces `#include <lights_toon_fragment>` (after it): sets up the finish before the lights. */
export const FINISH_SETUP = /* glsl */ `
#ifdef SLOP_FINISH
slopFinishSetup( material.diffuseColor, normal, totalEmissiveRadiance, normalize( vViewPosition ) );
#endif
`;
