import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR } from "@/config/camera.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT, LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { PERCENT_SCALE } from "@/config/interaction.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { getCameraFlightPose, getFramedCameraZoom } from "@/core/camera";
import {
  LATERAL_OFFSET_RANGE,
  locateOnLane,
  splineProgressToWorld,
  type RiverLane,
  type RiverLaneSet,
  type WorldVec3,
  type WorldXZ,
} from "@/core/coordinates";
import { clampSpotToLane, getLoyKrathongRiverLanes, type RiverSpot } from "@/core/world";

export interface RitualSite {
  readonly tip: WorldVec3; // preview spot (deck top)
  readonly releasePoint: WorldVec3; // button touchdown (water)
  readonly waterSurfaceY: number;
  readonly releaseYawRad: number; // lane yaw at LOY_KRATHONG_PIER_RELEASE_SPOT
  readonly channel: RiverLane; // visible water (on-water test)
  readonly lane: RiverLane; // the river lane
}

let siteCache: RitualSite | null = null;

/** Memoised; render-time values only, never persisted (invariant A). */
export function getLoyKrathongRitualSite(): RitualSite {
  if (siteCache === null) {
    const lane = getLoyKrathongRiverLanes().get(LOY_KRATHONG_RIVER_LANE_ID);
    if (!lane) throw new Error("Loy Krathong river lane is missing");
    siteCache = Object.freeze({
      tip: LOY_KRATHONG_RIVER_LAYOUT.pier.tip,
      releasePoint: LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint,
      waterSurfaceY: LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY,
      releaseYawRad: splineProgressToWorld(lane, LOY_KRATHONG_PIER_RELEASE_SPOT.progress, 0).yawRad,
      channel: LOY_KRATHONG_RIVER_LAYOUT.channel,
      lane,
    });
  }
  return siteCache;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}
export interface PercentPoint {
  readonly x: number;
  readonly y: number;
} // 0..PERCENT_SCALE, origin top-left
export interface RitualDrop {
  readonly point: WorldXZ;
  readonly onWater: boolean;
  readonly candidate: RiverSpot;
}
/** `zoomFactor` is the pinch factor over the framed zoom of `size` (getFramedCameraZoom, MFW-54), as in SceneViewport. */
export interface RitualDropMapper {
  /** Screen percent → the deck-height plane (y = site.tip.y) of the ritual view. null if the size is not positive/finite or the ray misses. */
  toDeckPlane(percent: PercentPoint, size: ViewportSize, zoomFactor: number): WorldXZ | null;
  /** Same, plus the on-water test and the clamped lane location of the drop. */
  mapDrop(percent: PercentPoint, size: ViewportSize, zoomFactor: number): RitualDrop | null;
  /** Inverse used by tests: world point → screen percent in the ritual view. */
  toPercent(point: WorldVec3, size: ViewportSize, zoomFactor: number): PercentPoint;
}

const NDC_SPAN = 2;
const HALF = 2;

function usableSize(size: ViewportSize, zoomFactor: number): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    Number.isFinite(zoomFactor) &&
    zoomFactor > 0
  );
}

/**
 * The ritual view is the camera AFTER the RITUAL_RELEASE framing flight: R3F's default orthographic camera at the
 * pier-tip flight pose. One camera, raycaster, plane and vectors per mapper, reused on every call.
 */
export function createRitualDropMapper(
  site: RitualSite = getLoyKrathongRitualSite(),
  lanes: RiverLaneSet = getLoyKrathongRiverLanes(),
): RitualDropMapper {
  void lanes;
  const camera = new OrthographicCamera(-1, 1, 1, -1, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  const raycaster = new Raycaster();
  const plane = new Plane();
  const ndc = new Vector2();
  const hit = new Vector3();
  const projected = new Vector3();
  const up = new Vector3(0, 1, 0);
  const pose = getCameraFlightPose(site.tip);

  function frame(size: ViewportSize, zoomFactor: number): void {
    camera.left = -size.width / HALF;
    camera.right = size.width / HALF;
    camera.top = size.height / HALF;
    camera.bottom = -size.height / HALF;
    camera.zoom = getFramedCameraZoom(size) * zoomFactor;
    camera.position.set(pose.cameraX, pose.cameraY, pose.cameraZ);
    camera.lookAt(pose.focusX, pose.focusY, pose.focusZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function toDeckPlane(percent: PercentPoint, size: ViewportSize, zoomFactor: number): WorldXZ | null {
    if (!usableSize(size, zoomFactor)) return null;
    frame(size, zoomFactor);
    ndc.set((percent.x / PERCENT_SCALE) * NDC_SPAN - 1, -((percent.y / PERCENT_SCALE) * NDC_SPAN - 1));
    raycaster.setFromCamera(ndc, camera);
    plane.set(up, -site.tip.y);
    if (raycaster.ray.intersectPlane(plane, hit) === null) return null;
    return { x: hit.x, z: hit.z };
  }

  return {
    toDeckPlane,
    mapDrop(percent, size, zoomFactor) {
      const point = toDeckPlane(percent, size, zoomFactor);
      if (point === null) return null;
      const onWater = Math.abs(locateOnLane(site.channel, point).lateralOffset) <= LATERAL_OFFSET_RANGE[1];
      const loc = locateOnLane(site.lane, point);
      const candidate = clampSpotToLane(
        { laneId: site.lane.laneId, progress: loc.progress, lateralOffset: loc.lateralOffset },
        site.lane,
      );
      return { point, onWater, candidate };
    },
    toPercent(point, size, zoomFactor) {
      frame(size, zoomFactor);
      projected.set(point.x, point.y, point.z).project(camera);
      return {
        x: ((projected.x + 1) / NDC_SPAN) * PERCENT_SCALE,
        y: ((1 - projected.y) / NDC_SPAN) * PERCENT_SCALE,
      };
    },
  };
}
