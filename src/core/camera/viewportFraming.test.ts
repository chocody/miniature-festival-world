import { describe, expect, it } from "vitest";
import { SCENE_CAMERA_ZOOM, SCENE_CAMERA_ZOOM_MAX, SCENE_FRAME_VIEW_SIZE, SCENE_MAX_VIEW_SIZE } from "@/config/camera.config";
import { getFramedCameraZoom } from "./viewportFraming";

/** MFW-49 framed zooms (frame 7.4 × 4.9, cap 104), kept as literals so the MFW-68 "closer" claim stays checkable. */
const MFW49_ZOOMS = [
  { width: 360, height: 640, zoom: 360 / 7.4 },
  { width: 390, height: 844, zoom: 390 / 7.4 },
  { width: 1440, height: 900, zoom: 104 },
] as const;
/** MFW-68 AC1: "closer by a clear margin". */
const MIN_CLOSER_RATIO = 1.3;

const SIDES = [200, 320, 360, 390, 640, 844, 900, 1440, 2560, 3440, 7680];
const GRID = SIDES.flatMap((w) => SIDES.map((h) => [w, h] as const));

describe("getFramedCameraZoom (MFW-54, MFW-68)", () => {
  it("frames the AC viewports closer than MFW-49", () => {
    const expected: readonly (readonly [number, number, number])[] = [
      [360, 640, 360 / 5.4],
      [390, 844, 390 / 5.4],
      [844, 390, 97.5],
      [1440, 900, 143],
      [600, 800, 600 / 5.4],
      [3440, 1440, 172],
      [200, 800, 800 / 13],
      [1600, 300, 80],
      [320, 568, 320 / 5.4],
    ];
    for (const [width, height, zoom] of expected) {
      expect(getFramedCameraZoom({ width, height }), `${width}×${height}`).toBeCloseTo(zoom, 9);
    }
    for (const { width, height, zoom } of MFW49_ZOOMS) {
      expect(getFramedCameraZoom({ width, height }), `${width}×${height}`).toBeGreaterThanOrEqual(MIN_CLOSER_RATIO * zoom);
    }
  });

  it("falls back to the base zoom when the size is unknown", () => {
    for (const size of [
      { width: 0, height: 0 },
      { width: Number.NaN, height: 640 },
      { width: 360, height: -1 },
      { width: Number.POSITIVE_INFINITY, height: 640 },
    ]) {
      expect(getFramedCameraZoom(size)).toBe(SCENE_CAMERA_ZOOM);
    }
  });

  it("never shows more than SCENE_MAX_VIEW_SIZE and never exceeds the cap unless the floor needs it", () => {
    for (const [w, h] of GRID) {
      const zoom = getFramedCameraZoom({ width: w, height: h });
      const where = `${w}×${h}`;
      expect(w / zoom, where).toBeLessThanOrEqual(SCENE_MAX_VIEW_SIZE.width + 1e-9);
      expect(h / zoom, where).toBeLessThanOrEqual(SCENE_MAX_VIEW_SIZE.height + 1e-9);
      expect(zoom, where).toBeLessThanOrEqual(
        Math.max(SCENE_CAMERA_ZOOM_MAX, w / SCENE_MAX_VIEW_SIZE.width, h / SCENE_MAX_VIEW_SIZE.height) + 1e-9,
      );
    }
  });

  it("keeps the whole frame visible inside the aspect envelope", () => {
    const inside = GRID.filter(
      ([w, h]) =>
        w / h >= SCENE_FRAME_VIEW_SIZE.width / SCENE_MAX_VIEW_SIZE.height &&
        w / h <= SCENE_MAX_VIEW_SIZE.width / SCENE_FRAME_VIEW_SIZE.height &&
        w <= SCENE_MAX_VIEW_SIZE.width * SCENE_CAMERA_ZOOM_MAX &&
        h <= SCENE_MAX_VIEW_SIZE.height * SCENE_CAMERA_ZOOM_MAX,
    );
    expect(inside.length).toBeGreaterThanOrEqual(20);
    for (const [w, h] of inside) {
      const zoom = getFramedCameraZoom({ width: w, height: h });
      expect(w / zoom, `${w}×${h}`).toBeGreaterThanOrEqual(SCENE_FRAME_VIEW_SIZE.width - 1e-9);
      expect(h / zoom, `${w}×${h}`).toBeGreaterThanOrEqual(SCENE_FRAME_VIEW_SIZE.height - 1e-9);
    }
  });
});
