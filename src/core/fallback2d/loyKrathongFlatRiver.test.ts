// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_RIVER_VIEW_HEIGHT_PX } from "@/config/fallback2d.config";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";

describe("getLoyKrathongFlatRiver at a stage height (MFW-54)", () => {
  it("the default height is the no-argument object", () => {
    expect(getLoyKrathongFlatRiver()).toBe(getLoyKrathongFlatRiver(FLAT_RIVER_VIEW_HEIGHT_PX));
  });

  it("the same (rounded) height returns the same object", () => {
    const a = getLoyKrathongFlatRiver(640);
    expect(getLoyKrathongFlatRiver(640)).toBe(a);
    expect(getLoyKrathongFlatRiver(640.4)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("every height shares the one lane set and scene (invariant B)", () => {
    const base = getLoyKrathongFlatRiver();
    const tall = getLoyKrathongFlatRiver(640);
    expect(tall.lanes).toBe(base.lanes);
    expect(tall.scene).toBe(base.scene);
  });

  it("the projection fits the requested height", () => {
    const { projection, scene } = getLoyKrathongFlatRiver(640);
    expect(projection.viewport.height).toBe(640);
    expect(projection.scale).toBeCloseTo(640 / (scene.bounds.maxZ - scene.bounds.minZ), 12);
  });

  it("an unusable height returns the default object", () => {
    const base = getLoyKrathongFlatRiver();
    for (const h of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) expect(getLoyKrathongFlatRiver(h)).toBe(base);
  });
});
