// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_CAMERA_ZOOM, SCENE_CAMERA_ZOOM_MAX, SCENE_FRAME_VIEW_SIZE } from "@/config/camera.config";
import { FLAT_RIVER_VIEW_HEIGHT_PX } from "@/config/fallback2d.config";
import { getFramedCameraZoom } from "@/core/camera";
import {
  E2E_FLAT_RIVER_PROBED_HEIGHT_PX,
  E2E_PROBED_CAMERA_ZOOM,
  E2E_SCENE_CAMERA_ZOOM_MAX,
  E2E_SCENE_FRAME_VIEW_SIZE,
  E2E_STAGE_VIEWPORTS,
  e2eFramedZoom,
} from "../e2e/fixtures/stageFixtures";

describe("full-screen stage e2e fixtures (MFW-54)", () => {
  it("duplicate the config constants", () => {
    expect(E2E_PROBED_CAMERA_ZOOM).toBe(SCENE_CAMERA_ZOOM);
    expect(E2E_SCENE_FRAME_VIEW_SIZE).toEqual(SCENE_FRAME_VIEW_SIZE);
    expect(E2E_SCENE_CAMERA_ZOOM_MAX).toBe(SCENE_CAMERA_ZOOM_MAX);
    expect(E2E_FLAT_RIVER_PROBED_HEIGHT_PX).toBe(FLAT_RIVER_VIEW_HEIGHT_PX);
  });

  it("e2eFramedZoom mirrors getFramedCameraZoom", () => {
    const sizes = [...E2E_STAGE_VIEWPORTS.flatMap((v) => [[v.width, v.height], [v.height, v.width]]), [600, 800]];
    for (const [width, height] of sizes) {
      expect(e2eFramedZoom(width, height)).toBe(getFramedCameraZoom({ width, height }));
    }
  });
});
