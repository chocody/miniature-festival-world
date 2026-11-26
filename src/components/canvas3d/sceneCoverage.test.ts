// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { CAMERA_PAN_MAX_OVERSHOOT, SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR } from "@/config/camera.config";
import { LOY_KRATHONG_RIVER_ENVIRONMENT } from "@/config/events/loyKrathong.river.config";
import { PINCH_ZOOM_MAX, PINCH_ZOOM_MIN } from "@/config/interaction.config";
import { RIVER_STRETCH_RENDER_RADIUS, RIVER_STRETCH_SWITCH_HYSTERESIS } from "@/config/world.config";
import { getRiverSceneryTopY, LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { applyCameraRigPose, createCameraRigState, getEndlessRiverPanBounds, getFramedCameraZoom } from "@/core/camera";
import { acrossOf, frameToWorldInto, stretchIndexAt, stretchIndexWithHysteresis } from "@/core/coordinates/endlessRiverFrame";
import { getLoyKrathongEndlessRiverFrame } from "@/core/world/endlessRiver";
import { countTriangles, createRibbonGeometry } from "./geometry";
import { getLoyKrathongRitualSite } from "./ritualSite";

/**
 * MFW-68 AC2 + MFW-58 AC1: no background (clear colour) pixel shows from anywhere the camera can be on the endless river — every
 * viewport size × pinch factor × focus in the corridor (along a whole stretch ± the switch hysteresis, across ± overshoot) × yaw.
 * Each corner / centre ray of the view must (1) meet the ground in front of the near plane, (2) before the far plane, (3) inside
 * the ground band (|across| ≤ outerAcross: the strips of a stretch, which join their neighbours exactly), (4) in a stretch that is
 * rendered (S − 1 … S + 1 around the camera's stretch S) and (5) start above the tallest scenery (nothing is cut by the near plane).
 * The ground footprint of an orthographic view is a convex quad and the band is convex, so the view corners are the worst cases.
 */
const layout = LOY_KRATHONG_RIVER_LAYOUT;
const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
const FRAME = getLoyKrathongEndlessRiverFrame();
const CORRIDOR = getEndlessRiverPanBounds(FRAME, def.channel);
const H = RIVER_STRETCH_SWITCH_HYSTERESIS;
const SITE = getLoyKrathongRitualSite();
const SCENERY_TOP_Y = getRiverSceneryTopY();

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
const ALONG_SAMPLES = 9;
/** Focus along a whole stretch ± the hysteresis (the camera's stretch S stays 0 there, or becomes 1 at the very end). */
const FOCUS_ALONG = Array.from({ length: ALONG_SAMPLES }, (_, i) => -H + ((FRAME.length + 2 * H) * i) / (ALONG_SAMPLES - 1));
const FOCUS_ACROSS = [CORRIDOR.minZ - CAMERA_PAN_MAX_OVERSHOOT, 0, CORRIDOR.maxZ + CAMERA_PAN_MAX_OVERSHOOT];
const FOCUS_Y = [0, SITE.tip.y];
const RAYS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, 0],
] as const;

interface CoverageSpec {
  readonly groundY: number;
  readonly outerAcross: number;
  readonly renderRadius: number;
}
const SHIPPED: CoverageSpec = { groundY: layout.ground.y, outerAcross: layout.ground.outerAcross, renderRadius: RIVER_STRETCH_RENDER_RADIUS };

const near = new Vector3();
const far = new Vector3();
const dir = new Vector3();

/** Pushes one message per failing ray of a camera already posed and projected; `stretch` = the camera's current stretch S. */
function checkRays(camera: OrthographicCamera, spec: CoverageSpec, stretch: number, where: string, misses: string[]): void {
  for (const [x, y] of RAYS) {
    near.set(x, y, -1).unproject(camera);
    far.set(x, y, 1).unproject(camera);
    dir.copy(far).sub(near).normalize();
    const t = (spec.groundY - near.y) / dir.y;
    const hitX = near.x + dir.x * t;
    const hitZ = near.z + dir.z * t;
    const ray = `${where} ray (${x}, ${y})`;
    if (!(t >= 0)) misses.push(`${ray}: ground behind the near plane (t ${t})`);
    if (!(t + SCENE_CAMERA_NEAR <= SCENE_CAMERA_FAR)) misses.push(`${ray}: ground beyond the far plane (t ${t})`);
    const across = Math.abs(acrossOf(FRAME, hitX, hitZ));
    if (!(across <= spec.outerAcross - 1e-6)) misses.push(`${ray}: ground hit at |across| ${across} > outerAcross ${spec.outerAcross}`);
    const hitStretch = stretchIndexAt(FRAME, hitX, hitZ);
    if (Math.abs(hitStretch - stretch) > spec.renderRadius) {
      misses.push(`${ray}: ground hit in stretch ${hitStretch}, outside the rendered ${stretch} ± ${spec.renderRadius}`);
    }
    if (!(near.y >= SCENERY_TOP_Y)) misses.push(`${ray}: near plane at y ${near.y} cuts scenery up to ${SCENERY_TOP_Y}`);
  }
}

function makeCamera(w: number, h: number, factor: number): OrthographicCamera {
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
  camera.zoom = getFramedCameraZoom({ width: w, height: h }) * factor;
  camera.updateProjectionMatrix();
  return camera;
}

/** Runs every focus × yaw for one camera; pushes misses. */
function sweep(camera: OrthographicCamera, spec: CoverageSpec, label: string, misses: string[], focusY = FOCUS_Y): void {
  const rig = createCameraRigState();
  const p = { x: 0, z: 0 };
  for (const along of FOCUS_ALONG) {
    for (const across of FOCUS_ACROSS) {
      frameToWorldInto(FRAME, along, across, p);
      const stretch = stretchIndexWithHysteresis(FRAME, p.x, p.z, 0, H);
      for (const fy of focusY) {
        for (let k = 0; k < YAW_STEPS; k++) {
          rig.focusX = p.x;
          rig.focusY = fy;
          rig.focusZ = p.z;
          rig.yawRad = (k * 2 * Math.PI) / YAW_STEPS;
          applyCameraRigPose(rig, camera);
          checkRays(camera, spec, stretch, `${label} focus along ${along.toFixed(2)} across ${across.toFixed(2)} y ${fy} yaw ${k}π/8`, misses);
        }
      }
    }
  }
}

describe("scene coverage: no background anywhere on the endless river (MFW-68 AC2, MFW-58 AC1)", () => {
  it("the ground strips, the near and the far plane cover every view at every size, pinch, corridor focus and yaw", () => {
    expect(SCENERY_TOP_Y).toBeGreaterThan(layout.ground.y);
    const misses: string[] = [];
    for (const [w, h] of SIZES) {
      for (const factor of FACTORS) sweep(makeCamera(w, h, factor), SHIPPED, `${w}×${h} ×${factor}`, misses);
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
    checkRays(camera, SHIPPED, 0, "old distance", misses);
    expect(misses.some((m) => m.includes("behind the near plane"))).toBe(true);
  });

  it("negative control (b): outerAcross 15 leaves background at 3440×1440 zoomed out", () => {
    const misses: string[] = [];
    sweep(makeCamera(3440, 1440, PINCH_ZOOM_MIN), { ...SHIPPED, outerAcross: 15 }, "narrow band", misses, [0]);
    expect(misses.some((m) => m.includes("> outerAcross"))).toBe(true);
  });

  it("negative control (c): rendering only the camera's stretch (radius 0) leaves background", () => {
    const misses: string[] = [];
    sweep(makeCamera(1440, 900, 1), { ...SHIPPED, renderRadius: 0 }, "one stretch", misses, [0]);
    expect(misses.some((m) => m.includes("outside the rendered"))).toBe(true);
  });

  it("the ground strips stay within 4·(segments + 1)·2 triangles per stretch (AC5 of MFW-68, MFW-58)", () => {
    const g = createRibbonGeometry(layout.ground.strips);
    expect(countTriangles(g)).toBeLessThanOrEqual(4 * (layout.ribbonSegments + 1) * 2);
    g.dispose();
  });
});
