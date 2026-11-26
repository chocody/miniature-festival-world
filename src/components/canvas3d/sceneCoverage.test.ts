// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { CAMERA_PAN_MAX_OVERSHOOT, SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR } from "@/config/camera.config";
import {
  LOY_KRATHONG_BUSH_CLUMPS,
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_TREE_SHAPES,
  RIVER_ENVIRONMENT_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { PINCH_ZOOM_MAX, PINCH_ZOOM_MIN } from "@/config/interaction.config";
import type { ScenePartSpec } from "@/config/scene.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { applyCameraRigPose, createCameraRigState, getFramedCameraZoom, getRiverPanBounds } from "@/core/camera";
import { TREE_SHAPE_IDS, bladeTuftExtent, foliageClumpsExtent } from "@/core/world";
import { countTriangles, createGroundGeometry } from "./geometry";
import { getLoyKrathongRitualSite } from "./ritualSite";

/**
 * MFW-68 AC2: no background (clear colour) pixel shows from anywhere the camera can be — every viewport size × pinch factor ×
 * focus in the pan bounds ± overshoot × yaw. Each corner / centre ray of the view must (1) meet the ground in front of the near
 * plane, (2) before the far plane, (3) inside the ground polygon, and (4) start above the tallest scenery (nothing is cut by the
 * near plane). The ground footprint of an orthographic view is a convex quad and the ground disc is convex, so the view corners
 * and the corners of the focus rectangle are the worst cases.
 */
const layout = LOY_KRATHONG_RIVER_LAYOUT;
const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
const PAN = getRiverPanBounds(def.channel);
const BOUNDS = {
  minX: PAN.minX - CAMERA_PAN_MAX_OVERSHOOT,
  maxX: PAN.maxX + CAMERA_PAN_MAX_OVERSHOOT,
  minZ: PAN.minZ - CAMERA_PAN_MAX_OVERSHOOT,
  maxZ: PAN.maxZ + CAMERA_PAN_MAX_OVERSHOOT,
};
const SITE = getLoyKrathongRitualSite();

/** The sceneFraming.test.ts sizes plus extreme aspect ratios and huge screens. */
const SIZES = [
  [360, 640],
  [390, 844],
  [1440, 900],
  [844, 390],
  [640, 360],
  [1280, 720],
  [320, 568],
  [2560, 1080],
  [600, 800],
  [1024, 768],
  [3440, 1440],
  [360, 860],
  [1500, 300],
  [200, 800],
  [1600, 300],
  [7680, 4320],
  [412, 915],
  [411, 960],
] as const;
const FACTORS = [PINCH_ZOOM_MIN, 1, PINCH_ZOOM_MAX];
const YAW_STEPS = 16;
const FOCUS_XZ = [
  { x: BOUNDS.minX, z: BOUNDS.minZ },
  { x: BOUNDS.minX, z: BOUNDS.maxZ },
  { x: BOUNDS.maxX, z: BOUNDS.minZ },
  { x: BOUNDS.maxX, z: BOUNDS.maxZ },
  { x: 0, z: 0 },
];
const FOCUS_Y = [0, SITE.tip.y];
const RAYS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, 0],
] as const;

/** MFW-70: crowns and bushes are clusters of leaf-clump instances; their tops come from the clump layouts. */
const CROWN_CLUMPS = [...TREE_SHAPE_IDS.map((id) => LOY_KRATHONG_TREE_SHAPES[id].clumps), LOY_KRATHONG_BUSH_CLUMPS];
/** After riverLayout.test.ts (topY): the top of a part (or of the tallest crown built from it) above its placement origin, at scale 1. */
function topY(part: ScenePartSpec): number {
  const g = part.geometry;
  switch (g.kind) {
    case "icosahedron": return part.yOffset + g.radius * (g.scaleY ?? 1);
    case "leafClump": return Math.max(...CROWN_CLUMPS.map((clumps) => foliageClumpsExtent(clumps, g.lumpAmplitude).topY));
    case "trunk": return part.yOffset + g.height;
    case "bladeTuft": return part.yOffset + bladeTuftExtent(g.blades).topY;
    default: return part.yOffset + g.height / 2;
  }
}
const MAX_PLACEMENT_SCALE = Math.max(
  ...[def.houses, def.trees, def.bushes, def.rocks, def.lamps].flatMap((list) => list.map((p) => p.scale)),
);
const SCENERY_TOP_Y =
  Math.max(...def.bankProfile.map((p) => p.y)) +
  Math.max(...Object.values(RIVER_ENVIRONMENT_PARTS).map((part) => topY(part))) * MAX_PLACEMENT_SCALE;

interface GroundSpec {
  readonly y: number;
  readonly radius: number;
  readonly segments: number;
}

const near = new Vector3();
const far = new Vector3();
const dir = new Vector3();

/** Pushes one message per failing ray of a camera already posed and projected. */
function checkRays(camera: OrthographicCamera, ground: GroundSpec, where: string, misses: string[]): void {
  const inradius = ground.radius * Math.cos(Math.PI / ground.segments);
  for (const [x, y] of RAYS) {
    near.set(x, y, -1).unproject(camera);
    far.set(x, y, 1).unproject(camera);
    dir.copy(far).sub(near).normalize();
    const t = (ground.y - near.y) / dir.y;
    const hitX = near.x + dir.x * t;
    const hitZ = near.z + dir.z * t;
    const ray = `${where} ray (${x}, ${y})`;
    if (!(t >= 0)) misses.push(`${ray}: ground behind the near plane (t ${t})`);
    if (!(t + SCENE_CAMERA_NEAR <= SCENE_CAMERA_FAR)) misses.push(`${ray}: ground beyond the far plane (t ${t})`);
    const r = Math.hypot(hitX, hitZ);
    if (!(r <= inradius)) misses.push(`${ray}: ground hit at r ${r} > inradius ${inradius}`);
    if (!(near.y >= SCENERY_TOP_Y)) misses.push(`${ray}: near plane at y ${near.y} cuts scenery up to ${SCENERY_TOP_Y}`);
  }
}

function makeCamera(w: number, h: number, factor: number): OrthographicCamera {
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  camera.zoom = getFramedCameraZoom({ width: w, height: h }) * factor;
  camera.updateProjectionMatrix();
  return camera;
}

describe("scene coverage: no background from anywhere in the camera bounds (MFW-68 AC2)", () => {
  it("the ground, the near and the far plane cover every view at every size, pinch, focus and yaw", () => {
    expect(SCENERY_TOP_Y).toBeGreaterThan(layout.ground.y);
    const misses: string[] = [];
    const rig = createCameraRigState();
    for (const [w, h] of SIZES) {
      for (const factor of FACTORS) {
        const camera = makeCamera(w, h, factor);
        for (const focus of FOCUS_XZ) {
          for (const fy of FOCUS_Y) {
            for (let k = 0; k < YAW_STEPS; k++) {
              rig.focusX = focus.x;
              rig.focusY = fy;
              rig.focusZ = focus.z;
              rig.yawRad = (k * 2 * Math.PI) / YAW_STEPS;
              applyCameraRigPose(rig, camera);
              checkRays(camera, layout.ground, `${w}×${h} ×${factor} focus ${focus.x},${fy},${focus.z} yaw ${k}π/8`, misses);
            }
          }
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it("negative control (a): the MFW-49 camera distance lets the near plane cut the ground at 390×844 zoomed out", () => {
    const camera = makeCamera(390, 844, PINCH_ZOOM_MIN);
    const OLD_OFFSET = [4.5, 5.5, 7] as const;
    camera.position.set(OLD_OFFSET[0], OLD_OFFSET[1], OLD_OFFSET[2]);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const misses: string[] = [];
    checkRays(camera, layout.ground, "old distance", misses);
    expect(misses.some((m) => m.includes("behind the near plane"))).toBe(true);
  });

  it("negative control (b): a radius-30 ground leaves background at 3440×1440 zoomed out at the bounds corner", () => {
    const camera = makeCamera(3440, 1440, PINCH_ZOOM_MIN);
    const rig = createCameraRigState();
    const misses: string[] = [];
    for (let k = 0; k < YAW_STEPS; k++) {
      rig.focusX = BOUNDS.minX;
      rig.focusY = 0;
      rig.focusZ = BOUNDS.minZ;
      rig.yawRad = (k * 2 * Math.PI) / YAW_STEPS;
      applyCameraRigPose(rig, camera);
      checkRays(camera, { ...layout.ground, radius: 30 }, `yaw ${k}`, misses);
    }
    expect(misses.some((m) => m.includes("> inradius"))).toBe(true);
  });

  it("the bigger ground adds no triangle (AC5)", () => {
    const bigger = createGroundGeometry(layout.ground);
    const before = createGroundGeometry({ ...layout.ground, radius: 30 });
    expect(countTriangles(bigger)).toBe(countTriangles(before));
    bigger.dispose();
    before.dispose();
  });
});
