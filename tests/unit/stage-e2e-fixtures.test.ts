// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_CAMERA_ZOOM, SCENE_CAMERA_ZOOM_MAX, SCENE_FRAME_VIEW_SIZE, SCENE_MAX_VIEW_SIZE } from "@/config/camera.config";
import { PINCH_ZOOM_MIN } from "@/config/interaction.config";
import { LIGHT_PRESETS, LIGHT_PRESET_STORAGE_KEY } from "@/config/look.config";
import { TIER_MAX_RENDER_PIXELS } from "@/config/performance.config";
import { getFramedCameraZoom } from "@/core/camera";
import {
  E2E_LIGHT_PRESET_STORAGE_KEY,
  E2E_LOW_MAX_RENDER_PIXELS,
  E2E_PINCH_ZOOM_MIN,
  E2E_PROBED_CAMERA_ZOOM,
  E2E_SCENE_BACKGROUNDS,
  E2E_SCENE_CAMERA_ZOOM_MAX,
  E2E_SCENE_FRAME_VIEW_SIZE,
  E2E_SCENE_MAX_VIEW_SIZE,
  E2E_STAGE_VIEWPORTS,
  coverageSamplePoints,
  e2eFramedZoom,
  isBackgroundPixel,
} from "../e2e/fixtures/stageFixtures";

describe("full-screen stage e2e fixtures (MFW-54)", () => {
  it("duplicate the config constants", () => {
    expect(E2E_PROBED_CAMERA_ZOOM).toBe(SCENE_CAMERA_ZOOM);
    expect(E2E_SCENE_FRAME_VIEW_SIZE).toEqual(SCENE_FRAME_VIEW_SIZE);
    expect(E2E_SCENE_CAMERA_ZOOM_MAX).toBe(SCENE_CAMERA_ZOOM_MAX);
    expect(E2E_SCENE_MAX_VIEW_SIZE).toEqual(SCENE_MAX_VIEW_SIZE);
    expect(E2E_PINCH_ZOOM_MIN).toBe(PINCH_ZOOM_MIN);
    expect(E2E_LIGHT_PRESET_STORAGE_KEY).toBe(LIGHT_PRESET_STORAGE_KEY);
    expect(E2E_SCENE_BACKGROUNDS.DAY.toLowerCase()).toBe(LIGHT_PRESETS.DAY.background.toLowerCase());
    expect(E2E_SCENE_BACKGROUNDS.NIGHT.toLowerCase()).toBe(LIGHT_PRESETS.NIGHT.background.toLowerCase());
    expect(E2E_LOW_MAX_RENDER_PIXELS).toBe(TIER_MAX_RENDER_PIXELS.LOW);
  });

  it("e2eFramedZoom mirrors getFramedCameraZoom", () => {
    const sizes = [...E2E_STAGE_VIEWPORTS.flatMap((v) => [[v.width, v.height], [v.height, v.width]]),
      [600, 800],
      [3440, 1440],
      [200, 800],
      [1600, 300],
      [7680, 4320],
    ];
    for (const [width, height] of sizes) {
      expect(e2eFramedZoom(width, height)).toBe(getFramedCameraZoom({ width, height }));
    }
  });

  it("isBackgroundPixel", () => {
    expect(isBackgroundPixel([216, 228, 207], "#D8E4CF")).toBe(true);
    expect(isBackgroundPixel([218, 226, 209], "#D8E4CF")).toBe(true);
    expect(isBackgroundPixel([219, 228, 207], "#D8E4CF")).toBe(false);
    expect(isBackgroundPixel([165, 180, 135], "#D8E4CF")).toBe(false);
    expect(isBackgroundPixel([46, 62, 99], "#2E3E63")).toBe(true);
    expect(isBackgroundPixel([46, 62, 99], "#D8E4CF")).toBe(false);
    expect(() => isBackgroundPixel([216, 228, 207], "D8E4CF")).toThrow(RangeError);
  });

  it("coverageSamplePoints", () => {
    expect(coverageSamplePoints(360, 640)).toEqual([
      { name: "top-left", x: 2, y: 2 },
      { name: "top-right", x: 357, y: 2 },
      { name: "bottom-left", x: 2, y: 637 },
      { name: "bottom-right", x: 357, y: 637 },
      { name: "centre", x: 180, y: 320 },
    ]);
  });
});
