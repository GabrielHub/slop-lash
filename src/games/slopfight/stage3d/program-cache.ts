// Keep a small set of real materials alive across phase changes. Three owns
// their shader references; disposing this set releases them through its public
// API. A scene leaving the stage disposes its own materials, and when it held
// the last user of a program Three deletes it, so the next scene would link it
// again under the transition's cover. These invisible meshes also compile
// instanced hit effects before the first particle, when a zero-count particle
// pool would not yet render. The SDF text variants are kept by <TextPrograms>
// (stage-canvas.tsx): troika derives their materials.

import {
  Bone, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Skeleton, SkinnedMesh, Texture, Uint16BufferAttribute,
  WebGLRenderTarget, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer,
} from "three";
import { eyeMaterial } from "./creature/face-materials";
import { createOutlineMaterial } from "./look/outline";
import { createToonMaterial, FINISH_ATTRIBUTE } from "./look/toon";
import { createUiOutline, createUiToon } from "./ui3d/materials";

export function createProgramWarmup() {
  const root = new Group();
  root.visible = false;
  const geometry = new BufferGeometry();
  for (const attribute of ["position", "normal", "color"]) geometry.setAttribute(attribute, new Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0], 2));
  // Creature bodies carry their finish (id, wobble scale); one finish program serves them all.
  geometry.setAttribute(FINISH_ATTRIBUTE, new Float32BufferAttribute([0, 1], 2));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0], 4));
  const skeleton = new Skeleton([new Bone()]);
  const body = createToonMaterial({ wobble: true });
  const outline = createOutlineMaterial({ color: "#13544c", wobble: body.userData.wobble });
  const materials: Material[] = [body, outline];
  for (const material of materials) {
    const mesh = new SkinnedMesh(geometry, material);
    mesh.bind(skeleton);
    root.add(mesh);
  }
  const instances: InstancedMesh[] = [];
  for (const doubleSided of [false, true]) {
    // Confetti's two-sided scraps use a different program from hit particles.
    const material = createToonMaterial({ vertexColors: false });
    if (doubleSided) material.side = DoubleSide;
    const mesh = new InstancedMesh(geometry, material, 1);
    mesh.setColorAt(0, new Color());
    root.add(mesh);
    instances.push(mesh);
    materials.push(material);
  }
  // Health bars draw over the set. Their transparent, unfogged programs first
  // appeared at FIGHT and blocked the render thread while the driver linked.
  for (const material of [createToonMaterial({ vertexColors: false }), createOutlineMaterial({ color: "#13544c" })]) {
    material.fog = false;
    material.transparent = true;
    material.depthTest = false;
    root.add(new Mesh(geometry, material));
    materials.push(material);
  }
  const texture = new Texture();
  for (const material of [
    createToonMaterial({ vertexColors: false }),
    createOutlineMaterial({ color: "#13544c" }),
    eyeMaterial(),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, alphaTest: 0.02 }),
  ]) {
    materials.push(material);
    root.add(new Mesh(geometry, material));
  }
  // The in-scene UI kit's materials (cards, chips, captions), as copies with
  // the cached ones' programs. Captions draw the overlay kind, first at the face-off.
  for (const overlay of [false, true]) {
    for (const material of [createUiToon("#ffffff", { overlay }), createUiOutline("#ffffff", 2.2, { overlay })]) {
      materials.push(material);
      root.add(new Mesh(geometry, material));
    }
  }
  // Sign boards behind marquee and scoreboard text.
  const board = new MeshStandardMaterial({ roughness: 0.85 });
  materials.push(board);
  root.add(new Mesh(geometry, board));
  return {
    root,
    dispose() {
      instances.forEach((mesh) => mesh.dispose());
      skeleton.dispose();
      geometry.dispose();
      texture.dispose();
      materials.forEach((material) => material.dispose());
      root.clear();
    },
  };
}

/** Compile against the real lights and the composer's linear render target. */
export async function compileStageObjects(gl: WebGLRenderer, objects: Object3D, camera: Camera, scene: Scene): Promise<void> {
  const target = new WebGLRenderTarget(1, 1);
  const previous = gl.getRenderTarget();
  try {
    let ready: Promise<Object3D>;
    try {
      gl.setRenderTarget(target);
      ready = gl.compileAsync(objects, camera, scene);
    } finally {
      gl.setRenderTarget(previous);
    }
    await ready;
  } finally {
    target.dispose();
  }
}
