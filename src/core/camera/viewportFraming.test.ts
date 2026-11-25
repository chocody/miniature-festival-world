import { describe, expect, it } from "vitest";
import { SCENE_CAMERA_ZOOM, SCENE_CAMERA_ZOOM_MAX, SCENE_FRAME_VIEW_SIZE } from "@/config/camera.config";
import { getFramedCameraZoom } from "./viewportFraming";

describe("getFramedCameraZoom (MFW-54, backlog 10.2 AC3)", () => {
  it("contains the frame rectangle at the AC viewports and their rotations", () => {
    expect(getFramedCameraZoom({ width: 360, height: 640 })).toBeCloseTo(360 / SCENE_FRAME_VIEW_SIZE.width, 9);
    expect(getFramedCameraZoom({ width: 360, height: 640 })).toBeCloseTo(48.648648648648, 9); // 360 / 7.4 (MFW-49 wider frame; was 50)
    expect(getFramedCameraZoom({ width: 390, height: 844 })).toBeCloseTo(390 / SCENE_FRAME_VIEW_SIZE.width, 9);
    expect(getFramedCameraZoom({ width: 844, height: 390 })).toBeCloseTo(390 / SCENE_FRAME_VIEW_SIZE.height, 9);
    expect(getFramedCameraZoom({ width: 1440, height: 900 })).toBeCloseTo(SCENE_CAMERA_ZOOM_MAX, 9);
    expect(getFramedCameraZoom({ width: 1440, height: 900 })).toBeCloseTo(104, 9);
    expect(getFramedCameraZoom({ width: 600, height: 800 })).toBeCloseTo(600 / SCENE_FRAME_VIEW_SIZE.width, 9);
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

  it("always keeps the whole frame visible and never exceeds the cap", () => {
    const sides = [200, 320, 360, 390, 640, 844, 900, 1440, 2560];
    for (const w of sides) {
      for (const h of sides) {
        const zoom = getFramedCameraZoom({ width: w, height: h });
        expect(w / zoom).toBeGreaterThanOrEqual(SCENE_FRAME_VIEW_SIZE.width - 1e-9);
        expect(h / zoom).toBeGreaterThanOrEqual(SCENE_FRAME_VIEW_SIZE.height - 1e-9);
        expect(zoom).toBeLessThanOrEqual(SCENE_CAMERA_ZOOM_MAX);
      }
    }
  });
});
