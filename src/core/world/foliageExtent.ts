import type { FoliageBladeSpec } from "@/config/scene.config";

/*
 * Foliage extents (MFW-70). Kept free of value imports so the FALLBACK_2D config can size its trees from the same clump
 * layout as the 3D crowns without pulling three into the 2D chunk (fallback2d-import-graph.test.ts).
 */

/** One rounded leaf mass in its owner's local frame (local +Z faces the water), local units × owner scale. */
export interface FoliageClumpDefinition {
  readonly x: number; // clump centre, finite
  readonly y: number;
  readonly z: number;
  readonly radius: number; // finite > 0; = instance scale of the unit leaf-clump geometry (× owner scale)
  readonly yawRad: number; // finite; added to the owner's yaw (variety)
  readonly keepOnLow: boolean; // kept by the LIGHT variant (LOW)
}
/** Extent of a foliage owner in local units (× owner scale): horizontal radius from the base axis and top height. */
export interface FoliageExtent {
  readonly footprintRadius: number;
  readonly topY: number;
}

export function foliageClumpsExtent(clumps: readonly FoliageClumpDefinition[], lumpAmplitude: number): FoliageExtent {
  if (clumps.length === 0) throw new RangeError("foliage clumps must not be empty");
  let footprintRadius = -Infinity;
  let topY = -Infinity;
  for (const c of clumps) {
    const r = c.radius * (1 + lumpAmplitude);
    footprintRadius = Math.max(footprintRadius, Math.hypot(c.x, c.z) + r);
    topY = Math.max(topY, c.y + r);
  }
  return { footprintRadius, topY };
}

export function bladeTuftExtent(blades: readonly FoliageBladeSpec[]): FoliageExtent {
  if (blades.length === 0) throw new RangeError("blade tuft must not be empty");
  let footprintRadius = -Infinity;
  let topY = -Infinity;
  for (const b of blades) {
    footprintRadius = Math.max(footprintRadius, b.distance + b.height * Math.sin(b.leanRad) + b.width / 2);
    topY = Math.max(topY, b.height * Math.cos(b.leanRad));
  }
  return { footprintRadius, topY };
}
