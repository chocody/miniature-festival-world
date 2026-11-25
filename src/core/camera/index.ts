import { CAMERA_FLIGHT_OFFSET, HIGHLIGHT_RING_SIZES } from "@/config/camera.config";
import { getCameraRigPose, type CameraRigPose } from "./cameraRig";

export * from "./cameraRig";

export interface CameraTargetPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type CameraTargetKind = "water" | "krathong" | "lamp" | "riverKrathong";

export interface CameraFlightPose {
  readonly cameraX: number;
  readonly cameraY: number;
  readonly cameraZ: number;
  readonly focusX: number;
  readonly focusY: number;
  readonly focusZ: number;
}

export interface CameraAnimationApi {
  start: (options: { to: CameraRigPose; immediate: boolean }) => void;
}

export interface MutablePosition {
  set: (x: number, y: number, z: number) => unknown;
}

/** The yaw-0 camera + focus pose; equals `applyCameraRigPose` at yaw 0 (ritualSite.ts and sceneFraming.test.ts use it). */
export function getCameraFlightPose(target: CameraTargetPosition): CameraFlightPose {
  return {
    cameraX: target.x + CAMERA_FLIGHT_OFFSET[0],
    cameraY: target.y + CAMERA_FLIGHT_OFFSET[1],
    cameraZ: target.z + CAMERA_FLIGHT_OFFSET[2],
    focusX: target.x,
    focusY: target.y,
    focusZ: target.z,
  };
}

/** Creates an interruptible target-focused camera action with a reduced-motion instant cut. */
export function createCameraController(animation: CameraAnimationApi, reducedMotion: boolean) {
  return {
    /** Flies the rig focus to the target, keeping `yawRad` (the user's rotation, MFW-57). */
    flyTo(target: CameraTargetPosition, yawRad: number = 0) {
      animation.start({ to: getCameraRigPose(target, yawRad), immediate: reducedMotion });
    },
    /** Animates the rig to a pose (the world rotate button). */
    rotateTo(pose: CameraRigPose) {
      animation.start({ to: pose, immediate: reducedMotion });
    },
  };
}

/** Keep a ring centered on the target's latest world position without allocating a new vector. */
export function updateHighlightPosition(
  target: CameraTargetPosition,
  ringPosition: MutablePosition,
  heightOffset: number = HIGHLIGHT_RING_SIZES.water.heightOffset,
): void {
  ringPosition.set(target.x, target.y + heightOffset, target.z);
}

export { getFramedCameraZoom, type ViewportPixelSize } from "./viewportFraming";
