import { BufferGeometry, Float32BufferAttribute, Line, Mesh, Points, Sprite, type Material, type Object3D } from "three";
import { platformColliders, type ArenaGeometry } from "../../arenas";

/** The receiver follows the solid platform: no shadow sheet over a pit or beyond a rim. */
export function createContactShadowReceiver(geometry: ArenaGeometry, captureSize: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const box of platformColliders(geometry)) {
    if (box.max[1] !== geometry.topY) continue;
    const start = positions.length / 3;
    for (const [x, z] of [
      [box.min[0], box.min[2]],
      [box.min[0], box.max[2]],
      [box.max[0], box.max[2]],
      [box.max[0], box.min[2]],
    ] as const) {
      positions.push(x, 0, z);
      // The capture camera looks up, with world +Z at the top of its image.
      uvs.push(x / captureSize + 0.5, z / captureSize + 0.5);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const receiver = new BufferGeometry();
  receiver.setAttribute("position", new Float32BufferAttribute(positions, 3));
  receiver.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  receiver.setIndex(indices);
  receiver.computeVertexNormals();
  return receiver;
}

function isSolid(material: Material): boolean {
  // An override depth material cannot reproduce custom alpha/discard shaders.
  // Treating their whole billboard as a caster creates rectangular UI/FX shadows.
  return material.visible && material.depthTest && !material.transparent && material.alphaTest === 0 && material.opacity >= 1;
}

/** Exclude non-casters without hiding their children; reuse storage between frames. */
export class ContactShadowCasters {
  private readonly excluded: Object3D[] = [];
  private readonly masks: number[] = [];

  render(root: Object3D, draw: () => void): void {
    try {
      root.traverseVisible((object) => {
        if (!(object instanceof Mesh || object instanceof Line || object instanceof Points || object instanceof Sprite)) return;
        if (object instanceof Mesh && object.castShadow) {
          const solid = Array.isArray(object.material) ? object.material.every(isSolid) : isSolid(object.material);
          if (solid) return;
        }
        this.excluded.push(object);
        this.masks.push(object.layers.mask);
        // Layers affect this draw only, unlike visibility which also hides child casters.
        object.layers.mask = 0;
      });
      draw();
    } finally {
      for (let i = 0; i < this.excluded.length; i += 1) this.excluded[i]!.layers.mask = this.masks[i]!;
      this.excluded.length = 0;
      this.masks.length = 0;
    }
  }
}
