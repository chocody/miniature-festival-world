// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_KRATHONG_SIDE_SHADE, FLAT_KRATHONG_VIEW_AZIMUTH_RAD, FLAT_KRATHONG_VIEW_ELEVATION_RAD } from "@/config/fallback2d.config";
import { CANDLE_COLOR_PALETTE } from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import { assembleKrathong, DEFAULT_KRATHONG_APPEARANCE, materialSpecFor, type KrathongAppearance } from "@/core/customization";
import { shadeHex } from "@/core/math/shadeHex";
import { buildKrathongLayers2D, projectModelPoint, puckSidePath, trianglePoints, type FlatKrathongView } from "./krathongLayers2d";

const VIEW: FlatKrathongView = {
  azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  modelYawRad: 0,
};
const A = DEFAULT_KRATHONG_APPEARANCE;
const count = (layers: readonly { role: string }[], role: string) => layers.filter((l) => l.role === role).length;
const withAppearance = (patch: Partial<KrathongAppearance>): KrathongAppearance => ({ ...A, ...patch });

describe("buildKrathongLayers2D", () => {
  const layers = buildKrathongLayers2D(A, VIEW);

  it("returns one layer per MFW-19 part", () => {
    expect(count(layers, "base")).toBe(1);
    expect(count(layers, "leaf")).toBe(KRATHONG_LEAF_COUNT);
    expect(count(layers, "flower")).toBe(A.flowers.filter((f) => f !== null).length);
    expect(count(layers, "candle")).toBe(1);
    expect(count(layers, "flame")).toBe(1);
    expect(count(layers, "incense")).toBe(KRATHONG_INCENSE_MODEL.count);
    expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length);
  });

  it("sorts back to front and takes colours from the material specs", () => {
    for (let i = 1; i < layers.length; i++) expect(layers[i].depth).toBeGreaterThanOrEqual(layers[i - 1].depth);
    const assembly = assembleKrathong(A);
    const parts = [...assembly.body, ...assembly.centerAnchor.parts];
    for (const l of layers) {
      const part = parts.find((p) => p.id === l.id)!;
      expect(l.fill).toBe(materialSpecFor(part.materialKey).color);
    }
  });

  it("picks the shape by geometry kind", () => {
    const kindOf = (ls: typeof layers, role: string) => ls.filter((l) => l.role === role).map((l) => l.kind);
    const base = layers.find((l) => l.role === "base")!;
    expect(A.base).toBe("banana_trunk_01");
    expect(base.kind).toBe("puck");
    if (base.kind === "puck") expect(base.sideFill).toBe(shadeHex(base.fill, FLAT_KRATHONG_SIDE_SHADE));
    expect(kindOf(buildKrathongLayers2D(withAppearance({ base: "toy_bread_01" }), VIEW), "base")).toEqual(["ellipse"]);
    expect(new Set(kindOf(buildKrathongLayers2D(withAppearance({ lotusFold: "style_01" }), VIEW), "leaf"))).toEqual(new Set(["triangle"]));
    expect(new Set(kindOf(buildKrathongLayers2D(withAppearance({ lotusFold: "style_02" }), VIEW), "leaf"))).toEqual(new Set(["ellipse"]));
    expect(kindOf(layers, "candle")).toEqual(["puck"]);
  });

  it("removes flower layers when every flower is null", () => {
    const none = buildKrathongLayers2D(withAppearance({ flowers: A.flowers.map(() => null) }), VIEW);
    expect(count(none, "flower")).toBe(0);
  });

  it("changing the candle colour changes only the candle fill", () => {
    const candleColor = CANDLE_COLOR_PALETTE.find((c) => c !== A.candleColor)!;
    const changed = buildKrathongLayers2D(withAppearance({ candleColor }), VIEW);
    const diff = changed.filter((l) => l.fill !== layers.find((o) => o.id === l.id)!.fill);
    expect(diff.map((l) => l.role)).toEqual(["candle"]);
  });

  it("is pure: deep-equal frozen output, input not mutated", () => {
    const snapshot = JSON.stringify(A);
    const again = buildKrathongLayers2D(A, VIEW);
    expect(again).toEqual(layers);
    expect(Object.isFrozen(again)).toBe(true);
    expect(again.every((l) => Object.isFrozen(l))).toBe(true);
    expect(JSON.stringify(A)).toBe(snapshot);
  });

  it("uses the lotus base colour after a base change", () => {
    const lotus = buildKrathongLayers2D(withAppearance({ base: "lotus_petal_01" }), VIEW).find((l) => l.role === "base")!;
    expect(lotus.fill).toBe(KRATHONG_BASE_MODELS.lotus_petal_01.color);
  });
});

describe("projectModelPoint", () => {
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

describe("path strings", () => {
  it("formats the puck side and the triangle", () => {
    const puck = {
      kind: "puck", id: "p", role: "base", depth: 0, fill: "#000000", sideFill: "#000000",
      cx: 0, topY: -1, bottomY: 1, topRx: 2, topRy: 1, bottomRx: 3, bottomRy: 1,
    } as const;
    expect(puckSidePath(puck)).toBe("M -3 1 A 3 1 0 0 0 3 1 L 2 -1 L -2 -1 Z");
    expect(trianglePoints({ kind: "triangle", id: "t", role: "leaf", depth: 0, fill: "#000000", points: [0, 1, 2, 3, 4, 5] })).toBe(
      "0,1 2,3 4,5",
    );
  });
});
