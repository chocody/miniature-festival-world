// @vitest-environment node
import { BufferGeometry, IcosahedronGeometry, Material, MeshBasicMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RIVER_KRATHONG_TAP_RADIUS } from "@/config/gimmicks.config";
import { createRiverTapProxy } from "./riverTapProxy";

afterEach(() => vi.restoreAllMocks());

describe("createRiverTapProxy", () => {
  it("builds a shared icosahedron at the tap radius", () => {
    const p = createRiverTapProxy();
    expect(p.geometry).toBeInstanceOf(IcosahedronGeometry);
    expect((p.geometry as IcosahedronGeometry).parameters.radius).toBe(RIVER_KRATHONG_TAP_RADIUS);
    expect(p.material).toBeInstanceOf(MeshBasicMaterial);
  });
  it("disposes geometry and material", () => {
    const g = vi.spyOn(BufferGeometry.prototype, "dispose");
    const m = vi.spyOn(Material.prototype, "dispose");
    createRiverTapProxy().dispose();
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
  });
});
