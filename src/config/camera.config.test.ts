// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HIGHLIGHT_RING_SIZES } from "@/config/camera.config";
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
