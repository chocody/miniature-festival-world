// @vitest-environment node
import { describe, expect, it } from "vitest";
import { countTriangles, createPartGeometry } from "@/components/canvas3d/geometry";
import { MS_PER_SECOND, WCAG_MAX_FLASHES_PER_SECOND } from "@/config/gimmicks.config";
import { LIVING_WORLD_TIERS } from "@/config/performance.config";
import { ENVIRONMENT_PART_MAX_TRIANGLES } from "@/config/scene.config";
import { assertVillagerDefinition, createRiverChannel } from "@/core/world";
import {
  AMBIENT_MOTE_FAN,
  AMBIENT_MOTES,
  LANTERN_FLICKER,
  LOY_KRATHONG_VILLAGERS,
  VILLAGER_BLOB_SHADOW_RADIUS,
  VILLAGER_FOOTPRINT_RADIUS,
  VILLAGER_HEIGHT,
  VILLAGER_MATERIAL,
  VILLAGER_MOTION,
  VILLAGER_PARTS,
} from "./loyKrathong.life.config";
import { LOY_KRATHONG_RIVER_CHANNEL, LOY_KRATHONG_RIVER_ENVIRONMENT, LOY_KRATHONG_RIVERSIDE_PATHS } from "./loyKrathong.river.config";
import { VILLAGER_LOOK } from "@/config/look.config";

/** Test-local: villagers stay within the village stretch, this much progress beyond the outermost houses. */
const VILLAGE_STRETCH_MARGIN = 0.05;
const pathOf = (id: number) => LOY_KRATHONG_RIVERSIDE_PATHS.find((p) => p.pathId === id)!;
const arc = createRiverChannel(LOY_KRATHONG_RIVER_CHANNEL).curve.getLength();
const tierCounts = Object.values(LIVING_WORLD_TIERS).map((t) => t.villagerCount);

describe("villagers config (MFW-50 AC1)", () => {
  it("C1 unique integer ids ≥ 1, enough rows for HIGH", () => {
    const ids = LOY_KRATHONG_VILLAGERS.map((v) => v.villagerId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(Number.isInteger(id) && id >= 1).toBe(true);
    expect(LOY_KRATHONG_VILLAGERS.length).toBeGreaterThanOrEqual(LIVING_WORLD_TIERS.HIGH.villagerCount);
    expect(Object.isFrozen(LOY_KRATHONG_VILLAGERS)).toBe(true);
    for (const v of LOY_KRATHONG_VILLAGERS) expect(Object.isFrozen(v)).toBe(true);
  });

  it("C2 every villager walks an existing riverside path, and its definition is valid", () => {
    for (const v of LOY_KRATHONG_VILLAGERS) {
      expect(LOY_KRATHONG_RIVERSIDE_PATHS.some((p) => p.pathId === v.pathId)).toBe(true);
      expect(() => assertVillagerDefinition(v, pathOf(v.pathId))).not.toThrow();
    }
  });

  it("C3 every silhouette stays inside its path strip", () => {
    for (const v of LOY_KRATHONG_VILLAGERS) {
      const p = pathOf(v.pathId);
      expect(Math.abs(v.across) * p.halfWidth + VILLAGER_FOOTPRINT_RADIUS * v.scale, String(v.villagerId)).toBeLessThanOrEqual(p.halfWidth);
    }
  });

  it("C4 villagers on the same path either pass side by side or never meet", () => {
    const maxScale = Math.max(...LOY_KRATHONG_VILLAGERS.map((v) => v.scale));
    const clearance = 2 * VILLAGER_FOOTPRINT_RADIUS * maxScale;
    const list = LOY_KRATHONG_VILLAGERS;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.pathId !== b.pathId) continue;
        if (Math.abs(a.across - b.across) * pathOf(a.pathId).halfWidth >= clearance) continue;
        const gap = Math.max(a.fromProgress, b.fromProgress) - Math.min(a.toProgress, b.toProgress);
        expect(gap * arc, `${a.villagerId}/${b.villagerId}`).toBeGreaterThanOrEqual(clearance);
      }
    }
  });

  it("C5 every tier subset has someone who stops to watch the river", () => {
    for (const n of tierCounts) expect(LOY_KRATHONG_VILLAGERS.slice(0, n).some((v) => v.watch !== null), String(n)).toBe(true);
  });

  it("C6 silhouettes (owner 2026-11-25): every part uses the one silhouette colour; some HIGH villagers wear a hat", () => {
    for (const part of Object.values(VILLAGER_PARTS)) {
      expect(part.material.color).toBe(VILLAGER_LOOK.silhouette);
      expect(part.material.emissive).toBeUndefined();
      expect(part.castShadow).toBe(false);
      expect(part.receiveShadow).toBe(false);
    }
    expect(VILLAGER_MATERIAL.color).toBe(VILLAGER_LOOK.silhouette);
    const high = LOY_KRATHONG_VILLAGERS.slice(0, LIVING_WORLD_TIERS.HIGH.villagerCount);
    expect(high.some((v) => v.hat)).toBe(true);
    expect(high.some((v) => !v.hat)).toBe(true);
  });

  it("C7 villagers stay in the village stretch", () => {
    const houses = LOY_KRATHONG_RIVER_ENVIRONMENT.houses.map((h) => h.progress);
    const from = Math.min(...houses) - VILLAGE_STRETCH_MARGIN;
    const to = Math.max(...houses) + VILLAGE_STRETCH_MARGIN;
    for (const v of LOY_KRATHONG_VILLAGERS) {
      expect(v.fromProgress).toBeGreaterThanOrEqual(from);
      expect(v.toProgress).toBeLessThanOrEqual(to);
    }
  });

  it("C8 derived silhouette size; every part is low detail", () => {
    expect(VILLAGER_HEIGHT).toBeCloseTo(0.345, 12);
    expect(VILLAGER_FOOTPRINT_RADIUS).toBe(0.085);
    for (const [name, part] of Object.entries(VILLAGER_PARTS)) {
      const g = createPartGeometry(part.geometry);
      expect(countTriangles(g), name).toBeLessThanOrEqual(ENVIRONMENT_PART_MAX_TRIANGLES);
      g.dispose();
    }
    expect(VILLAGER_BLOB_SHADOW_RADIUS).toBeGreaterThan(0);
    for (const value of Object.values(VILLAGER_MOTION)) expect(value).toBeGreaterThan(0);
  });
});

describe("ambient life config (MFW-50 AC3, AC4)", () => {
  it("C9 values are finite and positive where they are sizes or periods; motes stay on the banks", () => {
    expect(LANTERN_FLICKER.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 12);
    expect(LANTERN_FLICKER.amplitude).toBeGreaterThan(0);
    expect(LANTERN_FLICKER.amplitude).toBeLessThan(1);
    for (const c of LANTERN_FLICKER.components) {
      expect(c.weight).toBeGreaterThan(0);
      expect(Number.isFinite(c.phaseRad)).toBe(true);
    }
    for (const [key, value] of Object.entries(AMBIENT_MOTES)) {
      expect(Number.isFinite(value), key).toBe(true);
      if (!key.startsWith("progress")) expect(value, key).toBeGreaterThan(0);
    }
    expect(AMBIENT_MOTES.setbackMin).toBeLessThan(AMBIENT_MOTES.setbackMax);
    expect(AMBIENT_MOTES.setbackMax).toBeLessThan(LOY_KRATHONG_RIVER_ENVIRONMENT.bankWidth);
    expect(AMBIENT_MOTES.heightMin).toBeLessThan(AMBIENT_MOTES.heightMax);
    expect(AMBIENT_MOTES.pulseMinScale).toBeLessThan(1);
    expect(AMBIENT_MOTES.progressFrom).toBeLessThan(AMBIENT_MOTES.progressTo);
    expect(AMBIENT_MOTE_FAN.rings).toBe(1); // alpha 1 at the centre → 0 at the rim: a soft point
    for (const o of [AMBIENT_MOTES, AMBIENT_MOTE_FAN, LANTERN_FLICKER, LANTERN_FLICKER.components, VILLAGER_MOTION]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
  });

  it("C10 WCAG 2.3.1: every luminance-changing period is ≥ 1000/3 ms", () => {
    const minPeriod = MS_PER_SECOND / WCAG_MAX_FLASHES_PER_SECOND;
    for (const c of LANTERN_FLICKER.components) expect(c.periodMs).toBeGreaterThanOrEqual(minPeriod);
    expect(AMBIENT_MOTES.pulsePeriodMs).toBeGreaterThanOrEqual(minPeriod);
  });
});
