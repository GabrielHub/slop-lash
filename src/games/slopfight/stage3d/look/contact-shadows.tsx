"use client";

// Contact shadows so nothing floats (spec 7): a soft dark pool under anything
// standing on the platform, rendered from below by an orthographic depth pass
// and blurred. Adapted from drei's ContactShadows with two stage-specific
// changes: the depth pass does not re-render the key light's shadow map (a
// second shadow-map render per frame for nothing), and the size comes from the
// quality rung.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  WebGLRenderTarget,
  type Group,
} from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";

const clearColor = new Color();

export interface ContactShadowsProps {
  /** Footprint, world units (square). */
  size?: number;
  /** Height of the plane (just above the floor top so the floor itself is not captured). */
  y?: number;
  /** How far above the plane casters count, world units. */
  far?: number;
  resolution?: number;
  opacity?: number;
  blur?: number;
  color?: string;
}

export function ContactShadows({
  size = 7,
  y = 0.012,
  far = 1.3,
  resolution = 512,
  opacity = 0.6,
  blur = 2.2,
  color = "#120a10",
}: ContactShadowsProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const group = useRef<Group>(null);

  const kit = useMemo(() => {
    const target = new WebGLRenderTarget(resolution, resolution);
    const targetBlur = new WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = false;
    targetBlur.texture.generateMipmaps = false;
    const plane = new PlaneGeometry(size, size).rotateX(Math.PI / 2);
    const blurPlane = new Mesh(plane);
    const depth = new MeshDepthMaterial();
    depth.depthTest = false;
    depth.depthWrite = false;
    const tint = new Color(color);
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: tint };
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform vec3 ucolor;\nvoid main() {")
        .replace(
          "vec4( vec3( 1.0 - fragCoordZ ), opacity );",
          "vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );",
        );
    };
    const horizontal = new ShaderMaterial({
      ...HorizontalBlurShader,
      uniforms: { tDiffuse: { value: null }, h: { value: 1 / 512 } },
    });
    const vertical = new ShaderMaterial({
      ...VerticalBlurShader,
      uniforms: { tDiffuse: { value: null }, v: { value: 1 / 512 } },
    });
    horizontal.depthTest = false;
    vertical.depthTest = false;
    const camera = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
    camera.rotation.x = Math.PI / 2;
    const material = new MeshBasicMaterial({
      map: target.texture,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    return { target, targetBlur, plane, blurPlane, depth, horizontal, vertical, camera, material };
  }, [resolution, size, far, color, opacity]);

  useEffect(
    () => () => {
      kit.target.dispose();
      kit.targetBlur.dispose();
      kit.plane.dispose();
      kit.depth.dispose();
      kit.horizontal.dispose();
      kit.vertical.dispose();
      kit.material.dispose();
    },
    [kit],
  );

  useFrame(() => {
    const root = group.current;
    if (!root) return;
    const { target, targetBlur, blurPlane, depth, horizontal, vertical, camera } = kit;
    camera.position.set(0, y, 0);
    camera.updateMatrixWorld();

    const background = scene.background;
    const override = scene.overrideMaterial;
    const autoUpdate = gl.shadowMap.autoUpdate;
    root.visible = false;
    scene.background = null;
    scene.overrideMaterial = depth;
    gl.shadowMap.autoUpdate = false;
    gl.getClearColor(clearColor);
    const clearAlpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);
    gl.setClearColor(clearColor, clearAlpha);
    gl.shadowMap.autoUpdate = autoUpdate;

    const pass = (amount: number) => {
      blurPlane.visible = true;
      blurPlane.material = horizontal;
      horizontal.uniforms.tDiffuse!.value = target.texture;
      horizontal.uniforms.h!.value = amount / 256;
      gl.setRenderTarget(targetBlur);
      gl.render(blurPlane, camera);
      blurPlane.material = vertical;
      vertical.uniforms.tDiffuse!.value = targetBlur.texture;
      vertical.uniforms.v!.value = amount / 256;
      gl.setRenderTarget(target);
      gl.render(blurPlane, camera);
      blurPlane.visible = false;
    };
    pass(blur);
    pass(blur * 0.4);

    gl.setRenderTarget(null);
    root.visible = true;
    scene.overrideMaterial = override;
    scene.background = background;
  }, -5);

  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh geometry={kit.plane} material={kit.material} scale={[1, -1, 1]} renderOrder={1} />
    </group>
  );
}
