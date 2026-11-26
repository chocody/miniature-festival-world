// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera } from "three";
import { SCENE_CAMERA_FAR, SCENE_CAMERA_NEAR } from "@/config/camera.config";
import { PINCH_ZOOM_MAX, PINCH_ZOOM_MIN } from "@/config/interaction.config";
import { RIVER_STRETCH_RENDER_RADIUS, RIVER_STRETCH_SWITCH_HYSTERESIS } from "@/config/world.config";
import {
  getRiverSceneryTopY,
  LOY_KRATHONG_RIVER_LAYOUT,
  LOY_KRATHONG_STRETCH_EXTENT,
} from "@/components/models/loyKrathong/riverLayout";
import { getFramedCameraZoom } from "@/core/camera/viewportFraming";
import { CAMERA_FLIGHT_OFFSET } from "@/config/camera.config";
import { LOY_KRATHONG_RIVER_CHANNEL } from "@/config/events/loyKrathong.river.config";
import { frameToWorldInto } from "@/core/coordinates/endlessRiverFrame";
import {
  CAMERA_ELEVATION_SIN,
  CAMERA_ELEVATION_TAN,
  getLoyKrathongEndlessRiverFrame,
  isStretchInView,
  orthoViewAlongHalfExtent,
  orthoViewGroundRadius,
} from "./endlessRiver";

const frame = getLoyKrathongEndlessRiverFrame();

describe("endless river view culling (MFW-58)", () => {
  it("is one frame from the channel config (lazy singleton)", () => {
    expect(getLoyKrathongEndlessRiverFrame()).toBe(frame);
    expect(frame.periodX).toBe(LOY_KRATHONG_RIVER_CHANNEL.controlPoints[4].x - LOY_KRATHONG_RIVER_CHANNEL.controlPoints[0].x);
  });

  it("derives the camera elevation from CAMERA_FLIGHT_OFFSET", () => {
    const [x, y, z] = CAMERA_FLIGHT_OFFSET;
    expect(CAMERA_ELEVATION_SIN).toBeCloseTo(y / Math.hypot(x, y, z), 12);
    expect(CAMERA_ELEVATION_TAN).toBeCloseTo(y / Math.hypot(x, z), 12);
  });

  it("orthoViewGroundRadius on a known view", () => {
    // 20 × 13 view units at zoom 2 → half 5 × 3.25.
    const view = { left: -20, right: 20, top: 13, bottom: -13, zoom: 2 };
    expect(orthoViewGroundRadius(view, 0.5, 0.25, 1)).toBeCloseTo(Math.hypot(10, 6.5 / 0.5) / 1 + 4, 12);
    expect(orthoViewGroundRadius({ ...view, zoom: 1 }, 1, 1, 0)).toBeCloseTo(Math.hypot(20, 13), 12);
  });

  it("isStretchInView: inclusive interval overlap along the axis", () => {
    const extent = { min: -2, max: frame.length + 2 };
    const p = frameToWorldInto(frame, 0, 5, { x: 0, z: 0 }); // focus at along 0, off the axis
    expect(isStretchInView(frame, 0, extent, p.x, p.z, 1)).toBe(true);
    expect(isStretchInView(frame, -1, extent, p.x, p.z, 1)).toBe(true); // -L + L + 2 = 2 ≥ -1
    expect(isStretchInView(frame, 1, extent, p.x, p.z, 1)).toBe(false); // L − 2 > 1
    expect(isStretchInView(frame, 1, extent, p.x, p.z, frame.length - 2 + 1e-9)).toBe(true);
    expect(isStretchInView(frame, 2, extent, p.x, p.z, 10)).toBe(false);
    const far = frameToWorldInto(frame, 3 * frame.length + 0.5, 0, { x: 0, z: 0 });
    expect(isStretchInView(frame, 3, extent, far.x, far.z, 0)).toBe(true);
    expect(isStretchInView(frame, 0, extent, far.x, far.z, 0)).toBe(false);
  });
});

describe("3-slot sufficiency (MFW-58: S − 1 … S + 1 always covers the largest view)", () => {
  /** The sceneCoverage.test.ts sizes (MFW-68). */
  const SIZES = [
    [360, 640], [390, 844], [1440, 900], [844, 390], [640, 360], [1280, 720], [320, 568], [2560, 1080], [600, 800],
    [1024, 768], [3440, 1440], [360, 860], [1500, 300], [200, 800], [1600, 300], [7680, 4320], [412, 915], [411, 960],
  ] as const;
  const FACTORS = [PINCH_ZOOM_MIN, 1, PINCH_ZOOM_MAX];
  const h = RIVER_STRETCH_SWITCH_HYSTERESIS;
  const L = frame.length;
  const ext = LOY_KRATHONG_STRETCH_EXTENT;
  const heightSpan = getRiverSceneryTopY() - LOY_KRATHONG_RIVER_LAYOUT.ground.y;
  const camera = (w: number, hh: number, factor: number) => {
    const c = new OrthographicCamera(-w / 2, w / 2, hh / 2, -hh / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
    c.zoom = getFramedCameraZoom({ width: w, height: hh }) * factor;
    return c;
  };
  /** Focus along over the camera's stretch 0 with hysteresis: [−h, L + h], 17 samples. */
  const ALONG = Array.from({ length: 17 }, (_, i) => -h + ((L + 2 * h) * i) / 16);
  const covered = (radius: number) => {
    const misses: string[] = [];
    for (const [w, hh] of SIZES) {
      for (const factor of FACTORS) {
        const R = orthoViewGroundRadius(camera(w, hh, factor), CAMERA_ELEVATION_SIN, CAMERA_ELEVATION_TAN, heightSpan);
        for (const a of ALONG) {
          const lo = -radius * L + ext.min;
          const hi = (radius + 1) * L + ext.max;
          if (a - R < lo || a + R > hi) misses.push(`${w}×${hh} ×${factor} along ${a.toFixed(2)} R ${R.toFixed(2)}`);
        }
      }
    }
    return misses;
  };

  it("the extent covers the stretch (it reaches past both seams) and is finite", () => {
    expect(ext.min).toBeLessThan(0);
    expect(ext.max).toBeGreaterThan(L);
    expect(Number.isFinite(ext.min) && Number.isFinite(ext.max)).toBe(true);
  });

  it("every size × pinch, focus anywhere in the stretch ± h: the view lies within stretches −1 … +1", () => {
    expect(covered(RIVER_STRETCH_RENDER_RADIUS)).toEqual([]);
  });

  it("negative control: render radius 0 does not cover", () => {
    expect(covered(0).length).toBeGreaterThan(0);
  });
});

describe("orthoViewAlongHalfExtent (MFW-58 culling, yaw-aware)", () => {
  it("bounds the along coordinate of every view-corner ray at the ground and at the scenery top, and stays ≤ the radius", async () => {
    const { applyCameraRigPose, createCameraRigState } = await import("@/core/camera");
    const { Vector3 } = await import("three");
    const { alongOf } = await import("@/core/coordinates/endlessRiverFrame");
    const groundY = LOY_KRATHONG_RIVER_LAYOUT.ground.y;
    const topY = getRiverSceneryTopY();
    const span = topY - groundY;
    for (const [w, hh] of [[360, 640], [1440, 900], [3440, 1440]] as const) {
      const c = new OrthographicCamera(-w / 2, w / 2, hh / 2, -hh / 2, SCENE_CAMERA_NEAR, SCENE_CAMERA_FAR);
      c.zoom = getFramedCameraZoom({ width: w, height: hh }) * PINCH_ZOOM_MIN;
      c.updateProjectionMatrix();
      for (let k = 0; k < 16; k++) {
        const rig = createCameraRigState();
        rig.yawRad = (k * 2 * Math.PI) / 16;
        rig.focusX = 3;
        rig.focusZ = -1;
        applyCameraRigPose(rig, c);
        const half = orthoViewAlongHalfExtent(c, rig.yawRad, frame, span);
        expect(half).toBeLessThanOrEqual(orthoViewGroundRadius(c, CAMERA_ELEVATION_SIN, CAMERA_ELEVATION_TAN, span) + 1e-9);
        const a0 = alongOf(frame, rig.focusX, rig.focusZ);
        for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const near = new Vector3(x, y, -1).unproject(c);
          const far = new Vector3(x, y, 1).unproject(c);
          const dir = far.clone().sub(near).normalize();
          for (const planeY of [groundY, topY]) {
            const t = (planeY - near.y) / dir.y;
            const hit = near.clone().addScaledVector(dir, t);
            expect(Math.abs(alongOf(frame, hit.x, hit.z) - a0)).toBeLessThanOrEqual(half + 1e-6);
          }
        }
      }
    }
  });
});
