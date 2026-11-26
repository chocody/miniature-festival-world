import type { WorldXZ } from "./types";

/*
 * MFW-58 endless river (three-free: the 3D scene reads it, invariant B). The world is an endless chain of
 * identical stretches: stretch s is the river's centreline translated by s·T, with T = last − first centreline control point
 * (the river's own period vector). Everything here is render-time only — a stretch index, along / across coordinates and stretch
 * offsets are derived from zone_id + SplinePathCoord and the river config, and are NEVER persisted (invariant A).
 */

/** The stretch frame: origin O = first control point, period T = last − first, unit axis a = T / |T|. Frozen. */
export interface EndlessRiverFrame {
  readonly originX: number;
  readonly originZ: number;
  /** T (world units). */
  readonly periodX: number;
  readonly periodZ: number;
  /** L = |T| > 0. */
  readonly length: number;
  /** a = T / L (unit). Across unit c = (−a.z, a.x). */
  readonly axisX: number;
  readonly axisZ: number;
}

/** Mutable out-parameter (render-time only, never persisted). */
export interface MutableXZ {
  x: number;
  z: number;
}

/** Frame of a centreline: ≥ 2 finite points with first ≠ last, else RangeError. */
export function createEndlessRiverFrame(controlPoints: readonly WorldXZ[]): EndlessRiverFrame {
  if (controlPoints.length < 2) throw new RangeError("endless river frame needs at least 2 control points");
  for (const p of controlPoints) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new RangeError("control point coordinates must be finite");
  }
  const first = controlPoints[0];
  const last = controlPoints[controlPoints.length - 1];
  const periodX = last.x - first.x;
  const periodZ = last.z - first.z;
  const length = Math.hypot(periodX, periodZ);
  if (!(length > 0)) throw new RangeError("first and last control points must differ");
  return Object.freeze({
    originX: first.x,
    originZ: first.z,
    periodX,
    periodZ,
    length,
    axisX: periodX / length,
    axisZ: periodZ / length,
  });
}

/** Signed distance of (x, z) along the river axis from the origin: (p − O)·a. Allocation-free. */
export function alongOf(frame: EndlessRiverFrame, x: number, z: number): number {
  return (x - frame.originX) * frame.axisX + (z - frame.originZ) * frame.axisZ;
}

/** Signed distance of (x, z) across the river axis: (p − O)·c with c = (−a.z, a.x). Allocation-free. */
export function acrossOf(frame: EndlessRiverFrame, x: number, z: number): number {
  return -(x - frame.originX) * frame.axisZ + (z - frame.originZ) * frame.axisX;
}

/** Inverse of (alongOf, acrossOf): O + a·along + c·across into `out`. Allocation-free. */
export function frameToWorldInto(frame: EndlessRiverFrame, along: number, across: number, out: MutableXZ): MutableXZ {
  out.x = frame.originX + frame.axisX * along - frame.axisZ * across;
  out.z = frame.originZ + frame.axisZ * along + frame.axisX * across;
  return out;
}

/**
 * along / L, computed as (p − O)·T / (T·T) so that O + s·T maps to exactly s (no rounding across a seam). Allocation-free.
 */
export function stretchParamOf(frame: EndlessRiverFrame, x: number, z: number): number {
  return ((x - frame.originX) * frame.periodX + (z - frame.originZ) * frame.periodZ) /
    (frame.periodX * frame.periodX + frame.periodZ * frame.periodZ);
}

/** Stretch s covers along ∈ [s·L, (s+1)·L). Non-finite input → RangeError. Allocation-free. */
export function stretchIndexAt(frame: EndlessRiverFrame, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("point must be finite");
  return Math.floor(stretchParamOf(frame, x, z));
}

/**
 * Keeps `current` while along ∈ [current·L − h, (current+1)·L + h) (no flip-flop at a seam); otherwise stretchIndexAt.
 * `current` must be a safe integer and h ∈ [0, L/2), else RangeError. Allocation-free.
 */
export function stretchIndexWithHysteresis(
  frame: EndlessRiverFrame,
  x: number,
  z: number,
  current: number,
  hysteresis: number,
): number {
  if (!Number.isSafeInteger(current)) throw new RangeError("current stretch must be a safe integer");
  if (!Number.isFinite(hysteresis) || hysteresis < 0 || hysteresis >= frame.length / 2) {
    throw new RangeError("hysteresis must be in [0, L/2)");
  }
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("point must be finite");
  const u = stretchParamOf(frame, x, z);
  const band = hysteresis / frame.length;
  if (u >= current - band && u < current + 1 + band) return current;
  return Math.floor(u);
}

/** out = s·T. Non-safe-integer s → RangeError. Allocation-free. */
export function stretchOffsetInto(frame: EndlessRiverFrame, stretchIndex: number, out: MutableXZ): MutableXZ {
  if (!Number.isSafeInteger(stretchIndex)) throw new RangeError("stretch index must be a safe integer");
  out.x = stretchIndex * frame.periodX;
  out.z = stretchIndex * frame.periodZ;
  return out;
}
