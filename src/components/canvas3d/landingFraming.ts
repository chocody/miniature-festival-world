import { DEFAULT_VIEW_YAW_RAD } from "@/config/camera.config";
import { copyPoseIntoRig, createCameraRigState, type CameraRigPose, type CameraRigState } from "@/core/camera";

/**
 * MFW-154: the world position of the pier focus group (it sits at `tip` inside the current-stretch group at
 * `(offsetX, 0, offsetZ)`) as a rig pose with the default view yaw — the post-release framing the landing starts on.
 */
export function pierFramingPose(
  tip: { readonly x: number; readonly y: number; readonly z: number },
  offsetX: number,
  offsetZ: number,
): CameraRigPose {
  return { focusX: offsetX + tip.x, focusY: tip.y, focusZ: offsetZ + tip.z, yawRad: DEFAULT_VIEW_YAW_RAD };
}

/** A fresh rig, seeded on `pose` when given (MFW-154 landing); `null` keeps the origin rig. */
export function createRigAt(pose: CameraRigPose | null): CameraRigState {
  const rig = createCameraRigState();
  if (pose !== null) copyPoseIntoRig(rig, pose.focusX, pose.focusY, pose.focusZ, pose.yawRad);
  return rig;
}
