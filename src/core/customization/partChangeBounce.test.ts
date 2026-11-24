import { describe, expect, it, vi } from "vitest";
import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";
import { createPartChangeBounce } from "./partChangeBounce";

describe("part change bounce", () => {
  it("plays a non-immediate bounce from the pop scale back to rest", () => {
    const start = vi.fn();
    createPartChangeBounce({ start }, false).play();
    const { mass, tension, friction } = PART_CHANGE_BOUNCE.spring;
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      from: { scale: PART_CHANGE_BOUNCE.fromScale },
      to: { scale: PART_CHANGE_BOUNCE.restScale },
      immediate: false,
      config: { mass, tension, friction },
    });
  });

  it("reduced motion only snaps to rest", () => {
    const start = vi.fn();
    createPartChangeBounce({ start }, true).play();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toStrictEqual({ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true });
  });

  it.each([true, false])("settle snaps to rest (reducedMotion %s)", (reduced) => {
    const start = vi.fn();
    createPartChangeBounce({ start }, reduced).settle();
    expect(start.mock.calls[0][0]).toStrictEqual({ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true });
  });

  it("keeps the bounce gentle", () => {
    expect(PART_CHANGE_BOUNCE.restScale).toBe(1);
    expect(PART_CHANGE_BOUNCE.fromScale).toBeGreaterThan(0);
    expect(PART_CHANGE_BOUNCE.fromScale).toBeLessThan(1);
  });
});
