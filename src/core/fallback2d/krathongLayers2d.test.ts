// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_KRATHONG_VEIN, FLAT_KRATHONG_VIEW_AZIMUTH_RAD, FLAT_KRATHONG_VIEW_ELEVATION_RAD } from "@/config/fallback2d.config";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
} from "@/config/events/loyKrathong.config";
import {
  KRATHONG_FLAME_MODEL,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_COUNT,
  type KrathongLod,
} from "@/config/krathongModel.config";
import { LIGHT_PRESETS } from "@/config/look.config";
import { DEFAULT_KRATHONG_APPEARANCE, type KrathongAppearance } from "@/core/customization";
import type { KrathongPartRole } from "@/core/customization/types";
import { shadeHex } from "@/core/math/shadeHex";
import { flatSurfaceColor } from "./flatLight";
import {
  buildKrathongLayers2D,
  krathongAppearanceKey,
  projectModelPoint,
  type FlatKrathongView,
  type KrathongLayer2D,
} from "./krathongLayers2d";

const VIEW: FlatKrathongView = {
  azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  modelYawRad: 0,
};
const A = DEFAULT_KRATHONG_APPEARANCE;
const count = (layers: readonly { role: string }[], role: string) => layers.filter((l) => l.role === role).length;
const withAppearance = (patch: Partial<KrathongAppearance>): KrathongAppearance => ({ ...A, ...patch });
const shapesOf = (layers: readonly KrathongLayer2D[], role: KrathongPartRole) =>
  layers.filter((l) => l.role === role).map((l) => l.shapes.length);
const fills = (l: KrathongLayer2D) => l.shapes.map((s) => s.fill);
const allShapes = (layers: readonly KrathongLayer2D[]) => layers.flatMap((l) => l.shapes);

describe("buildKrathongLayers2D (MFW-51 outlines)", () => {
  const layers = buildKrathongLayers2D(A, VIEW);
  const low = buildKrathongLayers2D(A, VIEW, { lod: "low" });

  it("T21 one layer per MFW-19 part, unique ids, back to front", () => {
    for (const ls of [layers, low]) {
      expect(count(ls, "base")).toBe(1);
      expect(count(ls, "leaf")).toBe(KRATHONG_LEAF_COUNT);
      expect(count(ls, "flower")).toBe(A.flowers.filter((f) => f !== null).length);
      expect(count(ls, "candle")).toBe(1);
      expect(count(ls, "flame")).toBe(1);
      expect(count(ls, "incense")).toBe(KRATHONG_INCENSE_MODEL.count);
      expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
      for (let i = 1; i < ls.length; i++) expect(ls[i].depth).toBeGreaterThanOrEqual(ls[i - 1].depth);
    }
    expect(count(buildKrathongLayers2D(withAppearance({ flowers: A.flowers.map(() => null) }), VIEW), "flower")).toBe(0);
  });

  it("T22 every shape is a closed path with a #rrggbb fill", () => {
    for (const s of [...allShapes(layers), ...allShapes(low)]) {
      expect(s.d.startsWith("M")).toBe(true);
      expect(s.d.endsWith("Z")).toBe(true);
      expect(s.fill).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("T23 shape counts per part follow the 3D meshes", () => {
    const flowers = A.flowers.filter((f) => f !== null).length;
    expect(A.base).toBe("banana_trunk_01");
    expect(A.flowers.every((f) => f === null || f === "marigold")).toBe(true);
    expect(shapesOf(layers, "base")).toEqual([2]);
    expect(shapesOf(layers, "leaf")).toEqual(Array(KRATHONG_LEAF_COUNT).fill(2));
    expect(shapesOf(layers, "flower")).toEqual(Array(flowers).fill(12));
    expect(shapesOf(layers, "flowerCentre")).toEqual(Array(flowers).fill(1));
    expect(shapesOf(layers, "candle")).toEqual([4]);
    expect(shapesOf(layers, "flame")).toEqual([1]);
    expect(shapesOf(layers, "incense")).toEqual(Array(KRATHONG_INCENSE_MODEL.count).fill(1));
    expect(shapesOf(low, "base")).toEqual([2]);
    expect(shapesOf(low, "leaf")).toEqual(Array(KRATHONG_LEAF_COUNT).fill(2));
    expect(shapesOf(low, "flower")).toEqual(Array(flowers).fill(1));
    expect(shapesOf(low, "flowerCentre")).toEqual(Array(flowers).fill(1));
    expect(shapesOf(low, "candle")).toEqual([2]);
    expect(shapesOf(low, "flame")).toEqual([1]);
    expect(shapesOf(low, "incense")).toEqual(Array(KRATHONG_INCENSE_MODEL.count).fill(1));
    const lotus = withAppearance({ base: "lotus_petal_01" });
    expect(shapesOf(buildKrathongLayers2D(lotus, VIEW), "base")).toEqual([18]);
    expect(shapesOf(buildKrathongLayers2D(lotus, VIEW, { lod: "low" }), "base")).toEqual([3]);
    expect(shapesOf(buildKrathongLayers2D(withAppearance({ base: "toy_bread_01" }), VIEW), "base")).toEqual([2]);
    const all = (kind: "orchid" | "lotus") => withAppearance({ flowers: A.flowers.map((f) => (f === null ? null : kind)) });
    expect(shapesOf(buildKrathongLayers2D(all("orchid"), VIEW), "flower")).toEqual(Array(flowers).fill(6));
    expect(shapesOf(buildKrathongLayers2D(all("lotus"), VIEW), "flower")).toEqual(Array(flowers).fill(10));
  });

  it("T24 midrib veins on full-LOD leaves only", () => {
    for (const l of layers.filter((x) => x.role === "leaf")) {
      for (const s of l.shapes) {
        expect(s.vein).toMatch(/^M /);
        expect(s.veinStroke).toBe(shadeHex(s.fill, FLAT_KRATHONG_VEIN.shade));
      }
    }
    for (const s of allShapes(low)) {
      expect(s.vein).toBeUndefined();
      expect(s.veinStroke).toBeUndefined();
    }
  });

  it("T25 a colour change touches only its part's fills", () => {
    const diffRoles = (changed: readonly KrathongLayer2D[]) => [
      ...new Set(changed.filter((l) => fills(l).join() !== fills(layers.find((o) => o.id === l.id)!).join()).map((l) => l.role)),
    ];
    const candleColor = CANDLE_COLOR_PALETTE.find((c) => c !== A.candleColor)!;
    expect(diffRoles(buildKrathongLayers2D(withAppearance({ candleColor }), VIEW))).toEqual(["candle"]);
    const leafColor = LEAF_COLOR_PALETTE.find((c) => c !== A.leafColor)!;
    expect(diffRoles(buildKrathongLayers2D(withAppearance({ leafColor }), VIEW))).toEqual(["leaf"]);
  });

  it("T26 NIGHT relights every part except the unlit flame glow", () => {
    const night = buildKrathongLayers2D(A, VIEW, { preset: "NIGHT" });
    for (const l of night) {
      if (l.role === "flame") continue;
      const day = layers.find((o) => o.id === l.id)!;
      l.shapes.forEach((s, i) => expect(s.fill, `${l.id}#${i}`).not.toBe(day.shapes[i].fill));
    }
    for (const preset of ["DAY", "NIGHT"] as const) {
      const flame = buildKrathongLayers2D(A, VIEW, { preset }).find((l) => l.role === "flame")!;
      const expected = flatSurfaceColor(
        {
          albedo: KRATHONG_FLAME_MODEL.color,
          normal: [0, 1, 0],
          emissive: KRATHONG_FLAME_MODEL.emissive,
          emissiveIntensity: LIGHT_PRESETS[preset].flame.emissiveIntensity,
          toneMapped: false,
        },
        LIGHT_PRESETS[preset],
      );
      expect(flame.shapes[0].fill).toBe(expected);
    }
    expect(buildKrathongLayers2D(A, VIEW, { preset: "DAY" }).find((l) => l.role === "flame")!.shapes[0].fill).toBe("#ffffe4");
    expect(night.find((l) => l.role === "flame")!.shapes[0].fill).toBe("#ffffe9");
  });

  it("T27 base before candle, flame after candle", () => {
    const index = (role: KrathongPartRole) => layers.findIndex((l) => l.role === role);
    expect(index("base")).toBeLessThan(index("candle"));
    expect(index("flame")).toBeGreaterThan(index("candle"));
  });

  it("T28 every base × fold × flower kind builds at full and low", () => {
    for (const base of KRATHONG_BASE_IDS) {
      for (const lotusFold of LEAF_FOLD_STYLE_IDS) {
        for (const kind of FLOWER_KINDS) {
          for (const lod of ["full", "low"] as KrathongLod[]) {
            const ls = buildKrathongLayers2D(withAppearance({ base, lotusFold, flowers: A.flowers.map(() => kind) }), VIEW, { lod });
            expect(ls.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("T29 pure, frozen, and keyed by appearance", () => {
    const snapshot = JSON.stringify(A);
    const again = buildKrathongLayers2D(A, VIEW);
    expect(again).toEqual(layers);
    expect(Object.isFrozen(again)).toBe(true);
    expect(again.every((l) => Object.isFrozen(l) && Object.isFrozen(l.shapes))).toBe(true);
    expect(JSON.stringify(A)).toBe(snapshot);
    expect(krathongAppearanceKey(A)).toBe(
      "banana_trunk_01|style_01|#5E8C3A|marigold,marigold,marigold,marigold,marigold,marigold,marigold,marigold|#FFD166",
    );
    const flowers = [...A.flowers];
    flowers[2] = null;
    expect(krathongAppearanceKey(withAppearance({ flowers }))).toContain("marigold,marigold,-,marigold");
  });
});

describe("projectModelPoint (T30, re-exported from spriteProjection)", () => {
  const flat = { azimuthRad: 0, elevationRad: 0, modelYawRad: 0 };
  it("is the identity side view at zero angles", () => {
    expect(projectModelPoint([1, 2, 3], flat)).toEqual({ x: 1, y: -2, depth: 3 });
  });
  it("is a top view at elevation π/2", () => {
    const p = projectModelPoint([1, 2, 3], { ...flat, elevationRad: Math.PI / 2 });
    expect(p.x).toBeCloseTo(1, 12);
    expect(p.y).toBeCloseTo(3, 12);
    expect(p.depth).toBeCloseTo(2, 12);
  });
  it("model yaw π/2 maps +X to −Z (three rotation.y)", () => {
    const p = projectModelPoint([1, 0, 0], { ...flat, modelYawRad: Math.PI / 2 });
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.depth).toBeCloseTo(-1, 12);
  });
});
