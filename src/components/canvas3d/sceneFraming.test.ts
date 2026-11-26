// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { CAMERA_FLIGHT_OFFSET, SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR } from "@/config/camera.config";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { LAMP_TAP_RADIUS, RIVER_KRATHONG_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { LOY_KRATHONG_PIER } from "@/config/events/loyKrathong.river.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { getCameraFlightPose, getFramedCameraZoom } from "@/core/camera";
import { locateOnLane, splineProgressToWorld } from "@/core/coordinates";
import { getLoyKrathongRitualSite } from "./ritualSite";

/**
 * Backlog 10.2 AC3 (MFW-54) and 13.4 AC3 (MFW-68): the framed zoom keeps the pier and both banks at the pier in the ritual / world
 * view at any aspect ratio inside the SCENE_MAX_VIEW_SIZE envelope; CUSTOMIZE keeps the krathong and the water at it.
 */
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
] as const;
/** Aspect ratios the SCENE_MAX_VIEW_SIZE floor crops (the frame is no longer fully contained). */
const OUT_OF_ENVELOPE = [
  [200, 800],
  [1600, 300],
] as const;

interface Pose {
  readonly name: string;
  readonly camera: readonly [number, number, number];
  readonly focus: readonly [number, number, number];
}
interface NamedPoint {
  readonly name: string;
  readonly p: { readonly x: number; readonly y: number; readonly z: number };
}

const ritualPose = getCameraFlightPose(getLoyKrathongRitualSite().tip);
const RITUAL_POSE: Pose = {
  name: "ritual/world",
  camera: [ritualPose.cameraX, ritualPose.cameraY, ritualPose.cameraZ],
  focus: [ritualPose.focusX, ritualPose.focusY, ritualPose.focusZ],
};
const CUSTOMIZE_POSE: Pose = { name: "default (CUSTOMIZE)", camera: CAMERA_FLIGHT_OFFSET, focus: [0, 0, 0] };

const { pier, channel } = LOY_KRATHONG_RIVER_LAYOUT;
const PIER_POINTS: readonly NamedPoint[] = [
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
const originProgress = locateOnLane(channel, { x: 0, z: 0 }).progress;
const CUSTOMIZE_POINTS: readonly NamedPoint[] = [
  { name: "krathong (origin)", p: { x: 0, y: 0, z: 0 } },
  { name: "water +0.5", p: splineProgressToWorld(channel, originProgress, 0.5).position },
  { name: "water -0.5", p: splineProgressToWorld(channel, originProgress, -0.5).position },
];

function missesInFrame(sizes: readonly (readonly [number, number])[], pose: Pose, points: readonly NamedPoint[]): string[] {
  const misses: string[] = [];
  const ndc = new Vector3();
  for (const [w, h] of sizes) {
    const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
    camera.zoom = getFramedCameraZoom({ width: w, height: h });
    camera.position.set(...pose.camera);
    camera.lookAt(...pose.focus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const { name, p } of points) {
      ndc.set(p.x, p.y, p.z).project(camera);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) misses.push(`${name} at ${w}×${h}, ${pose.name}: ndc ${ndc.x}, ${ndc.y}`);
    }
  }
  return misses;
}

describe("scene framing at any aspect ratio (MFW-54, MFW-68)", () => {
  it("ritual / world view keeps the pier and both banks in frame at every size", () => {
    expect(pier.piles.length).toBeGreaterThan(0);
    expect(missesInFrame(SIZES, RITUAL_POSE, PIER_POINTS)).toEqual([]);
  });

  it("CUSTOMIZE view keeps the krathong and the water at it in frame", () => {
    expect(missesInFrame(SIZES, CUSTOMIZE_POSE, CUSTOMIZE_POINTS)).toEqual([]);
  });

  it("the pier tip and release point stay in frame outside the envelope", () => {
    const points = PIER_POINTS.filter((pt) => pt.name === "pier tip" || pt.name === "release point");
    expect(points).toHaveLength(2);
    expect(missesInFrame(OUT_OF_ENVELOPE, RITUAL_POSE, points)).toEqual([]);
  });
});

describe("tap discs at the framed zoom (MFW-54, MFW-68)", () => {
  const discPx = (zoom: number) => ({
    lamp: 2 * LAMP_TAP_RADIUS * TAP_PROXY_INRADIUS_RATIO * zoom,
    krathong: 2 * RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE * TAP_PROXY_INRADIUS_RATIO * zoom,
  });

  it("tap discs ≥ MIN_TOUCH_TARGET_PX at the framed zoom, 360 px wide included (MFW-68 AC3)", () => {
    for (const [w, h] of [[320, 568], [360, 640], [390, 844], [844, 390], [1440, 900]] as const) {
      const d = discPx(getFramedCameraZoom({ width: w, height: h }));
      expect(d.lamp, `lamp at ${w}×${h}`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX - 1e-9);
      expect(d.krathong, `krathong at ${w}×${h}`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX - 1e-9);
    }
  });
});
