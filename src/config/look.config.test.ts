// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import { assertDayNightHours } from "@/core/world";
import {
  BLOB_SHADOW_LOOK,
  BLOB_SHADOW_TIER_GEOMETRY,
  CANDLE_MAX_PEAK_RADIANCE,
  DAY_NIGHT_HOURS,
  KRATHONG_BLOB_SHADOW,
  LIGHT_PRESET_CHOICES,
  LIGHT_PRESET_IDS,
  LIGHT_PRESET_STORAGE_KEY,
  LIGHT_PRESET_TOGGLE_COPY,
  HUD_GLYPH_COLORS,
  LIGHT_PRESETS,
  LOOK_PALETTE,
  RIVER_KRATHONG_BLOB_SHADOW_RADIUS,
  VILLAGE_LIGHTS,
  WATER_HIGHLIGHT_LOOK,
  AMBIENT_MOTE_LOOK,
  VILLAGER_LOOK,
} from "./look.config";
import { KRATHONG_BASE_MODELS } from "./krathongModel.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS, RIVER_KRATHONG_SCALE } from "./riverFlow.config";
import { RELEASE_CANDLE } from "./ritual.config";
import { TOY_SCENE_LIGHTING } from "./scene.config";

const HEX = /^#[0-9A-F]{6}$/i;
const triangles = (g: { segments: number; rings: number }) => g.segments * (2 * g.rings - 1);

describe("look config (MFW-47)", () => {
  it("every palette and preset colour is #RRGGBB", () => {
    for (const [key, hex] of Object.entries(LOOK_PALETTE)) expect(hex, key).toMatch(HEX);
    for (const id of LIGHT_PRESET_IDS) {
      const p = LIGHT_PRESETS[id];
      for (const hex of [p.background, p.hemisphere.skyColor, p.hemisphere.groundColor, p.ambient.color, p.key.color]) {
        expect(hex, id).toMatch(HEX);
      }
    }
  });

  it("is frozen, nested preset objects included", () => {
    for (const o of [LIGHT_PRESETS, LOOK_PALETTE, BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY, DAY_NIGHT_HOURS, LIGHT_PRESET_TOGGLE_COPY, HUD_GLYPH_COLORS, HUD_GLYPH_COLORS.sun, HUD_GLYPH_COLORS.moon, HUD_GLYPH_COLORS.krathong, HUD_GLYPH_COLORS.firework, HUD_GLYPH_COLORS.skyLantern]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
    for (const id of LIGHT_PRESET_IDS) {
      const p = LIGHT_PRESETS[id];
      for (const o of [p, p.hemisphere, p.ambient, p.key, p.key.position, p.key.shadow, p.candle, p.flame]) {
        expect(Object.isFrozen(o), id).toBe(true);
      }
    }
    for (const g of Object.values(BLOB_SHADOW_TIER_GEOMETRY)) expect(Object.isFrozen(g)).toBe(true);
  });

  it.each(LIGHT_PRESET_IDS)("%s: positive finite intensities and a soft, never-black key shadow", (id) => {
    const p = LIGHT_PRESETS[id];
    for (const v of [p.hemisphere.intensity, p.ambient.intensity, p.key.intensity, p.candle.intensityScale, p.flame.emissiveIntensity]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(p.key.shadow.intensity).toBeGreaterThan(0);
    expect(p.key.shadow.intensity).toBeLessThan(1);
    expect(p.key.shadow.radius).toBeGreaterThan(1);
  });

  it("blob shadows are translucent and tinted, never black", () => {
    expect(BLOB_SHADOW_LOOK.opacity).toBeGreaterThan(0);
    expect(BLOB_SHADOW_LOOK.opacity).toBeLessThan(1);
    expect(relativeLuminance(BLOB_SHADOW_LOOK.color)).toBeGreaterThan(0);
  });

  it("day/night hours are valid", () => {
    expect(() => assertDayNightHours(DAY_NIGHT_HOURS)).not.toThrow();
  });

  it("LOW blobs are the cheap variant", () => {
    expect(triangles(BLOB_SHADOW_TIER_GEOMETRY.LOW)).toBeLessThan(triangles(BLOB_SHADOW_TIER_GEOMETRY.HIGH));
    expect(triangles(BLOB_SHADOW_TIER_GEOMETRY.MEDIUM)).toBeLessThanOrEqual(triangles(BLOB_SHADOW_TIER_GEOMETRY.HIGH));
  });

  it("river krathong blob radius is derived from the model blob", () => {
    expect(RIVER_KRATHONG_BLOB_SHADOW_RADIUS).toBe(KRATHONG_BLOB_SHADOW.radius * RIVER_KRATHONG_SCALE);
  });

  it("toggle copy, glyph colours and choices", () => {
    expect(Object.keys(LIGHT_PRESET_TOGGLE_COPY)).toEqual(["DAY", "NIGHT"]);
    for (const text of Object.values(LIGHT_PRESET_TOGGLE_COPY)) expect(text.trim().length).toBeGreaterThan(0);
    const palette = new Set<string>(Object.values(LOOK_PALETTE));
    for (const group of Object.values(HUD_GLYPH_COLORS)) {
      for (const hex of Object.values(group)) expect(palette.has(hex), hex).toBe(true);
    }
    expect(LIGHT_PRESET_CHOICES).toEqual(["AUTO", "DAY", "NIGHT"]);
    expect(LIGHT_PRESET_STORAGE_KEY).toMatch(/^mfw:[A-Za-z]+:v1$/);
  });

  it("the e2e HUD helper duplicates the storage key and toggle labels exactly", () => {
    const spec = readFileSync(join(process.cwd(), "tests/e2e/helpers/hud.ts"), "utf8");
    expect(spec).toContain(`"${LIGHT_PRESET_STORAGE_KEY}"`);
    expect(spec).toContain(`"${LIGHT_PRESET_TOGGLE_COPY.DAY}"`);
    expect(spec).toContain(`"${LIGHT_PRESET_TOGGLE_COPY.NIGHT}"`);
  });
});

describe("village lights and water look (MFW-49)", () => {
  it("is frozen", () => {
    for (const o of [
      VILLAGE_LIGHTS,
      VILLAGE_LIGHTS.DAY,
      VILLAGE_LIGHTS.NIGHT,
      WATER_HIGHLIGHT_LOOK,
    ]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
  });

  it("colours are #RRGGBB and opacities in (0, 1)", () => {
    expect(LOOK_PALETTE.stone).toMatch(HEX);
    expect(WATER_HIGHLIGHT_LOOK.color).toMatch(HEX);
    for (const o of [
      WATER_HIGHLIGHT_LOOK.shoreOpacity,
      WATER_HIGHLIGHT_LOOK.glintOpacity,
      WATER_HIGHLIGHT_LOOK.rippleOpacity,
    ]) {
      expect(o).toBeGreaterThan(0);
      expect(o).toBeLessThan(1);
    }
  });

  it("has a preset entry for every light preset, lit at NIGHT and off at DAY", () => {
    expect(Object.keys(VILLAGE_LIGHTS).sort()).toEqual([...LIGHT_PRESET_IDS].sort());
    expect(VILLAGE_LIGHTS.DAY.windowEmissiveIntensity).toBe(0);
    expect(VILLAGE_LIGHTS.DAY.lanternEmissiveIntensity).toBe(0);
    expect(VILLAGE_LIGHTS.NIGHT.windowEmissiveIntensity).toBeGreaterThan(0);
    expect(VILLAGE_LIGHTS.NIGHT.lanternEmissiveIntensity).toBeGreaterThan(0);
  });
});

describe("candle light (MFW-67)", () => {
  const c = TOY_SCENE_LIGHTING.candle;
  /** Lambert radiance the brightened candle adds to a white surface right under it: I / h² × 1/π (decay 2). */
  const peak = (intensity: number, h: number) => intensity / (Math.PI * h * h);

  it("fades out smoothly just past the krathong", () => {
    expect(c.distance).toBe(2 * KRATHONG_MODEL_FOOTPRINT_RADIUS);
    expect(c.decay).toBe(2);
    expect(c.color).toBe("#ffb35c");
  });

  it("never clips into a flat disc: peak radiance ≤ CANDLE_MAX_PEAK_RADIANCE for every base and preset", () => {
    for (const [baseId, base] of Object.entries(KRATHONG_BASE_MODELS)) {
      const h = c.position[1] - base.topY;
      expect(h, baseId).toBeGreaterThan(0);
      for (const p of LIGHT_PRESET_IDS) {
        const intensity = c.intensity * LIGHT_PRESETS[p].candle.intensityScale * RELEASE_CANDLE.brightenFactor;
        expect(peak(intensity, h), `${baseId} ${p}`).toBeLessThanOrEqual(CANDLE_MAX_PEAK_RADIANCE);
        // Scale invariance: OwnKrathong scales distance by s and intensity by s², so the river pose looks the same.
        const s = RIVER_KRATHONG_SCALE;
        expect(peak(intensity * s * s, h * s)).toBeCloseTo(peak(intensity, h), 12);
      }
    }
  });
});

describe("villager and mote look (MFW-50)", () => {
  const paletteValues: readonly string[] = Object.values(LOOK_PALETTE);
  it("L1 frozen, #RRGGBB", () => {
    for (const o of [VILLAGER_LOOK, AMBIENT_MOTE_LOOK, AMBIENT_MOTE_LOOK.DAY, AMBIENT_MOTE_LOOK.NIGHT]) expect(Object.isFrozen(o)).toBe(true);
    expect(VILLAGER_LOOK.silhouette).toMatch(HEX);
    for (const id of LIGHT_PRESET_IDS) expect(AMBIENT_MOTE_LOOK[id].color).toMatch(HEX);
  });
  it("L2 every colour comes from the palette (no new palette key)", () => {
    expect(paletteValues).toContain(VILLAGER_LOOK.silhouette);
    for (const id of LIGHT_PRESET_IDS) expect(paletteValues).toContain(AMBIENT_MOTE_LOOK[id].color);
  });
  it("L3 mote opacities in (0, 1]; the silhouette is dark against the land but never black (owner 2026-11-25)", () => {
    for (const id of LIGHT_PRESET_IDS) {
      expect(AMBIENT_MOTE_LOOK[id].opacity).toBeGreaterThan(0);
      expect(AMBIENT_MOTE_LOOK[id].opacity).toBeLessThanOrEqual(1);
    }
    const silhouette = relativeLuminance(VILLAGER_LOOK.silhouette);
    expect(silhouette).toBeLessThan(relativeLuminance(LOOK_PALETTE.grass));
    expect(silhouette).toBeGreaterThan(relativeLuminance("#000000"));
  });
});
