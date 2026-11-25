// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CAMERA_FLIGHT_OFFSET,
  HIGHLIGHT_RING_SIZES,
  SCENE_CAMERA_ZOOM_MAX,
  SCENE_FRAME_VIEW_SIZE,
  SCENE_MAX_VIEW_SIZE,
} from "@/config/camera.config";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";

describe("HIGHLIGHT_RING_SIZES", () => {
  it("the river krathong ring clears the krathong footprint", () => {
    const ring = HIGHLIGHT_RING_SIZES.riverKrathong;
    expect(ring.innerRadius).toBeGreaterThan(RIVER_COLLISION_RADIUS);
    expect(ring.outerRadius).toBeGreaterThan(ring.innerRadius);
    expect(ring.heightOffset).toBeGreaterThan(0);
  });
  it("keeps the MFW-17 sizes", () => {
    expect(HIGHLIGHT_RING_SIZES.water).toEqual({ innerRadius: 0.42, outerRadius: 0.56, heightOffset: 0.04 });
    expect(HIGHLIGHT_RING_SIZES.krathong).toEqual({ innerRadius: 1.35, outerRadius: 1.55, heightOffset: 0.26 });
    expect(HIGHLIGHT_RING_SIZES.lamp).toEqual({ innerRadius: 0.28, outerRadius: 0.42, heightOffset: 0.04 });
  });
});

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
