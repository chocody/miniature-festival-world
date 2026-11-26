import type { RiverLane } from "@/core/coordinates";
import { bankSurfaceY, type BankProfilePoint } from "./bankProfile";
import type { FoliageClumpDefinition } from "./foliageExtent";
import { resolveBankPlacement, type BankPlacement, type InstanceTransform } from "./riverEnvironment";

// The extents live in a three-free module so the 2D fallback config can read them (fallback2d-import-graph.test.ts).
export * from "./foliageExtent";

/*
 * Riverside foliage (MFW-70, backlog 13.6): leaf-clump trees, two-clump bushes and blade tufts (reeds / grass) at the water
 * edge. Three-free; every position here is derived at render time from the bank placements (invariant A: never persisted).
 */

export type TreeShapeId = "round" | "tall";
export const TREE_SHAPE_IDS: readonly TreeShapeId[] = Object.freeze(["round", "tall"] as const);

export interface TreeShapeDefinition {
  readonly trunkScale: number; // finite > 0, multiplies the owner scale for the trunk
  readonly clumps: readonly FoliageClumpDefinition[]; // ≥ 1, at least one keepOnLow
}
export interface TreePlacement extends BankPlacement {
  readonly shape: TreeShapeId;
}
export interface RiversideFoliageDefinition {
  readonly trees: readonly TreePlacement[]; // the SAME array as RiverEnvironmentDefinition.trees (order = layout.trees)
  readonly treeShapes: Readonly<Record<TreeShapeId, TreeShapeDefinition>>;
  readonly bushClumps: readonly FoliageClumpDefinition[]; // ≥ 1, at least one keepOnLow
  readonly plants: readonly BankPlacement[]; // reeds and grass tufts (one shared tuft geometry)
  readonly clumpLumpAmplitude: number; // [0, 1): the leaf clump geometry's lumpAmplitude (for extents)
  readonly swayPhaseStepRad: number; // finite: phase of owner k = k × step
}
/** Render-time only (never persisted, invariant A). */
export interface FoliageInstance extends InstanceTransform {
  readonly swayPivotY: number; // world y where the sway shear is zero (the owner's base)
  readonly swayPhaseRad: number; // shared by every clump of one owner, so a tree leans as one piece
}
export interface RiversideFoliageLayout {
  readonly trunks: readonly InstanceTransform[]; // one per tree, same order as layout.trees
  readonly clumps: readonly FoliageInstance[]; // FULL: every tree's clumps (tree order, clump order), then every bush's
  readonly clumpsLow: readonly FoliageInstance[]; // LIGHT: the keepOnLow subset, same relative order
  readonly plants: readonly FoliageInstance[]; // every plant, definition order
}
/** Sway look per part (config: RIVER_FOLIAGE_SWAY). Horizontal shear = displacement per unit height above swayPivotY. */
export interface FoliageSwayParams {
  readonly shear: number; // finite ≥ 0
  readonly periodMs: number; // finite > 0
  readonly windDirX: number; // (windDirX, windDirZ) is a unit vector
  readonly windDirZ: number;
}

const FULL_TURN = 2 * Math.PI;

/** Horizontal shear at `timeMs`: shear · sin(2π·t / period + phase). Pure, allocation-free, never throws (runs per frame). */
export function foliageSwayShearAt(
  timeMs: number,
  phaseRad: number,
  sway: Pick<FoliageSwayParams, "shear" | "periodMs">,
): number {
  return sway.shear * Math.sin((FULL_TURN * timeMs) / sway.periodMs + phaseRad);
}

function assertClumps(clumps: readonly FoliageClumpDefinition[], name: string): void {
  if (clumps.length === 0) throw new RangeError(`${name} must have at least one clump`);
  if (!clumps.some((c) => c.keepOnLow)) throw new RangeError(`${name} must keep at least one clump on LOW (keepOnLow)`);
  clumps.forEach((c, i) => {
    for (const key of ["x", "y", "z", "radius", "yawRad"] as const) {
      if (!Number.isFinite(c[key])) throw new RangeError(`${name}[${i}].${key} must be finite`);
    }
    if (c.radius <= 0) throw new RangeError(`${name}[${i}].radius must be > 0`);
  });
}

export function assertRiversideFoliage(def: RiversideFoliageDefinition, treeCount: number, bankWidth: number): void {
  if (def.trees.length !== treeCount) throw new RangeError(`trees must have ${treeCount} entries (one per layout tree)`);
  def.trees.forEach((t, i) => {
    if (!TREE_SHAPE_IDS.includes(t.shape)) throw new RangeError(`trees[${i}].shape must be one of ${TREE_SHAPE_IDS.join(", ")}`);
  });
  for (const id of TREE_SHAPE_IDS) {
    const shape = def.treeShapes[id];
    if (!Number.isFinite(shape.trunkScale) || shape.trunkScale <= 0) {
      throw new RangeError(`treeShapes.${id}.trunkScale must be finite and > 0`);
    }
    assertClumps(shape.clumps, `treeShapes.${id}.clumps`);
  }
  assertClumps(def.bushClumps, "bushClumps");
  if (!Number.isFinite(def.clumpLumpAmplitude) || def.clumpLumpAmplitude < 0 || def.clumpLumpAmplitude >= 1) {
    throw new RangeError("clumpLumpAmplitude must be in [0, 1)");
  }
  if (!Number.isFinite(def.swayPhaseStepRad)) throw new RangeError("swayPhaseStepRad must be finite");
  def.plants.forEach((p, i) => {
    if (!Number.isFinite(p.setback) || p.setback < 0 || p.setback >= bankWidth) {
      throw new RangeError(`plants[${i}].setback must be >= 0 and < bankWidth`);
    }
  });
}

function placeClump(o: InstanceTransform, c: FoliageClumpDefinition, phaseRad: number): FoliageInstance {
  const cos = Math.cos(o.yawRad);
  const sin = Math.sin(o.yawRad);
  const s = o.scale;
  return Object.freeze({
    position: Object.freeze({
      x: o.position.x + c.x * s * cos + c.z * s * sin,
      y: o.position.y + c.y * s,
      z: o.position.z - c.x * s * sin + c.z * s * cos,
    }),
    yawRad: o.yawRad + c.yawRad,
    scale: c.radius * s,
    swayPivotY: o.position.y,
    swayPhaseRad: phaseRad,
  });
}

/**
 * Resolves the foliage once (deterministic). Owner k = trees, then bushes, then plants; owner k sways with phase
 * k × swayPhaseStepRad about its base height.
 */
export function resolveRiversideFoliage(
  env: {
    readonly channel: RiverLane;
    readonly bankProfile: readonly BankProfilePoint[];
    readonly trees: readonly InstanceTransform[];
    readonly bushes: readonly InstanceTransform[];
  },
  def: RiversideFoliageDefinition,
  bankWidth: number,
): RiversideFoliageLayout {
  assertRiversideFoliage(def, env.trees.length, bankWidth);
  const phase = (k: number) => k * def.swayPhaseStepRad;
  const trunks: InstanceTransform[] = [];
  const clumps: FoliageInstance[] = [];
  const clumpsLow: FoliageInstance[] = [];
  const addClumps = (o: InstanceTransform, list: readonly FoliageClumpDefinition[], k: number) => {
    for (const c of list) {
      const instance = placeClump(o, c, phase(k));
      clumps.push(instance);
      if (c.keepOnLow) clumpsLow.push(instance);
    }
  };
  env.trees.forEach((t, i) => {
    const shape = def.treeShapes[def.trees[i].shape];
    trunks.push(Object.freeze({ position: t.position, yawRad: t.yawRad, scale: t.scale * shape.trunkScale }));
    addClumps(t, shape.clumps, i);
  });
  env.bushes.forEach((b, j) => addClumps(b, def.bushClumps, env.trees.length + j));
  const plantBase = env.trees.length + env.bushes.length;
  const plants = def.plants.map((p, i) => {
    const t = resolveBankPlacement(env.channel, p, bankSurfaceY(env.bankProfile, p.setback));
    return Object.freeze({ ...t, swayPivotY: t.position.y, swayPhaseRad: phase(plantBase + i) });
  });
  return Object.freeze({
    trunks: Object.freeze(trunks),
    clumps: Object.freeze(clumps),
    clumpsLow: Object.freeze(clumpsLow),
    plants: Object.freeze(plants),
  });
}
