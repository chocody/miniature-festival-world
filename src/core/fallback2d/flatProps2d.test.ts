// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_BLOB_GRADIENT_STOPS, FLAT_KRATHONG_VIEW_AZIMUTH_RAD, FLAT_KRATHONG_VIEW_ELEVATION_RAD } from "@/config/fallback2d.config";
import {
  HOUSE_FACADE,
  LOY_KRATHONG_BUSH_CLUMPS,
  LOY_KRATHONG_TREE_SHAPES,
  RIVER_ENVIRONMENT_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { BLOB_SHADOW_LOOK, LOOK_PALETTE, type LightPresetId } from "@/config/look.config";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import { createFlatLightContext, rotateYaw, type FlatVec3 } from "./flatLight";
import {
  flatBlobGradientStops,
  flatBushShapes,
  flatHouseShapes,
  flatLampShapes,
  flatReedShapes,
  flatRockShapes,
  flatTreeShapes,
  flatVillagerShapes,
  type FlatArtShape,
} from "./flatProps2d";

const VIEW = { azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD, elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD };
const ctxOf = (preset: LightPresetId) => createFlatLightContext(VIEW, preset);
const DAY = ctxOf("DAY");
const NIGHT = ctxOf("NIGHT");
const dot = (a: FlatVec3, b: FlatVec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const visible = (normals: readonly FlatVec3[], yaw: number) => normals.filter((n) => dot(rotateYaw(n, yaw), DAY.cameraDir) > 0).length;
const BODY_NORMALS: FlatVec3[] = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
];
function pyramidNormals(): FlatVec3[] {
  const r = RIVER_ENVIRONMENT_PARTS.houseRoof;
  const n = r.geometry.radialSegments;
  return Array.from({ length: n }, (_, k) => {
    const mid = (2 * Math.PI * (k + 0.5)) / n + r.yawOffsetRad;
    // outward and up: the face rises by height over the apothem r·cos(π/n)
    return [Math.sin(mid), (r.geometry.radius * Math.cos(Math.PI / n)) / r.geometry.height, Math.cos(mid)] as FlatVec3;
  });
}
function gableNormals(): FlatVec3[] {
  const g = RIVER_ENVIRONMENT_PARTS.houseRoofGable.geometry;
  return [
    [0, g.depth / 2, g.height],
    [0, g.depth / 2, -g.height],
    [1, 0, 0],
    [-1, 0, 0],
  ];
}
const closed = (shapes: readonly FlatArtShape[]) => shapes.every((s) => s.d.startsWith("M ") && s.d.endsWith(" Z"));
const circleTop = (d: string) => {
  const m = /^M (\S+) (\S+) A (\S+) /.exec(d)!;
  return Number(m[2]) - Number(m[3]);
};

describe("flat prop sprites (MFW-51): numbers from the 3D part specs", () => {
  it.each(["pyramid", "gable"] as const)("T31 %s house facing the camera: faces, door, windows and roof", (roof) => {
    const shapes = flatHouseShapes(roof, 0, DAY);
    const roofFaces = visible(roof === "pyramid" ? pyramidNormals() : gableNormals(), 0);
    expect(shapes).toHaveLength(visible(BODY_NORMALS, 0) + 1 + HOUSE_FACADE.windows.length + roofFaces);
    expect(closed(shapes)).toBe(true);
    const door = DAY.lit(RIVER_ENVIRONMENT_PARTS.houseDoor.material.color, [0, 0, 1]);
    expect(shapes.filter((s) => s.fill === door)).toHaveLength(1);
  });

  it("T32 a house facing away shows no door or windows", () => {
    for (const roof of ["pyramid", "gable"] as const) {
      const shapes = flatHouseShapes(roof, Math.PI, DAY);
      const roofFaces = visible(roof === "pyramid" ? pyramidNormals() : gableNormals(), Math.PI);
      expect(shapes).toHaveLength(visible(BODY_NORMALS, Math.PI) + roofFaces);
    }
  });

  it("T33 windows glow at NIGHT; roofs use their own materials", () => {
    const { houseWindow, houseRoof, houseRoofGable } = RIVER_ENVIRONMENT_PARTS;
    const night = NIGHT.lit(houseWindow.material.color, [0, 0, 1], houseWindow.material.emissive, 0.9);
    const nightShapes = flatHouseShapes("pyramid", 0, NIGHT);
    expect(nightShapes.filter((s) => s.fill === night)).toHaveLength(HOUSE_FACADE.windows.length);
    const day = DAY.lit(houseWindow.material.color, [0, 0, 1], houseWindow.material.emissive, 0);
    expect(day).not.toBe(night);
    expect(flatHouseShapes("pyramid", 0, DAY).filter((s) => s.fill === day)).toHaveLength(HOUSE_FACADE.windows.length);
    const roofFills = (roof: "pyramid" | "gable", color: string, normals: FlatVec3[]) => {
      const allowed = new Set(normals.map((n) => DAY.lit(color, n)));
      const shapes = flatHouseShapes(roof, 0, DAY);
      const count = visible(normals, 0);
      return shapes.slice(shapes.length - count).every((s) => allowed.has(s.fill));
    };
    expect(roofFills("pyramid", houseRoof.material.color, pyramidNormals())).toBe(true);
    expect(roofFills("gable", houseRoofGable.material.color, gableNormals())).toBe(true);
  });

  it.each(["round", "tall"] as const)("T34 / T38 %s tree: trunk + two circles per clump, crown above the trunk", (shape) => {
    const shapes = flatTreeShapes(shape, 0.7, DAY);
    expect(shapes).toHaveLength(1 + 2 * LOY_KRATHONG_TREE_SHAPES[shape].clumps.length);
    expect(closed(shapes)).toBe(true);
    const trunkYs = [...shapes[0].d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    const trunkTop = Math.min(...trunkYs);
    const crownTop = Math.min(...shapes.slice(1).map((s) => circleTop(s.d)));
    expect(crownTop).toBeLessThan(trunkTop);
  });

  it("T35 bush, rock, lamp and reed shape counts", () => {
    expect(flatBushShapes(1, DAY)).toHaveLength(2 * LOY_KRATHONG_BUSH_CLUMPS.length);
    expect(flatRockShapes(DAY)).toHaveLength(1);
    expect(flatLampShapes(DAY)).toHaveLength(2);
    expect(flatReedShapes(0.4, DAY)).toHaveLength(RIVER_ENVIRONMENT_PARTS.riversidePlant.geometry.blades.length);
  });

  it("T36 the lamp head is brighter at NIGHT (lantern emissive)", () => {
    expect(relativeLuminance(flatLampShapes(NIGHT)[1].fill)).toBeGreaterThan(relativeLuminance(flatLampShapes(DAY)[1].fill));
  });

  it("T37 villager: body and head, plus a hat", () => {
    expect(flatVillagerShapes(false, DAY)).toHaveLength(2);
    expect(flatVillagerShapes(true, DAY)).toHaveLength(3);
    expect(closed(flatVillagerShapes(true, DAY))).toBe(true);
  });

  it("T39 blob gradient = the 3D fan alpha, unlit tint", () => {
    const stops = flatBlobGradientStops();
    expect(stops).toHaveLength(FLAT_BLOB_GRADIENT_STOPS);
    expect(stops[0].opacity).toBe(BLOB_SHADOW_LOOK.opacity);
    expect(stops[0].offset).toBe(0);
    expect(stops[stops.length - 1].opacity).toBe(0);
    expect(stops[stops.length - 1].offset).toBe(1);
    expect(stops.every((s) => s.color === LOOK_PALETTE.shadowTint)).toBe(true);
  });

  it("T40 every prop fill is relit at NIGHT", () => {
    const pairs: [readonly FlatArtShape[], readonly FlatArtShape[]][] = [
      [flatHouseShapes("pyramid", 0, DAY), flatHouseShapes("pyramid", 0, NIGHT)],
      [flatHouseShapes("gable", 2, DAY), flatHouseShapes("gable", 2, NIGHT)],
      [flatTreeShapes("round", 1, DAY), flatTreeShapes("round", 1, NIGHT)],
      [flatTreeShapes("tall", 1, DAY), flatTreeShapes("tall", 1, NIGHT)],
      [flatBushShapes(0, DAY), flatBushShapes(0, NIGHT)],
      [flatRockShapes(DAY), flatRockShapes(NIGHT)],
      [flatLampShapes(DAY), flatLampShapes(NIGHT)],
      [flatReedShapes(0, DAY), flatReedShapes(0, NIGHT)],
      [flatVillagerShapes(true, DAY), flatVillagerShapes(true, NIGHT)],
    ];
    for (const [day, night] of pairs) {
      expect(night).toHaveLength(day.length);
      day.forEach((s, i) => expect(night[i].fill).not.toBe(s.fill));
    }
  });
});
