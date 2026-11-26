import { FLAT_BLOB_GRADIENT_STOPS, FLAT_SPHERE_HIGHLIGHT } from "@/config/fallback2d.config";
import { VILLAGER_MATERIAL, VILLAGER_PARTS } from "@/config/events/loyKrathong.life.config";
import {
  HOUSE_FACADE,
  LOY_KRATHONG_BUSH_CLUMPS,
  LOY_KRATHONG_TREE_SHAPES,
  RIVER_ENVIRONMENT_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { BLOB_SHADOW_LOOK, VILLAGE_LIGHTS } from "@/config/look.config";
import type { FoliageClumpDefinition } from "@/core/world/foliageExtent";
import type { HouseRoofKind } from "@/core/world/riverEnvironment"; // type-only
import type { TreeShapeId } from "@/core/world/riversideFoliage"; // type-only
import { rotateYaw, type FlatLightContext, type FlatVec3 } from "./flatLight";
import { circlePath, ellipsePath, polygonPath, roundedPolygonPath, type FlatPoint2D } from "./flatPath";
import { projectModelPoint, type ProjectedPoint2D } from "./spriteProjection";

/**
 * Riverside prop sprites of the 2D map (MFW-51): small 3/4 views anchored at the prop's ground point, built from the SAME 3D part
 * numbers (RIVER_ENVIRONMENT_PARTS, HOUSE_FACADE, LOY_KRATHONG_TREE_SHAPES, VILLAGER_PARTS) and lit like 3D (flatLight). Shapes are
 * in the sprite's local units (the caller scales them by instance scale × map scale), y down, back to front. Pure, three-free.
 */
export interface FlatArtShape {
  readonly d: string;
  readonly fill: string;
  readonly opacity?: number;
}

const HALF = 2;
const TAU = 2 * Math.PI;

interface Face {
  readonly corners: readonly FlatVec3[];
  readonly normal: FlatVec3;
}

const dot = (a: FlatVec3, b: FlatVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: FlatVec3, b: FlatVec3): FlatVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: FlatVec3, b: FlatVec3): FlatVec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const freezeShapes = (shapes: FlatArtShape[]): readonly FlatArtShape[] => Object.freeze(shapes.map((s) => Object.freeze(s)));

function projector(ctx: FlatLightContext, yawRad: number) {
  const view = { azimuthRad: ctx.view.azimuthRad, elevationRad: ctx.view.elevationRad, modelYawRad: yawRad };
  return (p: FlatVec3): ProjectedPoint2D => projectModelPoint(p, view);
}

/** Visible faces (world normal toward the camera), sorted back to front by mean projected depth. */
function visibleFaces(faces: readonly Face[], yawRad: number, ctx: FlatLightContext, project: (p: FlatVec3) => ProjectedPoint2D) {
  return faces
    .map((face, k) => {
      const world = rotateYaw(face.normal, yawRad);
      const points = face.corners.map(project);
      return { face, k, world, points, depth: points.reduce((s, p) => s + p.depth, 0) / points.length };
    })
    .filter((f) => dot(f.world, ctx.cameraDir) > 0)
    .sort((a, b) => a.depth - b.depth || a.k - b.k);
}

/** Axis-aligned quad in the plane z = z0, centre (cx, cy), size w × h. */
function frontQuad(cx: number, cy: number, z0: number, w: number, h: number): FlatVec3[] {
  return [
    [cx - w / HALF, cy - h / HALF, z0],
    [cx + w / HALF, cy - h / HALF, z0],
    [cx + w / HALF, cy + h / HALF, z0],
    [cx - w / HALF, cy + h / HALF, z0],
  ];
}

/** House: rounded body faces (door and windows on the front face), then the pyramid or gable roof. */
export function flatHouseShapes(roof: HouseRoofKind, yawRad: number, ctx: FlatLightContext): readonly FlatArtShape[] {
  const { houseBody, houseRoof, houseRoofGable, houseDoor, houseWindow } = RIVER_ENVIRONMENT_PARTS;
  const project = projector(ctx, yawRad);
  const g = houseBody.geometry;
  const hw = g.width / HALF;
  const hd = g.depth / HALF;
  const y0 = houseBody.yOffset - g.height / HALF;
  const y1 = houseBody.yOffset + g.height / HALF;
  const FRONT = 0;
  const body: Face[] = [
    { corners: [[-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd]], normal: [0, 0, 1] },
    { corners: [[hw, y0, -hd], [-hw, y0, -hd], [-hw, y1, -hd], [hw, y1, -hd]], normal: [0, 0, -1] },
    { corners: [[hw, y0, hd], [hw, y0, -hd], [hw, y1, -hd], [hw, y1, hd]], normal: [1, 0, 0] },
    { corners: [[-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd]], normal: [-1, 0, 0] },
  ];
  const shapes: FlatArtShape[] = [];
  for (const f of visibleFaces(body, yawRad, ctx, project)) {
    shapes.push({ d: roundedPolygonPath(f.points, g.radius), fill: ctx.lit(houseBody.material.color, f.world) });
    if (f.k !== FRONT) continue;
    const door = HOUSE_FACADE.door;
    shapes.push({
      d: polygonPath(frontQuad(door.x, door.y, door.z, houseDoor.geometry.width, houseDoor.geometry.height).map(project)),
      fill: ctx.lit(houseDoor.material.color, f.world),
    });
    for (const w of HOUSE_FACADE.windows) {
      shapes.push({
        d: polygonPath(frontQuad(w.x, w.y, w.z, houseWindow.geometry.width, houseWindow.geometry.height).map(project)),
        fill: ctx.lit(houseWindow.material.color, f.world, houseWindow.material.emissive, VILLAGE_LIGHTS[ctx.preset].windowEmissiveIntensity),
      });
    }
  }
  let roofFaces: Face[];
  let roofColor: string;
  if (roof === "pyramid") {
    const rg = houseRoof.geometry;
    const yb = houseRoof.yOffset - rg.height / HALF;
    const apex: FlatVec3 = [0, houseRoof.yOffset + rg.height / HALF, 0];
    const corner = (k: number): FlatVec3 => {
      const theta = (TAU * k) / rg.radialSegments + houseRoof.yawOffsetRad;
      return [rg.radius * Math.sin(theta), yb, rg.radius * Math.cos(theta)];
    };
    roofFaces = Array.from({ length: rg.radialSegments }, (_, k) => {
      const a = corner(k);
      const b = corner(k + 1);
      return { corners: [a, b, apex], normal: cross(sub(b, a), sub(apex, a)) };
    });
    roofColor = houseRoof.material.color;
  } else {
    const rg = houseRoofGable.geometry;
    const w = rg.width / HALF;
    const d = rg.depth / HALF;
    const r0 = houseRoofGable.yOffset - rg.height / HALF;
    const r1 = houseRoofGable.yOffset + rg.height / HALF;
    roofFaces = [
      { corners: [[-w, r0, d], [w, r0, d], [w, r1, 0], [-w, r1, 0]], normal: [0, d, rg.height] },
      { corners: [[w, r0, -d], [-w, r0, -d], [-w, r1, 0], [w, r1, 0]], normal: [0, d, -rg.height] },
      { corners: [[w, r0, d], [w, r0, -d], [w, r1, 0]], normal: [1, 0, 0] },
      { corners: [[-w, r0, -d], [-w, r0, d], [-w, r1, 0]], normal: [-1, 0, 0] },
    ];
    roofColor = houseRoofGable.material.color;
  }
  for (const f of visibleFaces(roofFaces, yawRad, ctx, project)) shapes.push({ d: polygonPath(f.points), fill: ctx.lit(roofColor, f.world) });
  return freezeShapes(shapes);
}

/** Two-tone clay spheres of a clump list, back to front: a body circle and a highlight circle toward the key light. */
function clumpShapes(clumps: readonly FoliageClumpDefinition[], yawRad: number, ctx: FlatLightContext, color: string): FlatArtShape[] {
  const project = projector(ctx, yawRad);
  const body = ctx.lit(color, ctx.cameraDir);
  const c = ctx.cameraDir;
  const k = ctx.keyDir;
  const highlight = ctx.lit(color, [c[0] + k[0], c[1] + k[1], c[2] + k[2]]);
  const shapes: FlatArtShape[] = [];
  const sorted = clumps
    .map((clump, i) => ({ clump, i, p: project([clump.x, clump.y, clump.z]) }))
    .sort((a, b) => a.p.depth - b.p.depth || a.i - b.i);
  for (const { clump, p } of sorted) {
    const r = clump.radius;
    shapes.push({ d: circlePath(p.x, p.y, r), fill: body });
    shapes.push({
      d: circlePath(
        p.x + ctx.keyScreenDir.x * r * FLAT_SPHERE_HIGHLIGHT.offset,
        p.y + ctx.keyScreenDir.y * r * FLAT_SPHERE_HIGHLIGHT.offset,
        r * FLAT_SPHERE_HIGHLIGHT.radius,
      ),
      fill: highlight,
    });
  }
  return shapes;
}

/** Tapered post between two heights on the sprite's vertical axis (screen x offsets only). */
function taperedPost(bottom: FlatPoint2D, top: FlatPoint2D, halfBottom: number, halfTop: number): string {
  return polygonPath([
    { x: bottom.x - halfBottom, y: bottom.y },
    { x: bottom.x + halfBottom, y: bottom.y },
    { x: top.x + halfTop, y: top.y },
    { x: top.x - halfTop, y: top.y },
  ]);
}

/** Tree: bent trunk, then the crown's leaf clumps (MFW-70 shapes). */
export function flatTreeShapes(shape: TreeShapeId, yawRad: number, ctx: FlatLightContext): readonly FlatArtShape[] {
  const { treeTrunk, leafClump } = RIVER_ENVIRONMENT_PARTS;
  const def = LOY_KRATHONG_TREE_SHAPES[shape];
  const t = treeTrunk.geometry;
  const ts = def.trunkScale;
  const project = projector(ctx, yawRad);
  const trunk: FlatArtShape = {
    d: taperedPost(project([0, 0, 0]), project([t.bend * ts, t.height * ts, 0]), t.radiusBottom * ts, t.radiusTop * ts),
    fill: ctx.lit(treeTrunk.material.color, ctx.cameraHorizontalDir),
  };
  return freezeShapes([trunk, ...clumpShapes(def.clumps, yawRad, ctx, leafClump.material.color)]);
}

/** Bush: the bush clumps, no trunk. */
export function flatBushShapes(yawRad: number, ctx: FlatLightContext): readonly FlatArtShape[] {
  return freezeShapes(clumpShapes(LOY_KRATHONG_BUSH_CLUMPS, yawRad, ctx, RIVER_ENVIRONMENT_PARTS.leafClump.material.color));
}

/** Rock: one flattened ellipse. */
export function flatRockShapes(ctx: FlatLightContext): readonly FlatArtShape[] {
  const { rock } = RIVER_ENVIRONMENT_PARTS;
  const c = projector(ctx, 0)([0, rock.yOffset, 0]);
  const r = rock.geometry.radius;
  const ry = r * Math.hypot((rock.geometry.scaleY ?? 1) * Math.cos(ctx.view.elevationRad), Math.sin(ctx.view.elevationRad));
  return freezeShapes([{ d: ellipsePath(c.x, c.y, r, ry), fill: ctx.lit(rock.material.color, ctx.cameraDir) }]);
}

/** Lamp: post and head; the head glows at NIGHT (VILLAGE_LIGHTS, emissive only, no halo). */
export function flatLampShapes(ctx: FlatLightContext): readonly FlatArtShape[] {
  const { lampPost, lampHead } = RIVER_ENVIRONMENT_PARTS;
  const project = projector(ctx, 0);
  const pg = lampPost.geometry;
  const head = project([0, lampHead.yOffset, 0]);
  return freezeShapes([
    {
      d: taperedPost(project([0, lampPost.yOffset - pg.height / HALF, 0]), project([0, lampPost.yOffset + pg.height / HALF, 0]), pg.radiusBottom, pg.radiusTop),
      fill: ctx.lit(lampPost.material.color, ctx.cameraHorizontalDir),
    },
    {
      d: circlePath(head.x, head.y, lampHead.geometry.radius),
      fill: ctx.lit(lampHead.material.color, ctx.cameraDir, lampHead.material.emissive, VILLAGE_LIGHTS[ctx.preset].lanternEmissiveIntensity),
    },
  ]);
}

/** Reed / grass tuft: one leaning triangle per blade (FULL blades), back to front. */
export function flatReedShapes(yawRad: number, ctx: FlatLightContext): readonly FlatArtShape[] {
  const { riversidePlant } = RIVER_ENVIRONMENT_PARTS;
  const project = projector(ctx, yawRad);
  const fill = ctx.lit(riversidePlant.material.color, ctx.cameraHorizontalDir);
  const blades = riversidePlant.geometry.blades.map((b, i) => {
    const ux = Math.cos(b.angleRad);
    const uz = -Math.sin(b.angleRad);
    const base3: FlatVec3 = [b.distance * ux, riversidePlant.yOffset, b.distance * uz];
    const sinLean = Math.sin(b.leanRad);
    const cosLean = Math.cos(b.leanRad);
    const tip3: FlatVec3 = [base3[0] + b.height * sinLean * ux, base3[1] + b.height * cosLean, base3[2] + b.height * sinLean * uz];
    return { b, i, base: project(base3), tip: project(tip3) };
  });
  blades.sort((a, b) => a.base.depth - b.base.depth || a.i - b.i);
  return freezeShapes(
    blades.map(({ b, base, tip }) => ({
      d: polygonPath([{ x: base.x - b.width / HALF, y: base.y }, tip, { x: base.x + b.width / HALF, y: base.y }]),
      fill,
    })),
  );
}

/** MFW-50 villager silhouette: body, head and an optional conical hat, all one muted colour. */
export function flatVillagerShapes(hat: boolean, ctx: FlatLightContext): readonly FlatArtShape[] {
  const { body, head, hat: hatPart } = VILLAGER_PARTS;
  const project = projector(ctx, 0);
  const fill = ctx.lit(VILLAGER_MATERIAL.color, ctx.cameraDir);
  const bg = body.geometry;
  const headCentre = project([0, head.yOffset, 0]);
  const shapes: FlatArtShape[] = [
    {
      d: taperedPost(project([0, body.yOffset - bg.height / HALF, 0]), project([0, body.yOffset + bg.height / HALF, 0]), bg.radiusBottom, bg.radiusTop),
      fill,
    },
    { d: circlePath(headCentre.x, headCentre.y, head.geometry.radius), fill },
  ];
  if (hat) {
    const hg = hatPart.geometry;
    const brim = project([0, hatPart.yOffset - hg.height / HALF, 0]);
    const apex = project([0, hatPart.yOffset + hg.height / HALF, 0]);
    shapes.push({ d: polygonPath([{ x: brim.x - hg.radius, y: brim.y }, { x: brim.x + hg.radius, y: brim.y }, apex]), fill });
  }
  return freezeShapes(shapes);
}

/** Blob-shadow radial gradient stops: the 3D fan's alpha opacity·(1 − t)^falloffExponent, unlit tint (like the 3D blob). */
export function flatBlobGradientStops(): readonly { readonly offset: number; readonly color: string; readonly opacity: number }[] {
  return Object.freeze(
    Array.from({ length: FLAT_BLOB_GRADIENT_STOPS }, (_, k) => {
      const t = k / (FLAT_BLOB_GRADIENT_STOPS - 1);
      return Object.freeze({
        offset: t,
        color: BLOB_SHADOW_LOOK.color,
        opacity: BLOB_SHADOW_LOOK.opacity * (1 - t) ** BLOB_SHADOW_LOOK.falloffExponent,
      });
    }),
  );
}
