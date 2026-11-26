// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_KRATHONG_VIEW_AZIMUTH_RAD, FLAT_KRATHONG_VIEW_ELEVATION_RAD } from "@/config/fallback2d.config";
import { KRATHONG_FLAME_MODEL } from "@/config/krathongModel.config";
import { LIGHT_PRESET_IDS, LIGHT_PRESETS, LOOK_PALETTE } from "@/config/look.config";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import { estimateLitLuminance } from "@/core/world/litLuminance";
import { createFlatLightContext, flatSurfaceColor, neutralToneMap, rotateYaw } from "./flatLight";

const UP = [0, 1, 0] as const;
const FRONT = [0, 0, 1] as const;

describe("flatLight (MFW-51): the 3D lit colour of a face", () => {
  it("T1 Neutral tone map = three's NeutralToneMapping", () => {
    for (const c of neutralToneMap([1, 1, 1], 1)) expect(c).toBeCloseTo(0.8690909, 6);
    const low = neutralToneMap([0.5, 0.25, 0.1], 1);
    [0.46, 0.21, 0.06].forEach((v, i) => expect(Math.abs(low[i] - v)).toBeLessThan(1e-9));
  });

  it("T2 ground and water match the 3D screenshots (lead probe)", () => {
    expect(flatSurfaceColor({ albedo: LOOK_PALETTE.grass, normal: UP }, LIGHT_PRESETS.DAY)).toBe("#a5b789");
    expect(flatSurfaceColor({ albedo: LOOK_PALETTE.grass, normal: UP }, LIGHT_PRESETS.NIGHT)).toBe("#678483");
    expect(flatSurfaceColor({ albedo: LOOK_PALETTE.water, normal: UP }, LIGHT_PRESETS.DAY)).toBe("#8ca6a2");
    expect(flatSurfaceColor({ albedo: LOOK_PALETTE.water, normal: UP }, LIGHT_PRESETS.NIGHT)).toBe("#53769b");
  });

  it("T3 a cream wall facing +z", () => {
    expect(flatSurfaceColor({ albedo: LOOK_PALETTE.wallCream, normal: FRONT }, LIGHT_PRESETS.DAY)).toBe("#cdbd92");
    expect(flatSurfaceColor({ albedo: LOOK_PALETTE.wallCream, normal: FRONT }, LIGHT_PRESETS.NIGHT)).toBe("#71747b");
  });

  it("T4 the flame is emissive and not tone-mapped", () => {
    const flame = (p: "DAY" | "NIGHT") =>
      flatSurfaceColor(
        {
          albedo: KRATHONG_FLAME_MODEL.color,
          normal: UP,
          emissive: KRATHONG_FLAME_MODEL.emissive,
          emissiveIntensity: LIGHT_PRESETS[p].flame.emissiveIntensity,
          toneMapped: false,
        },
        LIGHT_PRESETS[p],
      );
    expect(flame("DAY")).toBe("#ffffe4");
    expect(flame("NIGHT")).toBe("#ffffe9");
  });

  it("T5 windows glow at NIGHT only", () => {
    const glass = { albedo: LOOK_PALETTE.waterDeep, normal: FRONT, emissive: LOOK_PALETTE.lanternGlow };
    expect(flatSurfaceColor({ ...glass, emissiveIntensity: 0.9 }, LIGHT_PRESETS.NIGHT)).toBe("#ecb874");
    const day = flatSurfaceColor({ ...glass, emissiveIntensity: 0 }, LIGHT_PRESETS.DAY);
    expect(day).toBe("#344f4f");
    expect(day).toBe(flatSurfaceColor({ albedo: LOOK_PALETTE.waterDeep, normal: FRONT }, LIGHT_PRESETS.DAY));
  });

  it.each(LIGHT_PRESET_IDS)("T6 %s: untoned luminance = estimateLitLuminance", (p) => {
    const hex = flatSurfaceColor({ albedo: "#404040", normal: UP, toneMapped: false }, LIGHT_PRESETS[p]);
    expect(Math.abs(relativeLuminance(hex) - estimateLitLuminance("#404040", LIGHT_PRESETS[p], UP))).toBeLessThan(0.005);
  });

  it("T7 rejects a zero normal and a bad colour; the context matches the view angles", () => {
    expect(() => flatSurfaceColor({ albedo: LOOK_PALETTE.grass, normal: [0, 0, 0] }, LIGHT_PRESETS.DAY)).toThrow(RangeError);
    expect(() => flatSurfaceColor({ albedo: "red", normal: UP }, LIGHT_PRESETS.DAY)).toThrow(RangeError);
    const view = { azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD, elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD };
    for (const p of LIGHT_PRESET_IDS) {
      const ctx = createFlatLightContext(view, p);
      expect(Math.hypot(ctx.keyScreenDir.x, ctx.keyScreenDir.y)).toBeCloseTo(1, 12);
      const a = view.azimuthRad;
      const phi = view.elevationRad;
      const expected = [Math.sin(a) * Math.cos(phi), Math.sin(phi), Math.cos(a) * Math.cos(phi)];
      ctx.cameraDir.forEach((c, i) => expect(c).toBeCloseTo(expected[i], 12));
      expect(ctx.lit(LOOK_PALETTE.grass, UP)).toBe(flatSurfaceColor({ albedo: LOOK_PALETTE.grass, normal: UP }, LIGHT_PRESETS[p]));
    }
    const r = rotateYaw([1, 0, 0], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0, 12);
    expect(r[2]).toBeCloseTo(-1, 12);
  });
});
