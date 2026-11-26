// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_LATHE_SILHOUETTE_SEGMENTS } from "@/config/fallback2d.config";
import { FLOWER_KINDS, LEAF_FOLD_STYLE_IDS } from "@/config/events/loyKrathong.config";
import { KRATHONG_LEAF_MODELS, KRATHONG_LODS, type KrathongMeshSpec } from "@/config/krathongModel.config";
import { KRATHONG_GEOMETRY_KEYS, meshSpecFor } from "@/core/customization/krathongAssetKeys";
import { buildKrathongMeshData, meshMaxRadiusXZ } from "@/core/customization/krathongMeshData";
import type { KrathongGeometryKey } from "@/core/customization/types";
import { buildKrathongOutlineData, krathongOutlineDataFor } from "./krathongOutlines";

const hasLathe = (spec: KrathongMeshSpec): boolean =>
  spec.kind === "lathe" || (spec.kind === "group" && spec.children.some(hasLathe));
const maxRadiusXZ = (positions: Float32Array, indices: readonly number[]) =>
  Math.max(...indices.map((i) => Math.hypot(positions[3 * i], positions[3 * i + 2])));

describe("krathongOutlines (MFW-51): 2D outlines from the 3D mesh builders", () => {
  it("T16 the 2D reads the 3D vertices (every key × LOD without a lathe)", () => {
    let checked = 0;
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      for (const lod of KRATHONG_LODS) {
        const spec = meshSpecFor(key, lod);
        if (hasLathe(spec)) continue;
        const expected = buildKrathongMeshData(spec).positions;
        const actual = krathongOutlineDataFor(key, lod).positions;
        expect(actual.length, `${key}@${lod}`).toBe(expected.length);
        for (let i = 0; i < expected.length; i++) {
          if (actual[i] !== expected[i]) expect.fail(`${key}@${lod} differs at ${i}`);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(LEAF_FOLD_STYLE_IDS.length * KRATHONG_LODS.length);
  });

  it.each(LEAF_FOLD_STYLE_IDS)("T17 leaf %s: two blades per unit with the shell's rows", (style) => {
    for (const lod of KRATHONG_LODS) {
      const spec = meshSpecFor(`leaf:${style}`, lod);
      expect(spec.kind).toBe("group");
      if (spec.kind !== "group") return;
      const shapes = krathongOutlineDataFor(`leaf:${style}`, lod).shapes;
      expect(shapes).toHaveLength(2);
      shapes.forEach((s, i) => {
        const child = spec.children[i];
        expect(s.kind).toBe("blade");
        if (s.kind !== "blade" || child.kind !== "leafShell") throw new Error("expected leaf shells");
        const rows = child.shell.rows;
        expect(s.outline).toHaveLength(2 * rows + 2);
        expect(s.tipAt).toBe(rows + 1);
        expect(s.vein).toHaveLength(rows + 2);
      });
    }
    expect(KRATHONG_LEAF_MODELS[style].mesh.kind).toBe("group");
  });

  it("T18 flowers: petal blades at full, one lobed disc at medium / low", () => {
    const full = { marigold: 12, orchid: 6, lotus: 10 } as const;
    for (const kind of FLOWER_KINDS) {
      const shapes = krathongOutlineDataFor(`flower:${kind}`, "full").shapes;
      expect(shapes, kind).toHaveLength(full[kind]);
      expect(shapes.every((s) => s.kind === "blade")).toBe(true);
      for (const lod of ["medium", "low"] as const) {
        const light = krathongOutlineDataFor(`flower:${kind}`, lod).shapes;
        expect(light).toHaveLength(1);
        expect(light[0].kind).toBe("disc");
      }
    }
  });

  it("T19 single-lathe parts: the dense silhouette keeps the 3D radius, and has a cap", () => {
    let checked = 0;
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      for (const lod of KRATHONG_LODS) {
        const spec = meshSpecFor(key, lod);
        if (spec.kind !== "lathe") continue;
        const data = buildKrathongOutlineData(spec);
        expect(data.shapes).toHaveLength(1);
        const hull = data.shapes[0];
        if (hull.kind !== "hull") throw new Error("expected a hull");
        expect(hull.vertices.length).toBe(data.positions.length / 3);
        expect(hull.cap).not.toBeNull();
        expect(hull.cap).toHaveLength(FLAT_LATHE_SILHOUETTE_SEGMENTS);
        const r2d = maxRadiusXZ(data.positions, hull.vertices);
        const r3d = meshMaxRadiusXZ(buildKrathongMeshData(spec));
        const c = Math.cos(Math.PI / spec.segments);
        expect(r2d, `${key}@${lod}`).toBeGreaterThanOrEqual(r3d * c - 1e-6);
        expect(r2d, `${key}@${lod}`).toBeLessThanOrEqual(r3d / c + 1e-6);
        checked++;
      }
    }
    // banana / bread bases (3 LODs each), candle low, flame (3), incense (3).
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("T20 cached per key and LOD; an unknown key throws", () => {
    expect(krathongOutlineDataFor("candle", "full")).toBe(krathongOutlineDataFor("candle", "full"));
    expect(krathongOutlineDataFor("candle", "full")).not.toBe(krathongOutlineDataFor("candle", "low"));
    expect(() => krathongOutlineDataFor("nope" as KrathongGeometryKey, "full")).toThrow();
  });
});
