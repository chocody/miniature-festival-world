import { describe, expect, it } from "vitest";
import { WISH_BUBBLE_COPY, WISH_BUBBLE_LIFT_WORLD, WISH_BUBBLE_MIN_MOVE_PX, WISH_BUBBLE_TIMING } from "./inspect.config";

describe("wish bubble config (MFW-80)", () => {
  it("C1: timing is frozen and positive; lift and move threshold are positive", () => {
    expect(Object.isFrozen(WISH_BUBBLE_TIMING)).toBe(true);
    expect(WISH_BUBBLE_TIMING.visibleMs).toBeGreaterThan(0);
    expect(WISH_BUBBLE_TIMING.fadeMs).toBeGreaterThan(0);
    expect(WISH_BUBBLE_LIFT_WORLD).toBeGreaterThan(0);
    expect(WISH_BUBBLE_MIN_MOVE_PX).toBeGreaterThan(0);
    expect(WISH_BUBBLE_COPY.label).not.toBe("");
  });
});
