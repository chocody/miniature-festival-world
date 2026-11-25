// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { RIVER_ENVIRONMENT_PARTS, RIVER_FOLIAGE_PARTS } from "@/config/events/loyKrathong.river.config";
import { ENVIRONMENT_PART_MAX_TRIANGLES, type PartGeometrySpec } from "@/config/scene.config";
import { bladeTuftExtent } from "@/core/world";
import { createBladeTuftGeometry, createLeafClumpGeometry, createTrunkGeometry } from "./foliageGeometry";
import { countTriangles, createInstancedPartGeometry, createPartGeometry } from "./geometry";

type Kind<K extends PartGeometrySpec["kind"]> = Extract<PartGeometrySpec, { kind: K }>;
function as<K extends PartGeometrySpec["kind"]>(g: PartGeometrySpec, kind: K): Kind<K> {
  if (g.kind !== kind) throw new Error(`expected ${kind}, got ${g.kind}`);
  return g as Kind<K>;
}
const attributeKeys = (g: BufferGeometry) => Object.keys(g.attributes).sort();
const verts = (g: BufferGeometry) => g.getAttribute("position").count;
function points(g: BufferGeometry): [number, number, number][] {
  const p = g.getAttribute("position");
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
}

describe("leaf clump geometry (MFW-70)", () => {
  const full = as(RIVER_FOLIAGE_PARTS.FULL.leafClump.geometry, "leafClump");
  const light = as(RIVER_FOLIAGE_PARTS.LIGHT.leafClump.geometry, "leafClump");

  it("G1: indexed, welded, lumpy within ±A, smooth radial normals, deterministic", () => {
    expect(RIVER_ENVIRONMENT_PARTS.leafClump.geometry).toBe(full);
    for (const spec of [full, light]) {
      const g = createLeafClumpGeometry(spec);
      expect(g.index).not.toBeNull();
      expect(attributeKeys(g)).toEqual(["normal", "position"]);
      const A = spec.lumpAmplitude;
      const radii = points(g).map(([x, y, z]) => Math.hypot(x, y, z));
      for (const r of radii) {
        expect(r).toBeGreaterThanOrEqual(1 - A - 1e-6);
        expect(r).toBeLessThanOrEqual(1 + A + 1e-6);
      }
      expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThanOrEqual(A); // lumpy
      const n = g.getAttribute("normal");
      points(g).forEach(([x, y, z], i) => {
        const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        expect(len).toBeCloseTo(1, 5);
        const r = Math.hypot(x, y, z);
        expect((n.getX(i) * x + n.getY(i) * y + n.getZ(i) * z) / r).toBeGreaterThan(0.7);
      });
      expect(points(createLeafClumpGeometry(spec))).toEqual(points(g));
    }
  });

  it("G1: detail 0 = 12 vertices / 20 triangles (LOW), detail 1 = 42 / 80 (HIGH, MEDIUM)", () => {
    const d0 = createLeafClumpGeometry({ ...full, detail: 0 });
    expect(verts(d0)).toBe(12);
    expect(countTriangles(d0)).toBe(20);
    const d1 = createLeafClumpGeometry({ ...full, detail: 1 });
    expect(verts(d1)).toBe(42);
    expect(countTriangles(d1)).toBe(80);
    expect(full.detail).toBe(1);
    expect(light.detail).toBe(0);
  });
});

describe("trunk geometry (MFW-70)", () => {
  it("G2: FULL 28 / LIGHT 14 triangles, tapered and bent, above the ground, position + normal only", () => {
    const cases = [
      [as(RIVER_FOLIAGE_PARTS.FULL.treeTrunk.geometry, "trunk"), 28, 38],
      [as(RIVER_FOLIAGE_PARTS.LIGHT.treeTrunk.geometry, "trunk"), 14, 22],
    ] as const;
    for (const [spec, triangles, vertices] of cases) {
      const g = createTrunkGeometry(spec);
      expect(countTriangles(g)).toBe(triangles);
      expect(verts(g)).toBe(vertices);
      expect(attributeKeys(g)).toEqual(["normal", "position"]);
      const p = points(g);
      for (const [, y] of p) expect(y).toBeGreaterThanOrEqual(-1e-6);
      // The main cylinder comes first: its top row is the first radialSegments + 1 vertices.
      const topRing = p.slice(0, spec.radialSegments + 1);
      const baseRing = p.filter(([, y]) => Math.abs(y) < 1e-6);
      expect(baseRing.length).toBeGreaterThan(0);
      for (const [x, , z] of baseRing) expect(Math.hypot(x, z)).toBeCloseTo(spec.radiusBottom, 6);
      for (const [x, y, z] of topRing) {
        expect(y).toBeCloseTo(spec.height, 6);
        expect(Math.hypot(x - spec.bend, z)).toBeCloseTo(spec.radiusTop, 6);
      }
      expect(spec.bend).toBeGreaterThan(0);
      expect(Math.max(...topRing.map(([x]) => x))).toBeGreaterThan(Math.max(...baseRing.map(([x]) => x)));
    }
  });

  it("a trunk without branches is the main cylinder only", () => {
    const spec = as(RIVER_FOLIAGE_PARTS.FULL.treeTrunk.geometry, "trunk");
    const g = createTrunkGeometry({ ...spec, branches: [] });
    expect(countTriangles(g)).toBe(spec.radialSegments * spec.heightSegments * 2);
  });
});

describe("blade tuft geometry (MFW-70)", () => {
  it("G3: FULL 18 / LIGHT 9 triangles, inside the tuft extent", () => {
    const cases = [
      [as(RIVER_FOLIAGE_PARTS.FULL.riversidePlant.geometry, "bladeTuft"), 18, 48],
      [as(RIVER_FOLIAGE_PARTS.LIGHT.riversidePlant.geometry, "bladeTuft"), 9, 24],
    ] as const;
    for (const [spec, triangles, vertices] of cases) {
      const g = createBladeTuftGeometry(spec);
      expect(countTriangles(g)).toBe(triangles);
      expect(verts(g)).toBe(vertices);
      expect(attributeKeys(g)).toEqual(["normal", "position"]);
      const extent = bladeTuftExtent(spec.blades);
      const maxWidth = Math.max(...spec.blades.map((b) => b.width));
      for (const [x, y, z] of points(g)) {
        expect(Math.hypot(x, z)).toBeLessThanOrEqual(extent.footprintRadius + 1e-6);
        expect(y).toBeLessThanOrEqual(extent.topY + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-maxWidth / 2);
      }
    }
  });

  it("throws on an empty blade list", () => {
    expect(() => createBladeTuftGeometry({ kind: "bladeTuft", blades: [], thicknessRatio: 0.4 })).toThrow(RangeError);
  });
});

describe("foliage parts dispatch and program safety (MFW-70)", () => {
  const variants = [RIVER_FOLIAGE_PARTS.FULL, RIVER_FOLIAGE_PARTS.LIGHT] as const;

  it("G4: createPartGeometry dispatches the three kinds; instancing keeps the triangles; no extra attributes", () => {
    for (const parts of variants) {
      for (const part of Object.values(parts)) {
        const g = createPartGeometry(part.geometry);
        const instanced = createInstancedPartGeometry(part.geometry, false);
        expect(countTriangles(instanced)).toBe(countTriangles(g));
        for (const geometry of [g, instanced]) {
          for (const key of ["uv", "uv1", "color", "tangent"]) expect(geometry.getAttribute(key), key).toBeUndefined();
        }
      }
    }
    expect(createPartGeometry(RIVER_FOLIAGE_PARTS.FULL.leafClump.geometry).index).not.toBeNull();
    expect(new Set(variants.flatMap((v) => Object.values(v).map((p) => p.geometry.kind)))).toEqual(
      new Set(["leafClump", "trunk", "bladeTuft"]),
    );
  });

  it("G5: every foliage part is low-poly and LIGHT is never heavier than FULL", () => {
    for (const key of ["treeTrunk", "leafClump", "riversidePlant"] as const) {
      const full = countTriangles(createPartGeometry(RIVER_FOLIAGE_PARTS.FULL[key].geometry));
      const light = countTriangles(createPartGeometry(RIVER_FOLIAGE_PARTS.LIGHT[key].geometry));
      expect(full, key).toBeLessThanOrEqual(ENVIRONMENT_PART_MAX_TRIANGLES);
      expect(light, key).toBeLessThanOrEqual(full);
    }
  });
});
