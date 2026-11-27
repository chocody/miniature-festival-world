import type { WorldVec3 } from "./types";

/**
 * Spec §4.3. File name follows §3; type name follows §4 (open question 8).
 * The zone is the row's `zone_id` column, not part of the coord (open question 7).
 * Converters and normal added in MFW-130 (zone rectangle, docs/plans/L17-new-year.md §B.1).
 */
export interface PlanarZoneCoord {
  readonly mode: "PLANAR_ZONE";
  readonly u: number; // [0, 1]
  readonly v: number; // [0, 1]
}

export const UV_RANGE = [0, 1] as const;

/**
 * World rectangle of one planar zone: P(u, v) = origin + u·uAxis + v·vAxis. Scene config, derived at render time,
 * NEVER persisted (invariant A). The axes are expected to be perpendicular; the converters stay exact for any
 * non-degenerate parallelogram.
 */
export interface PlanarZoneRect {
  readonly origin: WorldVec3; // world point at (u, v) = (0, 0)
  readonly uAxis: WorldVec3; // edge vector from (0,0) to (1,0); world units
  readonly vAxis: WorldVec3; // edge vector from (0,0) to (0,1); world units
}

/** Default hit tolerance in world units: numerical slack for exact analytic hits only. Tap callers pass a larger one. */
export const PLANAR_HIT_TOLERANCE_DEFAULT = 1e-9;

/** A rect is degenerate when |uAxis × vAxis| <= PLANAR_RECT_MIN_SINE · |uAxis| · |vAxis| (zero-length or (near-)parallel axes). */
export const PLANAR_RECT_MIN_SINE = 1e-6;

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function cross(a: Vec3Like, b: Vec3Like): WorldVec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function isFiniteVec(v: Vec3Like): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function assertValidRect(rect: PlanarZoneRect): void {
  if (!isFiniteVec(rect.origin) || !isFiniteVec(rect.uAxis) || !isFiniteVec(rect.vAxis)) {
    throw new RangeError("PlanarZoneRect components must be finite");
  }
  const n = cross(rect.uAxis, rect.vAxis);
  const nLen = Math.hypot(n.x, n.y, n.z);
  const uLen = Math.hypot(rect.uAxis.x, rect.uAxis.y, rect.uAxis.z);
  const vLen = Math.hypot(rect.vAxis.x, rect.vAxis.y, rect.vAxis.z);
  if (nLen <= PLANAR_RECT_MIN_SINE * uLen * vLen) {
    throw new RangeError("PlanarZoneRect is degenerate (zero-length or parallel axes)");
  }
}

function clamp01(x: number): number {
  return Math.min(UV_RANGE[1], Math.max(UV_RANGE[0], x));
}

function overshoot(x: number): number {
  return x < UV_RANGE[0] ? UV_RANGE[0] - x : x > UV_RANGE[1] ? x - UV_RANGE[1] : 0;
}

/**
 * PlanarZoneCoord → world point on the zone rectangle. u and v are not clamped: values outside [0, 1] are
 * extrapolated linearly (persisted coords are range-checked by parsePersistableCoord).
 * Allocates; per-frame callers must cache the result.
 */
export function planarCoordToWorld(coord: PlanarZoneCoord, rect: PlanarZoneRect): WorldVec3 {
  assertValidRect(rect);
  const { u, v } = coord;
  if (!Number.isFinite(u) || !Number.isFinite(v)) throw new RangeError("PlanarZoneCoord u and v must be finite");
  const { origin: o, uAxis: a, vAxis: b } = rect;
  return { x: o.x + u * a.x + v * b.x, y: o.y + u * a.y + v * b.y, z: o.z + u * a.z + v * b.z };
}

/**
 * World hit point → PlanarZoneCoord. `tolerance` is in world units and applies separately to the off-plane distance
 * and to the per-axis overshoot past an edge; beyond it the result is null, within it (u, v) is clamped to [0, 1].
 * Distances exactly equal to the tolerance are accepted. Allocates.
 */
export function worldToPlanarCoord(
  hit: WorldVec3,
  rect: PlanarZoneRect,
  tolerance: number = PLANAR_HIT_TOLERANCE_DEFAULT,
): PlanarZoneCoord | null {
  assertValidRect(rect);
  if (!isFiniteVec(hit)) throw new RangeError("hit components must be finite");
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("tolerance must be finite and >= 0");
  const { origin: o, uAxis: a, vAxis: b } = rect;
  const d: Vec3Like = { x: hit.x - o.x, y: hit.y - o.y, z: hit.z - o.z };
  const n = cross(a, b);
  const n2 = dot(n, n);
  const offPlane = Math.abs(dot(d, n)) / Math.sqrt(n2);
  if (offPlane > tolerance) return null;
  const uRaw = dot(cross(d, b), n) / n2;
  const vRaw = dot(cross(a, d), n) / n2;
  if (overshoot(uRaw) * Math.hypot(a.x, a.y, a.z) > tolerance) return null;
  if (overshoot(vRaw) * Math.hypot(b.x, b.y, b.z) > tolerance) return null;
  return { mode: "PLANAR_ZONE", u: clamp01(uRaw), v: clamp01(vRaw) };
}

/**
 * Unit normal of the zone plane, uAxis × vAxis (right-handed): u = right (+x), v = up (+y) gives +z.
 * A direction derived at render time, NEVER persisted. Allocates.
 */
export function planarSurfaceNormal(rect: PlanarZoneRect): WorldVec3 {
  assertValidRect(rect);
  const n = cross(rect.uAxis, rect.vAxis);
  const len = Math.hypot(n.x, n.y, n.z);
  return { x: n.x / len, y: n.y / len, z: n.z / len };
}
