import { Sphere, type Matrix4 } from "three";

const transformed = new Sphere();

/**
 * A conservative bound without skinning every vertex. Each bone transforms
 * the complete rest bound; their enclosing sphere also contains every convex
 * blend of those positions, including separated ragdoll limbs. This stays
 * useful for raycasts while Three uses its centre to sort uncullable meshes.
 */
export function updateSkinBounds(target: Sphere, rest: Sphere, matrices: readonly Matrix4[]): void {
  target.copy(rest);
  const first = matrices[0];
  if (!first) return;
  target.applyMatrix4(first);
  for (let i = 1; i < matrices.length; i += 1) {
    transformed.copy(rest).applyMatrix4(matrices[i]!);
    target.union(transformed);
  }
}
