import { CatmullRomCurve3, Vector3 } from "three";
import { clamp01 } from "@/core/math/clamp01";
import { wrap01 } from "@/core/math/wrap01";
import type { WorldVec3, WorldXZ } from "./types";

/**
 * Spec §4.1. Persisted placement on a river lane. World positions are derived, never stored.
 * `createdAt` is the row's `created_at`, not a coord field.
 */
export interface SplinePathCoord {
  readonly mode: "SPLINE_PATH";
  readonly laneId: number; // integer >= 0
  readonly spawnProgress: number; // [0, 1]
  readonly speedFactor: number; // >= 0, progress per SECOND (open question 6)
  readonly lateralOffset: number; // [-0.5, 0.5], fraction of lane width
}

export const SPAWN_PROGRESS_RANGE = [0, 1] as const; // spec §4.1
export const LATERAL_OFFSET_RANGE = [-0.5, 0.5] as const; // spec §4.1
export const SPEED_FACTOR_MIN = 0; // MFW-8 decision: no upstream flow.
/**
 * Sanity cap: at most one full lane per second (spec example 0.008 = 125 s per lane).
 * Spec gives no upper bound; MFW-8 decision. Prevents overflow to NaN in currentProgress.
 */
export const SPEED_FACTOR_MAX = 1;
export const MS_PER_SECOND = 1000; // speedFactor unit = per second (open question 6)
export const SPLINE_CURVE_TYPE = "centripetal" as const;
export const TANGENT_DELTA = 1e-4; // in arc-length progress units
export const HORIZONTAL_TANGENT_EPSILON = 1e-9;
export const LOCATE_COARSE_SAMPLES = 512;
export const LOCATE_BISECTION_ITERATIONS = 60;

/** Lane geometry: scene config, not a placement. */
export interface RiverLaneDefinition {
  readonly laneId: number; // integer >= 0
  readonly controlPoints: readonly WorldVec3[]; // world units; >= 2 (>= 3 if closed)
  readonly width: number; // world units, finite > 0; lateralOffset ±0.5 ↔ ±width/2
  readonly closed?: boolean; // default false
}

export interface RiverLane {
  readonly laneId: number;
  readonly width: number;
  readonly closed: boolean;
  readonly curve: CatmullRomCurve3;
}

export interface SplineWorldPlacement {
  readonly position: WorldVec3; // centerline + lateral offset (derived, never persisted)
  readonly centerline: WorldVec3; // lane centerline point at progress
  readonly tangent: WorldVec3; // unit flow direction (3D)
  readonly right: WorldVec3; // unit horizontal, direction of +lateralOffset (y === 0)
  readonly yawRad: number; // Math.atan2(tangent.x, tangent.z): rotation about +Y mapping local +Z to flow
}

/** lateralOffset is NOT clamped, so callers can detect "off the lane". */
export interface SplineLaneLocation {
  readonly progress: number;
  readonly lateralOffset: number;
}

function elapsedMsOf(createdAtMs: number, nowMs: number): number {
  const elapsedMs = nowMs - createdAtMs;
  return !Number.isFinite(elapsedMs) || elapsedMs < 0 ? 0 : elapsedMs;
}

/**
 * Spec §4.1: CurrentProgress(t) = (spawnProgress + (now − createdAt) × speedFactor) % 1.0,
 * with time in seconds (createdAtMs / nowMs are Unix epoch ms). Negative or non-finite elapsed counts as 0.
 * Only + − × ÷ % are used, so identical inputs give bit-identical output on every client.
 */
export function currentProgress(
  coord: Pick<SplinePathCoord, "spawnProgress" | "speedFactor">,
  createdAtMs: number,
  nowMs: number,
): number {
  const elapsedMs = elapsedMsOf(createdAtMs, nowMs);
  const raw = wrap01((elapsedMs / MS_PER_SECOND) * coord.speedFactor);
  const travelled = Number.isFinite(raw) ? raw : 0; // defence in depth for unvalidated input
  return wrap01(coord.spawnProgress + travelled);
}

/** Inverse of {@link currentProgress}: the spawnProgress that yields `progress` at `nowMs`. */
export function spawnProgressFromCurrent(
  progress: number,
  speedFactor: number,
  createdAtMs: number,
  nowMs: number,
): number {
  const elapsedMs = elapsedMsOf(createdAtMs, nowMs);
  const raw = wrap01((elapsedMs / MS_PER_SECOND) * speedFactor);
  const travelled = Number.isFinite(raw) ? raw : 0; // defence in depth for unvalidated input
  return wrap01(progress - travelled);
}

export function createRiverLane(def: RiverLaneDefinition): RiverLane {
  const closed = def.closed ?? false;
  if (!Number.isInteger(def.laneId) || def.laneId < 0) throw new RangeError("laneId must be an integer >= 0");
  if (!Number.isFinite(def.width) || def.width <= 0) throw new RangeError("lane width must be finite and > 0");
  const pts = def.controlPoints;
  if (pts.length < (closed ? 3 : 2)) {
    throw new RangeError(`lane needs at least ${closed ? 3 : 2} control points`);
  }
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      throw new RangeError("control point coordinates must be finite");
    }
  }
  const same = (a: WorldVec3, b: WorldVec3) => a.x === b.x && a.y === b.y && a.z === b.z;
  for (let i = 0; i < pts.length - 1; i++) {
    if (same(pts[i], pts[i + 1])) throw new RangeError("consecutive control points must differ");
  }
  if (closed && same(pts[pts.length - 1], pts[0])) {
    throw new RangeError("consecutive control points must differ");
  }
  const curve = new CatmullRomCurve3(
    pts.map((p) => new Vector3(p.x, p.y, p.z)),
    closed,
    SPLINE_CURVE_TYPE,
  );
  return { laneId: def.laneId, width: def.width, closed, curve };
}

export function findLane(lanes: readonly RiverLane[], laneId: number): RiverLane | undefined {
  return lanes.find((l) => l.laneId === laneId);
}

const scratchA = new Vector3();
const scratchB = new Vector3();

interface LaneFrame {
  readonly tangent: WorldVec3;
  readonly right: WorldVec3;
}

/** Wrapped central-difference tangent (three's getTangentAt is one-sided at the seam). */
function laneFrameAt(lane: RiverLane, u: number): LaneFrame {
  let a = u - TANGENT_DELTA;
  let b = u + TANGENT_DELTA;
  if (lane.closed) {
    a = wrap01(a);
    b = wrap01(b);
  } else {
    a = Math.max(0, a);
    b = Math.min(1, b);
  }
  lane.curve.getPointAt(a, scratchA);
  lane.curve.getPointAt(b, scratchB);
  scratchB.sub(scratchA).normalize();
  const h = Math.hypot(scratchB.x, scratchB.z);
  if (h < HORIZONTAL_TANGENT_EPSILON) throw new Error("lane tangent is vertical");
  return {
    tangent: { x: scratchB.x, y: scratchB.y, z: scratchB.z },
    right: { x: -scratchB.z / h, y: 0, z: scratchB.x / h },
  };
}

export function splineProgressToWorld(lane: RiverLane, progress: number, lateralOffset: number): SplineWorldPlacement {
  if (!Number.isFinite(progress) || !Number.isFinite(lateralOffset)) {
    throw new RangeError("progress and lateralOffset must be finite");
  }
  const u = lane.closed ? wrap01(progress) : progress >= 0 && progress <= 1 ? progress : wrap01(progress);
  const lat = Math.min(0.5, Math.max(-0.5, lateralOffset)); // defensive clamp, rendering only
  const c = lane.curve.getPointAt(u, new Vector3()); // arc-length parametrization: uniform speed
  const { tangent, right } = laneFrameAt(lane, u);
  const d = lat * lane.width;
  return {
    position: { x: c.x + right.x * d, y: c.y, z: c.z + right.z * d },
    centerline: { x: c.x, y: c.y, z: c.z },
    tangent,
    right,
    yawRad: Math.atan2(tangent.x, tangent.z),
  };
}

export function splineCoordToWorld(
  coord: SplinePathCoord,
  lane: RiverLane,
  createdAtMs: number,
  nowMs: number,
): SplineWorldPlacement {
  if (coord.laneId !== lane.laneId) throw new RangeError("coord.laneId does not match lane");
  return splineProgressToWorld(lane, currentProgress(coord, createdAtMs, nowMs), coord.lateralOffset);
}

/**
 * Single inverse shared by 3D and 2D: world (or canvas-derived world) xz → (progress, lateralOffset).
 * Works in the horizontal plane; y is derived from the curve. Relies on width/2 being smaller than the lane's
 * turning radius and on lanes not passing close to themselves (otherwise a local minimum may be chosen).
 */
export function locateOnLane(lane: RiverLane, point: WorldXZ): SplineLaneLocation {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new RangeError("point must be finite");
  const closed = lane.closed;
  const n = LOCATE_COARSE_SAMPLES;
  const last = closed ? n - 1 : n;
  const probe = new Vector3();

  let uBest = 0;
  let best = Infinity;
  for (let i = 0; i <= last; i++) {
    const u = i / n;
    lane.curve.getPointAt(u, probe);
    const dx = probe.x - point.x;
    const dz = probe.z - point.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      uBest = u;
    }
  }

  let lo = uBest - 1 / n;
  let hi = uBest + 1 / n;
  if (!closed) {
    lo = Math.max(0, lo);
    hi = Math.min(1, hi);
  }
  const ev = (u: number) => (closed ? wrap01(u) : u);
  const g = (u: number): number => {
    const e = ev(u);
    lane.curve.getPointAt(e, probe);
    const { tangent } = laneFrameAt(lane, e);
    return (point.x - probe.x) * tangent.x + (point.z - probe.z) * tangent.z;
  };

  const ga = g(lo);
  const gb = g(hi);
  let u: number;
  if (ga === 0) {
    u = lo;
  } else if (gb === 0) {
    u = hi;
  } else if (Math.sign(ga) === Math.sign(gb)) {
    u = Math.abs(ga) <= Math.abs(gb) ? lo : hi; // no bracketed root: point lies beyond an open lane's end
  } else {
    const signA = Math.sign(ga);
    for (let i = 0; i < LOCATE_BISECTION_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(g(mid)) === signA) lo = mid;
      else hi = mid;
    }
    u = (lo + hi) / 2;
  }

  let progress = ev(u);
  if (!closed) progress = clamp01(progress);
  lane.curve.getPointAt(progress, probe);
  const { right } = laneFrameAt(lane, progress);
  const lateralOffset = ((point.x - probe.x) * right.x + (point.z - probe.z) * right.z) / lane.width;
  return { progress, lateralOffset };
}

/** Builds a persistable coord from a located point; always passes the validator. */
export function splineCoordFromLocation(
  location: SplineLaneLocation,
  laneId: number,
  speedFactor: number,
  createdAtMs: number,
  nowMs: number,
): SplinePathCoord {
  if (!Number.isInteger(laneId) || laneId < 0) throw new RangeError("laneId must be an integer >= 0");
  if (!Number.isFinite(speedFactor) || speedFactor < SPEED_FACTOR_MIN || speedFactor > SPEED_FACTOR_MAX) {
    throw new RangeError("speedFactor must be finite and within [SPEED_FACTOR_MIN, SPEED_FACTOR_MAX]");
  }
  return {
    mode: "SPLINE_PATH",
    laneId,
    spawnProgress: spawnProgressFromCurrent(location.progress, speedFactor, createdAtMs, nowMs),
    speedFactor,
    lateralOffset: Math.min(0.5, Math.max(-0.5, location.lateralOffset)),
  };
}
