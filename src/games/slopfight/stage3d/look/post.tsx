"use client";

// The post stack. ACES lives here (the composer switches the renderer's tone
// mapping off while it is mounted, so it is never applied twice). Order:
// bloom on emissives (HDR, before tone mapping; the luminance threshold sits
// above anything the rig lights, so only *_Emissive meshes and FX glow),
// depth of field (hero shots, director-driven), chromatic aberration (impact
// frames only), ACES, the arena grade + tinted vignette, the stage-fx layer
// (letterbox, iris, wipe, impact frame), SMAA (FXAA on lower rungs).
//
// The composer renders the frame (priority 1), so it must stay mounted on
// every quality rung; lower rungs only drop effects.

import { useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  FXAA,
  SMAA,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode, type ChromaticAberrationEffect, type DepthOfFieldEffect, type EffectComposer as PostComposer } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import { HalfFloatType, Vector2, type Color } from "three";
import { stormLook } from "../arena/finale";
import { useQuality, useStage } from "../services";
import { GradeEffect, StageFxEffect } from "./effects";
import type { ArenaMood } from "./moods";
import { ALL_POST_ON, effectivePostToggles, type PostToggles } from "./post-fx";

/** Frame priority: after the camera rig (0.5) and camera-attached objects (0.6). */
export const POST_FX_PRIORITY = 0.7;

declare global {
  interface Window {
    /** Development-only inspection of actual passes and quality-gated switches. */
    __slopPost?: () => { composer: PostComposer | null; effective: PostToggles };
  }
}

export function PostStack({ mood, toggles = ALL_POST_ON }: { mood: ArenaMood; toggles?: PostToggles }) {
  const services = useStage();
  const quality = useQuality();
  const size = useThree((state) => state.size);
  const composerRef = useRef<PostComposer>(null);
  const grade = useMemo(() => new GradeEffect(), []);
  const stageFx = useMemo(() => new StageFxEffect(), []);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  const caRef = useRef<ChromaticAberrationEffect>(null);
  const caOffset = useMemo(() => new Vector2(0, 0), []);

  useEffect(() => () => grade.dispose(), [grade]);
  useEffect(() => () => stageFx.dispose(), [stageFx]);

  useEffect(() => {
    grade.set({
      contrast: toggles.grade ? mood.grade.contrast : 1,
      saturation: toggles.grade ? mood.grade.saturation : 1,
      tint: toggles.grade ? mood.grade.tint : "#ffffff",
      vignette: toggles.vignette ? mood.vignette : 0,
      vignetteColor: mood.shadow,
    });
  }, [grade, mood, toggles.grade, toggles.vignette]);

  const full = quality.post === "full";
  const effective = effectivePostToggles(toggles, quality.post);
  const aspect = size.width / Math.max(1, size.height);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const inspect = () => ({ composer: composerRef.current, effective: effectivePostToggles(toggles, quality.post) });
    window.__slopPost = inspect;
    return () => {
      if (window.__slopPost === inspect) delete window.__slopPost;
    };
  }, [quality.post, toggles]);

  useFrame((state) => {
    const { fx, transitions, clock } = services;
    const camera = state.camera;
    fx.update(clock.realDelta, camera);
    grade.setAspect(aspect);
    const storm = stormLook(services.finale);
    grade.setStorm(toggles.grade ? storm.dim : 0, storm.flash);

    const u = <T,>(name: string) => stageFx.uniform<T>(name);
    const on = toggles.stageFx;
    u<number>("uAspect").value = aspect;
    u<number>("uTime").value = clock.realElapsed;
    u<number>("uBar").value = on ? Math.min(0.15, fx.letterboxBarFraction(aspect)) : 0;
    u<number>("uWipe").value = on ? fx.wipe.progress : 0;
    u<Color>("uWipeColor").value.copy(fx.wipe.color);
    u<number>("uWipeAngle").value = fx.wipe.angle;
    u<number>("uIrisRadius").value = on ? fx.iris.radius : 2;
    u<Vector2>("uIrisCenter").value.copy(fx.iris.center);
    u<Color>("uIrisColor").value.copy(fx.iris.color);
    u<Color>("uIrisRing").value.copy(transitions.accent);
    u<number>("uFlash").value = on ? fx.impact.flash : 0;
    u<number>("uLines").value = on ? fx.impact.lines : 0;
    u<Vector2>("uImpactCenter").value.copy(fx.impact.center);
    u<number>("uSeed").value = fx.impact.seed;

    const dof = dofRef.current;
    if (dof) {
      dof.target = fx.dof.focus;
      dof.bokehScale = fx.dof.strength * 3.2;
    }
    const ca = caRef.current;
    if (ca) {
      const amount = fx.chromatic * fx.chromatic * 0.0065;
      caOffset.set(amount, amount * 0.6);
      ca.offset = caOffset;
    }
  }, POST_FX_PRIORITY);

  return (
    <EffectComposer ref={composerRef} multisampling={0} frameBufferType={HalfFloatType} renderPriority={1}>
      <>
        {effective.bloom && (
          <Bloom
            mipmapBlur={full}
            intensity={full ? mood.bloom.intensity : mood.bloom.intensity * 0.8}
            luminanceThreshold={mood.bloom.threshold}
            luminanceSmoothing={mood.bloom.smoothing}
            radius={0.72}
            levels={full ? 7 : 5}
            resolutionScale={full ? 1 : 0.5}
          />
        )}
        {effective.dof && <DepthOfField ref={dofRef} focusRange={2.4} bokehScale={0} resolutionScale={0.5} />}
        {effective.chromatic && <ChromaticAberration ref={caRef} offset={caOffset} radialModulation modulationOffset={0.2} />}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <primitive object={grade} dispose={null} />
        <primitive object={stageFx} dispose={null} />
        {toggles.smaa && (full ? <SMAA /> : <FXAA />)}
      </>
    </EffectComposer>
  );
}
