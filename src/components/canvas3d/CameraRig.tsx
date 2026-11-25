"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useSpring } from "@react-spring/three";
import { useEffect, useImperativeHandle, useLayoutEffect, useState, type Ref, type RefObject } from "react";
import { Vector3 } from "three";
import { CAMERA_FLIGHT_SPRING_CONFIG } from "@/config/camera.config";
import { MS_PER_SECOND } from "@/core/coordinates/splineConstants";
import {
  applyCameraRigPose,
  beginRigFlight,
  copyPoseIntoRig,
  createCameraController,
  getFlightYaw,
  getRotateStepPose,
  stepCameraRig,
  type CameraAnimationApi,
  type CameraPanBounds,
  type CameraRigState,
} from "@/core/camera";

export interface WorldPositionSource {
  getWorldPosition(target: Vector3): Vector3;
}
export interface PointTarget extends WorldPositionSource {
  setXZ(x: number, z: number): void;
}

/** A movable fly/highlight target that is not a scene object (the tapped water point). */
export function createPointTarget(x: number, y: number, z: number): PointTarget {
  let px = x;
  let pz = z;
  return {
    getWorldPosition(target) {
      return target.set(px, y, pz);
    },
    setXZ(nextX, nextZ) {
      px = nextX;
      pz = nextZ;
    },
  };
}

export interface CameraRigHandle {
  rotateBy(deltaRad: number): void;
}

export interface CameraRigProps {
  /** Stable callback from SceneViewport (the rig outlives a tier-change Canvas re-creation). */
  getRig: () => CameraRigState;
  /** Module constant (stable). */
  bounds: CameraPanBounds;
  targetRef: RefObject<WorldPositionSource | null> | null;
  requestId: number;
  reducedMotion: boolean;
  handleRef: Ref<CameraRigHandle>;
}

/**
 * MFW-57: the one writer of the camera pose. react-spring animates fly-to and the rotate button (FLIGHT); the user's drag
 * writes the rig directly (MANUAL) and the release eases out per frame (COAST). Every frame applies the rig to the camera.
 *
 * Flights use yaw 0 in CUSTOMIZE and RITUAL_RELEASE without any lock: only WORLD_EXPLORE gestures change the yaw, WORLD_EXPLORE
 * is terminal in the flow machine, and FlowRoot unmounts SceneViewport in WRITE_WISH, so every ritual entry starts with a
 * fresh rig.
 */
export function CameraRig({ getRig, bounds, targetRef, requestId, reducedMotion, handleRef }: CameraRigProps): null {
  const invalidate = useThree((s) => s.invalidate);
  const [scratch] = useState(() => new Vector3());
  const [springs, api] = useSpring(() => ({
    focusX: 0,
    focusY: 0,
    focusZ: 0,
    yawRad: 0,
    config: { ...CAMERA_FLIGHT_SPRING_CONFIG },
    onChange: invalidate,
  }));

  // The spring starts equal to the rig before any frame (also after a Canvas re-creation).
  useLayoutEffect(() => {
    const rig = getRig();
    api.set({ focusX: rig.focusX, focusY: rig.focusY, focusZ: rig.focusZ, yawRad: rig.yawRad });
  }, [api, getRig]);

  useEffect(() => {
    const target = targetRef?.current;
    if (!target) return;
    const rig = getRig();
    target.getWorldPosition(scratch);
    const yaw = getFlightYaw(rig);
    syncSpringToRig(api, rig);
    createCameraController(flightAnimation(api, rig), reducedMotion).flyTo(scratch, yaw);
    invalidate();
  }, [api, invalidate, reducedMotion, requestId, targetRef, getRig, scratch]);

  useImperativeHandle(
    handleRef,
    () => ({
      rotateBy(deltaRad: number) {
        const rig = getRig();
        const to = getRotateStepPose(rig, deltaRad);
        syncSpringToRig(api, rig);
        createCameraController(flightAnimation(api, rig), reducedMotion).rotateTo(to);
        invalidate();
      },
    }),
    [api, invalidate, reducedMotion, getRig],
  );

  useFrame((state, deltaSeconds) => {
    const rig = getRig();
    if (rig.stopFlightRequested) {
      api.stop();
      rig.stopFlightRequested = false;
    }
    if (rig.phase === "FLIGHT") {
      copyPoseIntoRig(rig, springs.focusX.get(), springs.focusY.get(), springs.focusZ.get(), springs.yawRad.get());
    } else if (rig.phase === "COAST" && stepCameraRig(rig, deltaSeconds * MS_PER_SECOND, bounds)) {
      state.invalidate();
    }
    applyCameraRigPose(rig, state.camera);
  });

  return null;
}

interface RigSpringApi {
  set(values: { focusX: number; focusY: number; focusZ: number; yawRad: number }): unknown;
  start(options: Parameters<CameraAnimationApi["start"]>[0]): unknown;
}

/** Outside a flight the spring is stale: put it where the rig is before animating from there. */
function syncSpringToRig(api: RigSpringApi, rig: CameraRigState): void {
  if (rig.phase === "FLIGHT") return;
  api.set({ focusX: rig.focusX, focusY: rig.focusY, focusZ: rig.focusZ, yawRad: rig.yawRad });
}

function flightAnimation(api: RigSpringApi, rig: CameraRigState): CameraAnimationApi {
  return {
    start(options) {
      beginRigFlight(rig, options.to);
      void api.start(options);
    },
  };
}
