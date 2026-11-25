// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CAMERA_FLIGHT_OFFSET,
  SCENE_CAMERA_ZOOM_MAX,
  SCENE_FRAME_VIEW_SIZE,
  SCENE_MAX_VIEW_SIZE,
} from "@/config/camera.config";

describe("framing constants (MFW-68)", () => {
  it("keeps the MFW-15 viewing angle at the doubled distance", () => {
    const [x, y, z] = CAMERA_FLIGHT_OFFSET;
    expect(Math.atan2(x, z)).toBeCloseTo(Math.atan2(4.5, 7), 12);
    expect(Math.atan2(y, Math.hypot(x, z))).toBeCloseTo(Math.atan2(5.5, Math.hypot(4.5, 7)), 12);
  });
  it("bounds the view beyond the frame and caps the zoom at 143", () => {
    expect(SCENE_MAX_VIEW_SIZE.width).toBeGreaterThan(SCENE_FRAME_VIEW_SIZE.width);
    expect(SCENE_MAX_VIEW_SIZE.height).toBeGreaterThan(SCENE_FRAME_VIEW_SIZE.height);
    expect(SCENE_CAMERA_ZOOM_MAX).toBe(143);
  });
});
