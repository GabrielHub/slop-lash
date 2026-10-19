"use client";

// Contact shadows so nothing floats (spec 7): a soft dark pool under anything
// standing on the platform, rendered from below by an orthographic depth pass
// and blurred. Only solid shadow casters enter the capture, after animation;
// the receiver follows the actual platform (including the kitchen sink hole).
// The depth pass skips the key light's shadow map and follows the quality rung.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Euler,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Group,
} from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import type { ArenaGeometry } from "../../arenas";
import { tiltPivot, tiltQuaternion } from "../arena/finale";
import { useStage } from "../services";
import { ContactShadowCasters, createContactShadowReceiver } from "./contact-shadow-geometry";

const clearColor = new Color();
/** The capture camera looks straight up from under the receiver. */
const LOOK_UP = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));

export interface ContactShadowsProps {
  geometry: ArenaGeometry;
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
  geometry,
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
  const services = useStage();
  const group = useRef<Group>(null);
  const tilt = useMemo(() => new Quaternion(), []);
  const pivot = useMemo(() => new Vector3(), []);

  const kit = useMemo(() => {
    const target = new WebGLRenderTarget(resolution, resolution);
    const targetBlur = new WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = false;
    targetBlur.texture.generateMipmaps = false;
    const plane = new PlaneGeometry(size, size).rotateX(Math.PI / 2);
    const receiver = createContactShadowReceiver(geometry, size);
    const casters = new ContactShadowCasters();
    const blurPlane = new Mesh(plane);
    // Keep normal depth testing/writing: the nearest underside must win when
    // casters overlap, regardless of their draw order or material sorting.
    const depth = new MeshDepthMaterial();
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
    camera.quaternion.copy(LOOK_UP);
    const material = new MeshBasicMaterial({
      map: target.texture,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    return { target, targetBlur, plane, receiver, casters, blurPlane, depth, horizontal, vertical, camera, material };
  }, [geometry, resolution, size, far, color, opacity]);

  useEffect(
    () => () => {
      kit.target.dispose();
      kit.targetBlur.dispose();
      kit.plane.dispose();
      kit.receiver.dispose();
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
    // The kitchen's finale tips the counter: the receiver and the capture tip with it.
    tiltQuaternion(services.finale, 1, tilt);
    tiltPivot(services.finale, pivot);
    const place = (out: Vector3, height: number) => out.set(0, height, 0).sub(pivot).applyQuaternion(tilt).add(pivot);
    place(root.position, y);
    root.quaternion.copy(tilt);
    place(camera.position, y);
    camera.quaternion.copy(tilt).multiply(LOOK_UP);
    camera.updateMatrixWorld();
    // The camera looks up from y; a quad left at y=0 sits behind its near plane.
    place(blurPlane.position, y + far / 2);
    blurPlane.quaternion.copy(tilt);
    blurPlane.updateMatrixWorld();

    const background = scene.background;
    const override = scene.overrideMaterial;
    const autoUpdate = gl.shadowMap.autoUpdate;
    const shadowNeedsUpdate = gl.shadowMap.needsUpdate;
    const renderTarget = gl.getRenderTarget();
    const cubeFace = gl.getActiveCubeFace();
    const mipLevel = gl.getActiveMipmapLevel();
    const visible = root.visible;
    gl.getClearColor(clearColor);
    const clearAlpha = gl.getClearAlpha();
    try {
      root.visible = false;
      scene.background = null;
      scene.overrideMaterial = depth;
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = false;
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(target);
      gl.clear();
      kit.casters.render(scene, () => gl.render(scene, camera));

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
    } finally {
      blurPlane.visible = false;
      gl.setRenderTarget(renderTarget, cubeFace, mipLevel);
      gl.setClearColor(clearColor, clearAlpha);
      gl.shadowMap.autoUpdate = autoUpdate;
      gl.shadowMap.needsUpdate = shadowNeedsUpdate;
      root.visible = visible;
      scene.overrideMaterial = override;
      scene.background = background;
    }
  }, 0.8);

  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh geometry={kit.receiver} material={kit.material} renderOrder={1} />
    </group>
  );
}
