// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CANDLE_COLOR_PALETTE, KRATHONG_BASE_IDS, LEAF_FOLD_STYLE_IDS } from "@/config/events/loyKrathong.config";
import { KRATHONG_DEFAULT_DESIGN } from "@/config/krathongDesigns.config";
import { KRATHONG_FLAME_MODEL } from "@/config/krathongModel.config";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance, type KrathongAppearance } from "./index";
import { designFlameParts, krathongDesignForAppearance, uniqueKrathongDesigns } from "./krathongDesign";

/** H, R, B of the full procedural flame lathe, from its profile. */
function flameLathe() {
  const mesh = KRATHONG_FLAME_MODEL.mesh;
  if (mesh.kind !== "lathe") throw new Error("flame is a lathe");
  const ys = mesh.profile.map((p) => p[1]);
  return { H: Math.max(...ys) - Math.min(...ys), R: Math.max(...mesh.profile.map((p) => p[0])), B: Math.min(...ys) };
}

describe("krathong design mapping (MFW-65)", () => {
  it("KD1: every appearance maps to the default design and still parses (stored data unchanged)", () => {
    const appearances: KrathongAppearance[] = [DEFAULT_KRATHONG_APPEARANCE];
    for (const base of KRATHONG_BASE_IDS)
      for (const lotusFold of LEAF_FOLD_STYLE_IDS)
        appearances.push({ ...DEFAULT_KRATHONG_APPEARANCE, base, lotusFold, candleColor: CANDLE_COLOR_PALETTE[0] });
    for (const a of appearances) {
      expect(krathongDesignForAppearance(a)).toBe(KRATHONG_DEFAULT_DESIGN);
      expect(parseKrathongAppearance(a).ok).toBe(true);
    }
  });

  it("KD2: designFlameParts fits the procedural flame to an anchor", () => {
    const { H, R, B } = flameLathe();
    expect(B).toBeLessThan(0);
    const [part] = designFlameParts([{ x: 0.1, y: 0.5, z: -0.2, height: 2 * H, radius: 1.5 * R }]);
    expect(part.id).toBe("design-flame-0");
    expect(part.role).toBe("flame");
    expect(part.geometryKey).toBe("flame");
    expect(part.materialKey).toBe("flame");
    expect(part.socketId).toBeNull();
    expect(part.rotationY).toBe(0);
    part.scale.forEach((v, i) => expect(v).toBeCloseTo([1.5, 2, 1.5][i], 10));
    part.localPosition.forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.5 - 2 * B, -0.2][i], 10));
  });

  it("KD3: uniqueKrathongDesigns", () => {
    const a = DEFAULT_KRATHONG_APPEARANCE;
    const b: KrathongAppearance = { ...a, base: "toy_bread_01" };
    expect(uniqueKrathongDesigns([a, a, b])).toEqual([KRATHONG_DEFAULT_DESIGN]);
    expect(uniqueKrathongDesigns([])).toEqual([]);
  });
});
