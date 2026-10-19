// Camera-fixed UI (The Voice's caption, the fight HUD, the face-off's
// spotlit notes): placed in front of the camera every frame after the camera
// rig, so the rig lights it, the post stack grades it and the camera's shake
// moves it. During depth of field it sits at the focus distance (scaled to
// the same screen size), and its overlay materials write depth, so it stays
// sharp.

import { Vector3, type Object3D, type PerspectiveCamera } from "three";
import type { PostFx } from "../look/post-fx";

/** Distance in front of the camera when no depth of field is on. */
export const SCREEN_DEPTH = 2.2;

const tmpForward = new Vector3();
const tmpUp = new Vector3();
const tmpFocus = new Vector3();

/** How far in front of the camera camera-fixed UI sits this frame. */
export function screenDepth(camera: PerspectiveCamera, fx: PostFx): number {
  if (fx.dof.strength <= 0.05) return SCREEN_DEPTH;
  tmpFocus.copy(fx.dof.focus).sub(camera.position);
  tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  return Math.min(14, Math.max(1.5, tmpFocus.dot(tmpForward)));
}

/**
 * Put `group` in front of the camera at `depth`, facing it, scaled so one
 * local unit is the view height there, offset by `x` and `y` view heights
 * (x across, y up; the frame is `camera.aspect` wide). Returns the view height.
 */
export function placeOnScreen(group: Object3D, camera: PerspectiveCamera, depth: number, x = 0, y = 0): number {
  const viewHeight = 2 * depth * Math.tan(((camera.fov ?? 40) * Math.PI) / 360);
  tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  group.position.copy(camera.position).addScaledVector(tmpForward, depth).addScaledVector(tmpUp, y * viewHeight);
  if (x !== 0) group.position.addScaledVector(tmpUp.set(1, 0, 0).applyQuaternion(camera.quaternion), x * viewHeight);
  group.quaternion.copy(camera.quaternion);
  group.scale.setScalar(viewHeight);
  return viewHeight;
}
