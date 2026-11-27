// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_DESIGN_IDS, KRATHONG_DESIGN_MAX_FLAMES } from "@/config/krathongDesigns.config";
import { KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import {
  assembleKrathong,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_INSTANCE_BUCKET_COUNT,
  KRATHONG_INSTANCE_BUCKETS,
  KRATHONG_MATERIAL_KEYS,
  krathongInstanceBucketIndex,
  type KrathongAppearance,
} from "./index";

function countsFor(appearance: KrathongAppearance): number[] {
  const counts = new Array<number>(KRATHONG_INSTANCE_BUCKET_COUNT).fill(0);
  const assembly = assembleKrathong(appearance);
  for (const part of [...assembly.body, ...assembly.centerAnchor.parts]) {
    const b = krathongInstanceBucketIndex(part.geometryKey, part.materialKey);
    expect(b).not.toBeNull();
    counts[b as number] += 1;
  }
  return counts;
}

describe("krathong instance buckets", () => {
  it("has one bucket per geometry/material pair of the catalogue", () => {
    expect(KRATHONG_INSTANCE_BUCKET_COUNT).toBe(
      KRATHONG_BASE_IDS.length + LEAF_FOLD_STYLE_IDS.length * LEAF_COLOR_PALETTE.length + FLOWER_KINDS.length + CANDLE_COLOR_PALETTE.length + 3 // + flowerCentre (MFW-48)
        + KRATHONG_DESIGN_IDS.length, // + one body per owner-supplied design (MFW-65)
    );
    expect(KRATHONG_INSTANCE_BUCKET_COUNT).toBe(23); // MFW-76: five designs
    expect(krathongInstanceBucketIndex("design:banana_leaf_01", "designBody")).toBe(18); // e2e `river-batch-18` is unchanged
    expect(new Set(KRATHONG_INSTANCE_BUCKETS.map((b) => b.key)).size).toBe(KRATHONG_INSTANCE_BUCKET_COUNT);
    // MFW-65: the design buckets come after incense, so every earlier index is unchanged.
    const designBuckets = KRATHONG_INSTANCE_BUCKETS.slice(-KRATHONG_DESIGN_IDS.length);
    expect(KRATHONG_INSTANCE_BUCKETS[KRATHONG_INSTANCE_BUCKET_COUNT - KRATHONG_DESIGN_IDS.length - 1].role).toBe("incense");
    designBuckets.forEach((b, i) => {
      expect(b).toEqual({ key: `design:${KRATHONG_DESIGN_IDS[i]}|designBody`, role: "designBody", geometryKey: `design:${KRATHONG_DESIGN_IDS[i]}`, materialKey: "designBody", maxPerKrathong: 1 });
      expect(krathongInstanceBucketIndex(b.geometryKey, b.materialKey)).toBe(KRATHONG_INSTANCE_BUCKET_COUNT - KRATHONG_DESIGN_IDS.length + i);
    });
    expect(KRATHONG_INSTANCE_BUCKETS.find((b) => b.role === "flame")?.maxPerKrathong).toBe(Math.max(1, KRATHONG_DESIGN_MAX_FLAMES));
    for (const b of KRATHONG_INSTANCE_BUCKETS.slice(0, -KRATHONG_DESIGN_IDS.length)) {
      expect(KRATHONG_GEOMETRY_KEYS).toContain(b.geometryKey);
      expect(KRATHONG_MATERIAL_KEYS).toContain(b.materialKey);
    }
    expect(Object.isFrozen(KRATHONG_INSTANCE_BUCKETS)).toBe(true);
  });

  it("every assembled part has a bucket within its per-krathong maximum", () => {
    const patterns: (typeof FLOWER_KINDS[number] | null)[][] = [
      new Array(RIM_SOCKET_COUNT).fill(null),
      new Array(RIM_SOCKET_COUNT).fill("marigold"),
      new Array(RIM_SOCKET_COUNT).fill("orchid"),
      new Array(RIM_SOCKET_COUNT).fill("lotus"),
      ["marigold", null, "orchid", null, "lotus", null, "marigold", null],
    ];
    let checked = 0;
    for (const base of KRATHONG_BASE_IDS)
      for (const lotusFold of LEAF_FOLD_STYLE_IDS)
        for (const leafColor of LEAF_COLOR_PALETTE)
          for (const candleColor of CANDLE_COLOR_PALETTE)
            for (const flowers of patterns) {
              const counts = countsFor({ base, lotusFold, leafColor, candleColor, flowers });
              counts.forEach((c, i) => expect(c).toBeLessThanOrEqual(KRATHONG_INSTANCE_BUCKETS[i].maxPerKrathong));
              expect(counts.filter((c, i) => KRATHONG_INSTANCE_BUCKETS[i].role === "flame")).toEqual([1]);
              checked += 1;
            }
    expect(checked).toBe(54 * patterns.length);
  });

  it("reaches the maxima", () => {
    const counts = countsFor({
      base: KRATHONG_BASE_IDS[0],
      lotusFold: LEAF_FOLD_STYLE_IDS[0],
      leafColor: LEAF_COLOR_PALETTE[0],
      candleColor: CANDLE_COLOR_PALETTE[0],
      flowers: new Array(RIM_SOCKET_COUNT).fill(FLOWER_KINDS[0]),
    });
    KRATHONG_INSTANCE_BUCKETS.forEach((b, i) => {
      if (b.role === "leaf" && b.geometryKey === `leaf:${LEAF_FOLD_STYLE_IDS[0]}` && b.materialKey === `leaf:${LEAF_COLOR_PALETTE[0]}`)
        expect(counts[i]).toBe(KRATHONG_LEAF_COUNT);
      else if (b.role === "flower" && b.geometryKey === `flower:${FLOWER_KINDS[0]}`) expect(counts[i]).toBe(RIM_SOCKET_COUNT);
      else if (b.role === "flowerCentre") expect(counts[i]).toBe(RIM_SOCKET_COUNT);
      else if (b.role === "incense") expect(counts[i]).toBe(KRATHONG_INCENSE_MODEL.count);
      else if (b.role === "base" && b.geometryKey === `base:${KRATHONG_BASE_IDS[0]}`) expect(counts[i]).toBe(1);
      else if (b.role === "candle" && b.materialKey === `candle:${CANDLE_COLOR_PALETTE[0]}`) expect(counts[i]).toBe(1);
      else if (b.role === "flame") expect(counts[i]).toBe(1);
    });
  });

  it("returns null for a pair the catalogue does not know", () => {
    expect(krathongInstanceBucketIndex("candle", "flame")).toBeNull();
  });
});
