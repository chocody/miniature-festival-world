// @vitest-environment node
import { BufferGeometry, IcosahedronGeometry, Material, MeshBasicMaterial, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAMP_TAP_RADIUS, RIVER_KRATHONG_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO } from "@/config/gimmicks.config";
import { createRiverTapProxy, createTapProxy } from "./riverTapProxy";

afterEach(() => vi.restoreAllMocks());

describe("createTapProxy", () => {
  it("the icosahedron's inscribed sphere has radius × TAP_PROXY_INRADIUS_RATIO", () => {
    const { geometry } = createTapProxy(1);
    const pos = geometry.getAttribute("position");
    let minDist = Infinity;
    for (let i = 0; i + 8 < pos.count * 3; i += 9) {
      const a = new Vector3(pos.array[i], pos.array[i + 1], pos.array[i + 2]);
      const b = new Vector3(pos.array[i + 3], pos.array[i + 4], pos.array[i + 5]);
      const c = new Vector3(pos.array[i + 6], pos.array[i + 7], pos.array[i + 8]);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      minDist = Math.min(minDist, Math.abs(normal.dot(a)));
    }
    expect(minDist).toBeCloseTo(TAP_PROXY_INRADIUS_RATIO, 6);
  });
  it("uses the given radius and disposes both resources", () => {
    const g = vi.spyOn(BufferGeometry.prototype, "dispose");
    const m = vi.spyOn(Material.prototype, "dispose");
    const p = createTapProxy(LAMP_TAP_RADIUS);
    expect((p.geometry as IcosahedronGeometry).parameters.radius).toBe(LAMP_TAP_RADIUS);
    p.dispose();
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
  });
});

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
