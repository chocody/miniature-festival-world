import type { SplinePathCoord } from "./SplinePathCoord";
import type { NormalizedCylindricalCoord } from "./CylindricalCoord";
import type { PlanarZoneCoord } from "./PlanarGridCoord";

export const COORD_MODES = ["SPLINE_PATH", "CYLINDRICAL_SURFACE", "PLANAR_ZONE"] as const;
export type CoordMode = (typeof COORD_MODES)[number];

/** The ONLY shape a placement may be persisted in (DB `coord` JSONB, API payload, localStorage). Invariant A. */
export type PersistableCoord = SplinePathCoord | NormalizedCylindricalCoord | PlanarZoneCoord;

/** Derived at render time. NEVER persisted. */
export interface WorldXZ {
  readonly x: number;
  readonly z: number;
}
/** Derived 3D world point (world units, y-up). NEVER persisted. */
export interface WorldVec3 extends WorldXZ {
  readonly y: number;
}
