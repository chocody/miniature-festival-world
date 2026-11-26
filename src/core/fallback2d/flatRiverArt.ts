import { FLAT_SHORE_BAND_STEPS } from "@/config/fallback2d.config";
import { VILLAGER_BLOB_SHADOW_RADIUS } from "@/config/events/loyKrathong.life.config";
import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  PIER_DECK_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_BANK_PROFILE,
  RIVER_ENVIRONMENT_BLOB_SHADOWS,
  RIVER_WATER_HIGHLIGHTS,
} from "@/config/events/loyKrathong.river.config";
import { RIVER_KRATHONG_BLOB_SHADOW_RADIUS, WATER_HIGHLIGHT_LOOK, type LightPresetId } from "@/config/look.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import type { WorldXZ } from "@/core/coordinates/types";
import type { HouseRoofKind } from "@/core/world/riverEnvironment"; // type-only
import type { TreeShapeId } from "@/core/world/riversideFoliage"; // type-only
import { createFlatLightContext, type FlatVec3 } from "./flatLight";
import { createFlatLaneFrameOut, flatLaneFrameInto } from "./flatLane";
import { polygonPath } from "./flatPath";
import {
  flatBushShapes,
  flatHouseShapes,
  flatLampShapes,
  flatReedShapes,
  flatRockShapes,
  flatTreeShapes,
  flatVillagerShapes,
  type FlatArtShape,
} from "./flatProps2d";
import type { FlatProp, FlatRiverScene } from "./flatRiverScene";
import type { FlatVillager } from "./flatVillagers";
import type { FlatSpriteView } from "./spriteProjection";
import { worldToCanvas, type TopDownProjection } from "./topDownProjection";

/** One riverside prop on the map: canvas ground point (x, y) and px per local unit; shapes in local units (flatProps2d). */
export interface FlatSprite {
  readonly key: string;
  readonly kind: "house" | "tree" | "bush" | "rock" | "lamp" | "reed" | "villager";
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly shapes: readonly FlatArtShape[];
  readonly roof?: HouseRoofKind;
  readonly treeShape?: TreeShapeId;
}
/** Soft blob shadow ellipse, canvas px. */
export interface FlatBlob {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly rotationDeg: number;
}
/** The whole static 2D map in canvas px (except sprite shapes). Derived at render time, NEVER persisted. */
export interface FlatRiverArt {
  readonly groundFill: string;
  readonly bankBands: readonly FlatArtShape[];
  readonly water: FlatArtShape;
  readonly shoreBands: readonly FlatArtShape[];
  readonly blobs: readonly FlatBlob[];
  readonly pier: FlatArtShape;
  readonly farSprites: readonly FlatSprite[]; // far bank (side −1): drawn under the krathongs
  readonly nearSprites: readonly FlatSprite[]; // near bank (side 1): drawn over them (3/4 occlusion)
  readonly krathongBlobRadiusPx: number;
  readonly pierTipX: number;
}

const UP: FlatVec3 = [0, 1, 0];
const SIDES = [-1, 1] as const;
const HALF = 2;
const MID_PROGRESS = 0.5;
const STEP_CENTRE = 0.5;
const DEG_PER_RAD = 180 / Math.PI;

/**
 * Static art of the 2D river (MFW-51): the preset-lit ground, sloped bank bands (RIVER_BANK_PROFILE), water, shore highlight,
 * pier, blob shadows and the riverside sprites — every position from the shared scene / villager twins (invariant B), every
 * colour from the shared materials lit by the preset (flatLight). Pure; result frozen. Built once per (scene, projection, preset).
 */
export function buildFlatRiverArt(
  scene: FlatRiverScene,
  villagers: readonly FlatVillager[],
  projection: TopDownProjection,
  preset: LightPresetId,
  view: FlatSpriteView,
): FlatRiverArt {
  const ctx = createFlatLightContext(view, preset);
  const toCanvas = (p: WorldXZ) => worldToCanvas(p, projection);
  const ribbon = (latA: number, latB: number): string => {
    const n = LOY_KRATHONG_RIVER_ENVIRONMENT.ribbonSegments;
    const f = createFlatLaneFrameOut();
    const a: WorldXZ[] = [];
    const b: WorldXZ[] = [];
    for (let i = 0; i <= n; i++) {
      flatLaneFrameInto(scene.channel, i / n, f);
      a.push({ x: f.cx + f.rx * latA, z: f.cz + f.rz * latA });
      b.push({ x: f.cx + f.rx * latB, z: f.cz + f.rz * latB });
    }
    return polygonPath([...a, ...b.reverse()].map(toCanvas));
  };
  const half = scene.channel.width / HALF;

  const mid = createFlatLaneFrameOut();
  flatLaneFrameInto(scene.channel, MID_PROGRESS, mid); // technical: one flat colour per band
  const bankBands: FlatArtShape[] = [];
  for (const s of SIDES) {
    for (let k = 0; k + 1 < RIVER_BANK_PROFILE.length; k++) {
      const p0 = RIVER_BANK_PROFILE[k];
      const p1 = RIVER_BANK_PROFILE[k + 1];
      const dy = p1.y - p0.y;
      if (dy === 0) continue; // flat segments = the ground fill
      const normal: FlatVec3 = [-s * mid.rx * dy, p1.offset - p0.offset, -s * mid.rz * dy];
      bankBands.push(Object.freeze({ d: ribbon(s * (half + p0.offset), s * (half + p1.offset)), fill: ctx.lit(RIVER_BANK_MATERIAL.color, normal) }));
    }
  }

  const bw = RIVER_WATER_HIGHLIGHTS.shore.bandWidth;
  const shoreBands: FlatArtShape[] = [];
  for (const s of SIDES) {
    for (let j = 0; j < FLAT_SHORE_BAND_STEPS; j++) {
      const a = (bw * j) / FLAT_SHORE_BAND_STEPS;
      const b = (bw * (j + 1)) / FLAT_SHORE_BAND_STEPS;
      shoreBands.push(
        Object.freeze({
          d: ribbon(s * (half - a), s * (half - b)),
          fill: WATER_HIGHLIGHT_LOOK.color,
          opacity: WATER_HIGHLIGHT_LOOK.shoreOpacity * (1 - (j + STEP_CENTRE) / FLAT_SHORE_BAND_STEPS),
        }),
      );
    }
  }

  const blobs: FlatBlob[] = [];
  const propBlob = (p: FlatProp, r: { readonly radiusX: number; readonly radiusZ: number }) => {
    const c = toCanvas(p);
    blobs.push(
      Object.freeze({
        cx: c.x,
        cy: c.y,
        rx: r.radiusX * p.scale * projection.scale,
        ry: r.radiusZ * p.scale * projection.scale,
        rotationDeg: -p.yawRad * DEG_PER_RAD,
      }),
    );
  };
  scene.houses.forEach((p) => propBlob(p, RIVER_ENVIRONMENT_BLOB_SHADOWS.houses));
  scene.trees.forEach((p) => propBlob(p, RIVER_ENVIRONMENT_BLOB_SHADOWS.trees));
  scene.lamps.forEach((p) => propBlob(p, RIVER_ENVIRONMENT_BLOB_SHADOWS.lamps));
  for (const v of villagers) {
    const c = toCanvas(v);
    const r = VILLAGER_BLOB_SHADOW_RADIUS * projection.scale;
    blobs.push(Object.freeze({ cx: c.x, cy: c.y, rx: r, ry: r, rotationDeg: 0 }));
  }

  const sprites: FlatSprite[] = [];
  const sides: number[] = []; // parallel to sprites
  const addProp = (
    kind: FlatSprite["kind"],
    index: number,
    p: FlatProp,
    shapes: readonly FlatArtShape[],
    extra: Pick<FlatSprite, "roof" | "treeShape"> = {},
  ) => {
    const c = toCanvas(p);
    sprites.push(Object.freeze({ key: `${kind}-${index}`, kind, x: c.x, y: c.y, scale: p.scale * projection.scale, shapes, ...extra }));
    sides.push(p.side);
  };
  scene.houses.forEach((p, i) => addProp("house", i, p, flatHouseShapes(p.roof, p.yawRad, ctx), { roof: p.roof }));
  scene.trees.forEach((p, i) => addProp("tree", i, p, flatTreeShapes(p.shape, p.yawRad, ctx), { treeShape: p.shape }));
  scene.bushes.forEach((p, i) => addProp("bush", i, p, flatBushShapes(p.yawRad, ctx)));
  const rock = flatRockShapes(ctx);
  scene.rocks.forEach((p, i) => addProp("rock", i, p, rock));
  const lamp = flatLampShapes(ctx);
  scene.lamps.forEach((p, i) => addProp("lamp", i, p, lamp));
  scene.plants.forEach((p, i) => addProp("reed", i, p, flatReedShapes(p.yawRad, ctx)));
  villagers.forEach((v, i) => {
    const c = toCanvas(v);
    sprites.push(
      Object.freeze({ key: `villager-${i}`, kind: "villager" as const, x: c.x, y: c.y, scale: v.scale * projection.scale, shapes: flatVillagerShapes(v.hat, ctx) }),
    );
    sides.push(v.side);
  });
  const bySide = (side: number) =>
    Object.freeze(
      sprites
        .map((s, k) => ({ s, k }))
        .filter(({ k }) => sides[k] === side)
        .sort((a, b) => a.s.y - b.s.y || a.k - b.k)
        .map(({ s }) => s),
    );

  return Object.freeze({
    groundFill: ctx.lit(RIVER_BANK_MATERIAL.color, UP),
    bankBands: Object.freeze(bankBands),
    water: Object.freeze({ d: polygonPath(scene.waterOutline.map(toCanvas)), fill: ctx.lit(TOY_MATTE_MATERIALS.water.color, UP) }),
    shoreBands: Object.freeze(shoreBands),
    blobs: Object.freeze(blobs),
    pier: Object.freeze({ d: polygonPath(scene.pierDeck.map(toCanvas)), fill: ctx.lit(PIER_DECK_MATERIAL.color, UP) }),
    farSprites: bySide(-1),
    nearSprites: bySide(1),
    krathongBlobRadiusPx: RIVER_KRATHONG_BLOB_SHADOW_RADIUS * projection.scale,
    pierTipX: toCanvas(scene.pierTip).x,
  });
}
