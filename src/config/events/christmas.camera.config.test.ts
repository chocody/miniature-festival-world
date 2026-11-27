// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CHRISTMAS_CAMERA_ELEVATION_DEG,
  CHRISTMAS_FRAME_VIEW_SIZE,
  CHRISTMAS_TAP_VIEW_HALF_ANGLE_DEG,
} from "./christmas.camera.config";

describe("Christmas camera framing (MFW-93, DRAFT)", () => {
  it("CC1 values are in range and the frame is frozen", () => {
    for (const v of [CHRISTMAS_FRAME_VIEW_SIZE.width, CHRISTMAS_FRAME_VIEW_SIZE.height]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(CHRISTMAS_CAMERA_ELEVATION_DEG).toBeGreaterThan(0);
    expect(CHRISTMAS_CAMERA_ELEVATION_DEG).toBeLessThan(90);
    expect(CHRISTMAS_TAP_VIEW_HALF_ANGLE_DEG).toBeGreaterThan(0);
    expect(CHRISTMAS_TAP_VIEW_HALF_ANGLE_DEG).toBeLessThanOrEqual(90);
    expect(Object.isFrozen(CHRISTMAS_FRAME_VIEW_SIZE)).toBe(true);
  });
});
