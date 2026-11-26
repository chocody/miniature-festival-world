// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FLAT_KRATHONG_VIEW_AZIMUTH_RAD,
  FLAT_KRATHONG_VIEW_ELEVATION_RAD,
  FLAT_RIVER_VILLAGER_COUNT,
  FLAT_SHORE_BAND_STEPS,
} from "@/config/fallback2d.config";
import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_TREES,
  PIER_DECK_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_BANK_PROFILE,
  RIVER_ENVIRONMENT_BLOB_SHADOWS,
} from "@/config/events/loyKrathong.river.config";
import { LIGHT_PRESETS, RIVER_KRATHONG_BLOB_SHADOW_RADIUS, WATER_HIGHLIGHT_LOOK } from "@/config/look.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import { flatSurfaceColor } from "./flatLight";
import { buildFlatRiverArt, type FlatSprite } from "./flatRiverArt";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";
import { worldToCanvas } from "./topDownProjection";

const VIEW = { azimuthRad: FLAT_KRATHONG_VIEW_AZIMUTH_RAD, elevationRad: FLAT_KRATHONG_VIEW_ELEVATION_RAD };
const { scene, projection, villagers } = getLoyKrathongFlatRiver();
const day = buildFlatRiverArt(scene, villagers, projection, "DAY", VIEW);
const night = buildFlatRiverArt(scene, villagers, projection, "NIGHT", VIEW);
const sprites = [...day.farSprites, ...day.nearSprites];
const ofKind = (kind: FlatSprite["kind"]) => sprites.filter((s) => s.kind === kind);
const indexOf = (s: FlatSprite) => Number(s.key.slice(s.key.lastIndexOf("-") + 1));
const UP = [0, 1, 0] as const;

describe("flat river art (MFW-51)", () => {
  it("T41 one sprite per prop of the shared scene; LOW villager count", () => {
    expect(ofKind("house")).toHaveLength(scene.houses.length);
    expect(ofKind("tree")).toHaveLength(scene.trees.length);
    expect(ofKind("bush")).toHaveLength(scene.bushes.length);
    expect(ofKind("rock")).toHaveLength(scene.rocks.length);
    expect(ofKind("lamp")).toHaveLength(scene.lamps.length);
    expect(ofKind("reed")).toHaveLength(scene.plants.length);
    expect(ofKind("villager")).toHaveLength(FLAT_RIVER_VILLAGER_COUNT);
    expect(new Set(sprites.map((s) => s.key)).size).toBe(sprites.length);
  });

  it("T42 far bank under the krathongs, near bank over them, each sorted by y", () => {
    const sideOf = (s: FlatSprite): number => {
      const i = indexOf(s);
      switch (s.kind) {
        case "house":
          return scene.houses[i].side;
        case "tree":
          return scene.trees[i].side;
        case "bush":
          return scene.bushes[i].side;
        case "rock":
          return scene.rocks[i].side;
        case "lamp":
          return scene.lamps[i].side;
        case "reed":
          return scene.plants[i].side;
        case "villager":
          return villagers[i].side;
      }
    };
    expect(day.farSprites.every((s) => sideOf(s) === -1)).toBe(true);
    expect(day.nearSprites.every((s) => sideOf(s) === 1)).toBe(true);
    for (const list of [day.farSprites, day.nearSprites]) {
      for (let i = 1; i < list.length; i++) expect(list[i].y).toBeGreaterThanOrEqual(list[i - 1].y);
    }
  });

  it("T43 roofs and tree shapes come from the config", () => {
    for (const s of ofKind("house")) expect(s.roof).toBe(LOY_KRATHONG_RIVER_ENVIRONMENT.houses[indexOf(s)].roof);
    for (const s of ofKind("tree")) expect(s.treeShape).toBe(LOY_KRATHONG_TREES[indexOf(s)].shape);
    expect(new Set(ofKind("house").map((s) => s.roof))).toEqual(new Set(["pyramid", "gable"]));
    expect(new Set(ofKind("tree").map((s) => s.treeShape))).toEqual(new Set(["round", "tall"]));
  });

  it("T44 sloped bank bands and the stepped shore highlight", () => {
    let sloped = 0;
    for (let k = 0; k + 1 < RIVER_BANK_PROFILE.length; k++) if (RIVER_BANK_PROFILE[k].y !== RIVER_BANK_PROFILE[k + 1].y) sloped++;
    expect(day.bankBands).toHaveLength(2 * sloped);
    expect(day.shoreBands).toHaveLength(2 * FLAT_SHORE_BAND_STEPS);
    day.shoreBands.forEach((b, i) => {
      const j = i % FLAT_SHORE_BAND_STEPS;
      expect(b.fill).toBe(WATER_HIGHLIGHT_LOOK.color);
      expect(b.opacity).toBeCloseTo(WATER_HIGHLIGHT_LOOK.shoreOpacity * (1 - (j + 0.5) / FLAT_SHORE_BAND_STEPS), 12);
    });
  });

  it("T45 ground, water and pier = the shared materials lit by the preset", () => {
    for (const [preset, art] of [
      ["DAY", day],
      ["NIGHT", night],
    ] as const) {
      const lit = (albedo: string) => flatSurfaceColor({ albedo, normal: UP }, LIGHT_PRESETS[preset]);
      expect(art.groundFill).toBe(lit(RIVER_BANK_MATERIAL.color));
      expect(art.water.fill).toBe(lit(TOY_MATTE_MATERIALS.water.color));
      expect(art.pier.fill).toBe(lit(PIER_DECK_MATERIAL.color));
    }
  });

  it("T46 blob shadows under houses, trees, lamps and villagers", () => {
    expect(day.blobs).toHaveLength(scene.houses.length + scene.trees.length + scene.lamps.length + villagers.length);
    const h = scene.houses[0];
    expect(day.blobs[0].rx).toBeCloseTo(RIVER_ENVIRONMENT_BLOB_SHADOWS.houses.radiusX * h.scale * projection.scale, 12);
    expect(RIVER_ENVIRONMENT_BLOB_SHADOWS.houses.radiusX).toBe(0.56);
    const c = worldToCanvas(h, projection);
    expect(day.blobs[0].cx).toBe(c.x);
    expect(day.blobs[0].cy).toBe(c.y);
  });

  it("T47 krathong blob radius and the pier tip", () => {
    expect(day.krathongBlobRadiusPx).toBe(RIVER_KRATHONG_BLOB_SHADOW_RADIUS * projection.scale);
    expect(day.pierTipX).toBe(worldToCanvas(scene.pierTip, projection).x);
  });

  it("T48 pure and frozen; NIGHT relights the ground and the water", () => {
    expect(buildFlatRiverArt(scene, villagers, projection, "DAY", VIEW)).toEqual(day);
    expect(Object.isFrozen(day)).toBe(true);
    expect(Object.isFrozen(day.farSprites)).toBe(true);
    expect(day.nearSprites.every((s) => Object.isFrozen(s))).toBe(true);
    expect(night.groundFill).not.toBe(day.groundFill);
    expect(night.water.fill).not.toBe(day.water.fill);
  });
});
