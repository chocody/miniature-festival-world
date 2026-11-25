// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR } from "@/config/camera.config";
import { LOY_KRATHONG_RIVER_ENVIRONMENT } from "@/config/events/loyKrathong.river.config";
import { PINCH_ZOOM_MAX } from "@/config/interaction.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import {
  applyCameraRigPose,
  createCameraRigState,
  getFramedCameraZoom,
  getRiverPanBounds,
  isInsidePanBounds,
  type CameraPanBounds,
} from "@/core/camera";
import { splineProgressToWorld } from "@/core/coordinates";
import { getLoyKrathongRitualSite } from "./ritualSite";

/** MFW-57 AC3: the soft pan bounds keep the river in view at every zoom, rotation and viewport. */
const BOUNDS = getRiverPanBounds(LOY_KRATHONG_RIVER_ENVIRONMENT.channel);
const SITE = getLoyKrathongRitualSite();
const SIZES = [
  [360, 640],
  [390, 844],
  [844, 390],
  [1440, 900],
] as const;
const ZOOM_FACTORS = [1, PINCH_ZOOM_MAX];
const EDGE_SAMPLES = 9;

const WATER_SAMPLES: Vector3[] = (() => {
  const out: Vector3[] = [];
  for (let i = 0; i <= 100; i++) {
    for (const lateral of [-0.5, 0, 0.5]) {
      const p = splineProgressToWorld(LOY_KRATHONG_RIVER_LAYOUT.channel, i / 100, lateral).position;
      out.push(new Vector3(p.x, p.y, p.z));
    }
  }
  return out;
})();

function focusSamples(bounds: CameraPanBounds): { x: number; z: number }[] {
  const { minX, maxX, minZ, maxZ } = bounds;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const out = [
    { x: minX, z: minZ },
    { x: minX, z: maxZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: midX, z: minZ },
    { x: midX, z: maxZ },
    { x: minX, z: midZ },
    { x: maxX, z: midZ },
  ];
  for (let i = 0; i < EDGE_SAMPLES; i++) {
    const z = minZ + ((maxZ - minZ) * i) / (EDGE_SAMPLES - 1);
    out.push({ x: minX, z }, { x: maxX, z });
  }
  return out;
}

function waterInView(focus: { x: number; z: number }, yawRad: number, width: number, height: number, factor: number): boolean {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  camera.zoom = getFramedCameraZoom({ width, height }) * factor;
  camera.updateProjectionMatrix();
  const rig = createCameraRigState();
  rig.focusX = focus.x;
  rig.focusY = SITE.tip.y;
  rig.focusZ = focus.z;
  rig.yawRad = yawRad;
  applyCameraRigPose(rig, camera);
  const v = new Vector3();
  for (const w of WATER_SAMPLES) {
    v.copy(w).project(camera);
    if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1) return true;
  }
  return false;
}

describe("river view bounds (MFW-57)", () => {
  it("the release view starts inside the bounds", () => {
    expect(isInsidePanBounds(SITE.tip.x, SITE.tip.z, BOUNDS)).toBe(true);
    for (const p of LOY_KRATHONG_RIVER_ENVIRONMENT.channel.controlPoints) {
      expect(isInsidePanBounds(p.x, p.z, BOUNDS)).toBe(true);
    }
  });

  it("the river stays in view from anywhere inside the bounds", () => {
    const misses: string[] = [];
    for (const focus of focusSamples(BOUNDS)) {
      for (let k = 0; k < 8; k++) {
        const yawRad = (k * Math.PI) / 4;
        for (const [w, h] of SIZES) {
          for (const factor of ZOOM_FACTORS) {
            if (!waterInView(focus, yawRad, w, h, factor)) misses.push(`${focus.x},${focus.z} yaw ${k}π/4 ${w}×${h} ×${factor}`);
          }
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it("negative control: a focus far beyond the bounds shows no water", () => {
    expect(waterInView({ x: 0, z: BOUNDS.maxZ + 20 }, 0, 360, 640, 1)).toBe(false);
  });
});
