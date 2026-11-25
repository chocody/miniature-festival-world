import type { Object3D } from "three";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { RELEASE_BUMP } from "@/config/ritual.config";
import { TOY_SCENE_LIGHTING } from "@/config/scene.config";
import { createSplinePoseOut, splineCoordToPoseInto, type SplinePoseOut, type WorldXZ } from "@/core/coordinates";
import { trackMarkCue, writeMarkCueAt, type BounceFrame, type MarkCueState } from "@/core/effects";
import type { OwnKrathongPoseKind } from "@/core/ritual";
import {
  applyRiverItemTransform,
  createRiverFrameScratch,
  type PreparedRiverItem,
  type RiverFrameScratch,
} from "@/core/world";
import type { RitualSite } from "./ritualSite";

export interface OwnPoseFrame {
  readonly kind: OwnKrathongPoseKind;
  readonly site: RitualSite;
  readonly dragPoint: WorldXZ | null; // deck-plane point under the finger (DRAG)
  readonly releaseDrop: WorldXZ | null; // accepted drop point of a "drop" release; null for "pier"
  readonly own: PreparedRiverItem | null; // prepared saved creation (server coord + createdAt), null before SAVED
  readonly lower: number; // spring values
  readonly settle: number;
  readonly bump: number;
  readonly nowMs: number; // Date.now() + serverClockOffsetMs
  readonly reducedMotion: boolean;
}
export interface OwnPoseScratch {
  readonly pose: SplinePoseOut;
  readonly river: RiverFrameScratch;
}

export function createOwnPoseScratch(): OwnPoseScratch {
  return { pose: createSplinePoseOut(), river: createRiverFrameScratch() };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const NO_ROTATION = 0;
const UNIT_SCALE = 1;
const YXZ = "YXZ" as const;

/** The ripple point of a release: the accepted drop, else the pier's release point. */
export function ritualTouchdownXZ(site: RitualSite, releaseDrop: WorldXZ | null): WorldXZ {
  return releaseDrop ?? { x: site.releasePoint.x, z: site.releasePoint.z };
}

/** Per frame, allocation-free. Writes position, rotation (YXZ), scale and visible of `target`. */
export function writeOwnKrathongPose(target: Object3D, frame: OwnPoseFrame, scratch: OwnPoseScratch): void {
  const { site } = frame;
  const tip = site.tip;
  const hop = frame.bump * RELEASE_BUMP.hopHeight;
  switch (frame.kind) {
    case "ORIGIN":
      target.visible = true;
      target.position.set(0, 0, 0);
      target.rotation.set(NO_ROTATION, NO_ROTATION, NO_ROTATION, YXZ);
      target.scale.setScalar(UNIT_SCALE);
      return;
    case "PIER":
      target.visible = true;
      target.position.set(tip.x, tip.y, tip.z);
      target.rotation.set(NO_ROTATION, site.releaseYawRad, NO_ROTATION, YXZ);
      target.scale.setScalar(RIVER_KRATHONG_SCALE);
      return;
    case "DRAG": {
      const d = frame.dragPoint;
      target.visible = true;
      target.position.set(d ? d.x : tip.x, tip.y, d ? d.z : tip.z);
      target.rotation.set(NO_ROTATION, site.releaseYawRad, NO_ROTATION, YXZ);
      target.scale.setScalar(RIVER_KRATHONG_SCALE);
      return;
    }
    case "RELEASING": {
      const drop = frame.releaseDrop;
      const startX = drop ? drop.x : tip.x;
      const startZ = drop ? drop.z : tip.z;
      const touchX = drop ? drop.x : site.releasePoint.x;
      const touchY = site.waterSurfaceY;
      const touchZ = drop ? drop.z : site.releasePoint.z;
      let x = lerp(startX, touchX, frame.lower);
      let y = lerp(tip.y, drop ? touchY : site.releasePoint.y, frame.lower);
      let z = lerp(startZ, touchZ, frame.lower);
      let yaw = site.releaseYawRad;
      if (frame.own !== null) {
        const t = splineCoordToPoseInto(frame.own.coord, frame.own.lane, frame.own.createdAtMs, frame.nowMs, scratch.pose);
        x = lerp(x, t.x, frame.settle);
        y = lerp(y, t.y, frame.settle);
        z = lerp(z, t.z, frame.settle);
        yaw = lerp(yaw, t.yawRad, frame.settle);
      }
      target.visible = true;
      target.position.set(x, y + hop, z);
      target.rotation.set(NO_ROTATION, yaw, NO_ROTATION, YXZ);
      target.scale.setScalar(RIVER_KRATHONG_SCALE);
      return;
    }
    case "RIVER":
      if (frame.own === null) {
        target.visible = false;
        return;
      }
      applyRiverItemTransform(target, frame.own, frame.nowMs, frame.reducedMotion, scratch.river);
      target.position.y += hop;
      target.scale.setScalar(RIVER_KRATHONG_SCALE);
      target.visible = true;
      return;
    case "HIDDEN":
      target.visible = false;
      return;
  }
}

/** Uniform scale writeOwnKrathongPose gives `kind`: 1 at ORIGIN (CUSTOMIZE), RIVER_KRATHONG_SCALE everywhere else (HIDDEN included). */
export function ownKrathongPoseScale(kind: OwnKrathongPoseKind): number {
  return kind === "ORIGIN" ? UNIT_SCALE : RIVER_KRATHONG_SCALE;
}

/** Candle point-light distance (world units) at pose scale `poseScale`. */
export function candleLightDistance(poseScale: number): number {
  return TOY_SCENE_LIGHTING.candle.distance * poseScale;
}

/** Candle point-light intensity: spring value × preset scale × poseScale² (inverse-square: same look at every pose scale). */
export function candleLightIntensity(springValue: number, presetScale: number, poseScale: number): number {
  return springValue * presetScale * poseScale * poseScale;
}

/**
 * Per frame, allocation-free: tracks the mark (`markedId` null = unmarked) and sets `target.scale` to the mark cue (1 when unmarked).
 * Returns true while the cue still animates (the caller keeps the demand loop alive).
 */
export function writeMarkCueScale(
  target: Object3D,
  markedId: string | null,
  nowMs: number,
  reducedMotion: boolean,
  state: MarkCueState,
  out: BounceFrame,
): boolean {
  trackMarkCue(state, markedId, nowMs);
  if (markedId === null) {
    target.scale.setScalar(UNIT_SCALE);
    return false;
  }
  writeMarkCueAt(nowMs - state.startedAtMs, reducedMotion, out);
  target.scale.setScalar(out.scale);
  return !out.done;
}
