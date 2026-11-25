// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { CAMERA_FLIGHT_OFFSET, SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR, SCENE_CAMERA_ZOOM } from "@/config/camera.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { LAMP_TAP_RADIUS, RIVER_KRATHONG_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { LOY_KRATHONG_PIER } from "@/config/events/loyKrathong.river.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { getCameraFlightPose, getFramedCameraZoom } from "@/core/camera";
import { splineProgressToWorld } from "@/core/coordinates";
import { getLoyKrathongRitualSite } from "./ritualSite";

/** Backlog 10.2 AC3 (MFW-54): the framed zoom keeps the pier and both banks at the pier in view at any aspect ratio. */
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
  [200, 800],
  [1600, 300],
] as const;

interface Pose {
  readonly name: string;
  readonly camera: readonly [number, number, number];
  readonly focus: readonly [number, number, number];
}

const ritualPose = getCameraFlightPose(getLoyKrathongRitualSite().tip);
const POSES: readonly Pose[] = [
  { name: "default (CUSTOMIZE)", camera: CAMERA_FLIGHT_OFFSET, focus: [0, 0, 0] },
  {
    name: "ritual/world",
    camera: [ritualPose.cameraX, ritualPose.cameraY, ritualPose.cameraZ],
    focus: [ritualPose.focusX, ritualPose.focusY, ritualPose.focusZ],
  },
];

const { pier, channel } = LOY_KRATHONG_RIVER_LAYOUT;
const POINTS: readonly { readonly name: string; readonly p: { readonly x: number; readonly y: number; readonly z: number } }[] = [
  { name: "pier tip", p: pier.tip },
  { name: "release point", p: pier.releasePoint },
  { name: "deck centre", p: pier.deckCenter },
  {
    name: "deck bank end",
    p: { x: 2 * pier.deckCenter.x - pier.tip.x, y: pier.tip.y, z: 2 * pier.deckCenter.z - pier.tip.z },
  },
  ...pier.piles.map((pile, i) => ({ name: `pile ${i}`, p: pile.position })),
  { name: "bank +0.5", p: splineProgressToWorld(channel, LOY_KRATHONG_PIER.progress, 0.5).position },
  { name: "bank -0.5", p: splineProgressToWorld(channel, LOY_KRATHONG_PIER.progress, -0.5).position },
];

describe("scene framing at any aspect ratio (MFW-54)", () => {
  it("keeps the pier and both banks inside the frustum for every size and pose", () => {
    expect(pier.piles.length).toBeGreaterThan(0);
    const ndc = new Vector3();
    for (const [w, h] of SIZES) {
      for (const pose of POSES) {
        const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
        camera.zoom = getFramedCameraZoom({ width: w, height: h });
        camera.position.set(...pose.camera);
        camera.lookAt(...pose.focus);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        for (const { name, p } of POINTS) {
          ndc.set(p.x, p.y, p.z).project(camera);
          const where = `${name} at ${w}×${h}, ${pose.name}`;
          expect(Math.abs(ndc.x), where).toBeLessThanOrEqual(1);
          expect(Math.abs(ndc.y), where).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("tap discs at the framed zoom (MFW-54 fix round; documented follow-up)", () => {
  // The MFW-59 proxies are sized in world units for MIN_TOUCH_TARGET_PX at SCENE_CAMERA_ZOOM. The framed zoom is at or above it from
  // a 374-px width, so the AC phones 390×844 and wider keep ≥ 44 px discs. Below that the disc shrinks with the zoom: 360×640 frames
  // at zoom ≈ 48.6 (7.4-wide frame since MFW-49) → ≈ 41.2 px. Scaling the proxies by SCENE_CAMERA_ZOOM / zoom is a follow-up (docs/follow-ups.md, MFW-54).
  const discPx = (zoom: number) => ({
    lamp: 2 * LAMP_TAP_RADIUS * TAP_PROXY_INRADIUS_RATIO * zoom,
    krathong: 2 * RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE * TAP_PROXY_INRADIUS_RATIO * zoom,
  });

  it("keeps ≥ MIN_TOUCH_TARGET_PX discs at 390×844, 844×390 and 1440×900", () => {
    for (const [w, h] of [[390, 844], [844, 390], [1440, 900]] as const) {
      const d = discPx(getFramedCameraZoom({ width: w, height: h }));
      expect(d.lamp).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX - 1e-9);
      expect(d.krathong).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX - 1e-9);
    }
  });

  it("documents the 360-px shortfall: discs scale with zoom / SCENE_CAMERA_ZOOM (≈ 41.2 px at 360×640)", () => {
    const zoom = getFramedCameraZoom({ width: 360, height: 640 });
    expect(zoom).toBeLessThan(SCENE_CAMERA_ZOOM);
    const d = discPx(zoom);
    const expectedMin = (MIN_TOUCH_TARGET_PX * zoom) / SCENE_CAMERA_ZOOM;
    expect(d.lamp).toBeCloseTo(expectedMin, 9);
    expect(d.lamp).toBeLessThan(MIN_TOUCH_TARGET_PX);
    expect(d.krathong).toBeGreaterThanOrEqual(expectedMin - 1e-9);
  });
});
