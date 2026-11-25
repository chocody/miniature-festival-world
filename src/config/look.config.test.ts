// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import { assertDayNightHours } from "@/core/world";
import {
  BLOB_SHADOW_LOOK,
  BLOB_SHADOW_TIER_GEOMETRY,
  DAY_NIGHT_HOURS,
  KRATHONG_BLOB_SHADOW,
  LIGHT_PRESET_CHOICES,
  LIGHT_PRESET_IDS,
  LIGHT_PRESET_STORAGE_KEY,
  LIGHT_PRESET_SWITCH_COPY,
  LIGHT_PRESETS,
  LOOK_PALETTE,
  RIVER_KRATHONG_BLOB_SHADOW_RADIUS,
} from "./look.config";
import { RIVER_KRATHONG_SCALE } from "./riverFlow.config";

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
    for (const o of [LIGHT_PRESETS, LOOK_PALETTE, BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY, DAY_NIGHT_HOURS, LIGHT_PRESET_SWITCH_COPY]) {
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

  it("switch copy and choices", () => {
    for (const text of Object.values(LIGHT_PRESET_SWITCH_COPY)) expect(text.trim().length).toBeGreaterThan(0);
    expect(LIGHT_PRESET_CHOICES).toEqual(["AUTO", "DAY", "NIGHT"]);
    expect(LIGHT_PRESET_STORAGE_KEY).toMatch(/^mfw:[A-Za-z]+:v1$/);
  });

  it("the e2e spec duplicates the storage key and switch copy exactly", () => {
    const spec = readFileSync(join(process.cwd(), "tests/e2e/look-dev.spec.ts"), "utf8");
    expect(spec).toContain(`"${LIGHT_PRESET_STORAGE_KEY}"`);
    expect(spec).toContain(`"${LIGHT_PRESET_SWITCH_COPY.AUTO}"`);
    expect(spec).toContain(`"${LIGHT_PRESET_SWITCH_COPY.NIGHT}"`);
    expect(spec).toContain(`"${LIGHT_PRESET_SWITCH_COPY.groupLabel}"`);
  });
});
