import type { RiverLaneDefinition, SplinePathCoord, SplinePoseOut } from "@/core/coordinates/SplinePathCoord";
import { HORIZONTAL_TANGENT_EPSILON, TANGENT_DELTA } from "@/core/coordinates/splineConstants";
import { currentProgress } from "@/core/coordinates/splineProgress";
import type { WorldVec3 } from "@/core/coordinates/types";
import { wrap01 } from "@/core/math/wrap01";

/** Mirrors three r187 internals (Curve.arcLengthDivisions; CatmullRomCurve3 'centripetal' exponent and repeated-point guard). Pinned by flatLane.test.ts. */
export const CURVE_ARC_LENGTH_DIVISIONS = 200;
export const CATMULL_ROM_CENTRIPETAL_EXPONENT = 0.25;
export const CATMULL_ROM_REPEATED_POINT_EPSILON = 1e-4;

export interface MutableVec3 {
  x: number;
  y: number;
  z: number;
}
/** Same lane as createRiverLane(def), without three. `arcLengths` = three's getLengths() cache (length divisions + 1). */
export interface FlatLane {
  readonly laneId: number;
  readonly width: number;
  readonly closed: boolean;
  readonly points: readonly WorldVec3[]; // frozen copies of the control points
  readonly arcLengths: readonly number[]; // frozen
}
export interface FlatLaneSet {
  readonly lanes: readonly FlatLane[];
  get(laneId: number): FlatLane | undefined;
}
/** Lane frame at a progress: centreline, unit tangent, unit horizontal right (y = 0). Derived, NEVER persisted. */
export interface FlatLaneFrameOut {
  cx: number;
  cy: number;
  cz: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  rz: number;
}

const cx = [0, 0, 0, 0];
const cy = [0, 0, 0, 0];
const cz = [0, 0, 0, 0];
const extrapolatedStart: MutableVec3 = { x: 0, y: 0, z: 0 };
const extrapolatedEnd: MutableVec3 = { x: 0, y: 0, z: 0 };
const scratchA: MutableVec3 = { x: 0, y: 0, z: 0 };
const scratchB: MutableVec3 = { x: 0, y: 0, z: 0 };
const scratchC: MutableVec3 = { x: 0, y: 0, z: 0 };
const tangent = { x: 0, y: 0, z: 0 };
const right = { x: 0, z: 0 };

function initNonuniform(
  x0: number,
  x1: number,
  x2: number,
  x3: number,
  dt0: number,
  dt1: number,
  dt2: number,
  c: number[],
): void {
  let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
  let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
  t1 *= dt1;
  t2 *= dt1;
  c[0] = x1;
  c[1] = t1;
  c[2] = -3 * x1 + 3 * x2 - 2 * t1 - t2;
  c[3] = 2 * x1 - 2 * x2 + t1 + t2;
}
function calc(c: number[], t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return c[0] + c[1] * t + c[2] * t2 + c[3] * t3;
}
function distSq(a: WorldVec3, b: WorldVec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** = CatmullRomCurve3(points, closed, "centripetal").getPoint(t). */
function curvePoint(pts: readonly WorldVec3[], closed: boolean, t: number, out: MutableVec3): MutableVec3 {
  const l = pts.length;
  const p = (l - (closed ? 0 : 1)) * t;
  let intPoint = Math.floor(p);
  let weight = p - intPoint;
  if (closed) intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
  else if (weight === 0 && intPoint === l - 1) {
    intPoint = l - 2;
    weight = 1;
  }
  let p0: WorldVec3;
  let p3: WorldVec3;
  if (closed || intPoint > 0) p0 = pts[(intPoint - 1) % l];
  else {
    extrapolatedStart.x = pts[0].x - pts[1].x + pts[0].x;
    extrapolatedStart.y = pts[0].y - pts[1].y + pts[0].y;
    extrapolatedStart.z = pts[0].z - pts[1].z + pts[0].z;
    p0 = extrapolatedStart;
  }
  const p1 = pts[intPoint % l];
  const p2 = pts[(intPoint + 1) % l];
  if (closed || intPoint + 2 < l) p3 = pts[(intPoint + 2) % l];
  else {
    extrapolatedEnd.x = pts[l - 1].x - pts[l - 2].x + pts[l - 1].x;
    extrapolatedEnd.y = pts[l - 1].y - pts[l - 2].y + pts[l - 1].y;
    extrapolatedEnd.z = pts[l - 1].z - pts[l - 2].z + pts[l - 1].z;
    p3 = extrapolatedEnd;
  }
  let dt0 = Math.pow(distSq(p0, p1), CATMULL_ROM_CENTRIPETAL_EXPONENT);
  let dt1 = Math.pow(distSq(p1, p2), CATMULL_ROM_CENTRIPETAL_EXPONENT);
  let dt2 = Math.pow(distSq(p2, p3), CATMULL_ROM_CENTRIPETAL_EXPONENT);
  if (dt1 < CATMULL_ROM_REPEATED_POINT_EPSILON) dt1 = 1;
  if (dt0 < CATMULL_ROM_REPEATED_POINT_EPSILON) dt0 = dt1;
  if (dt2 < CATMULL_ROM_REPEATED_POINT_EPSILON) dt2 = dt1;
  initNonuniform(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2, cx);
  initNonuniform(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2, cy);
  initNonuniform(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2, cz);
  out.x = calc(cx, weight);
  out.y = calc(cy, weight);
  out.z = calc(cz, weight);
  return out;
}

/** = Curve.getUtoTmapping(u) with arcLengths = getLengths(). */
function uToT(arc: readonly number[], u: number): number {
  const il = arc.length;
  const target = u * arc[il - 1];
  let low = 0;
  let high = il - 1;
  let i = 0;
  while (low <= high) {
    i = Math.floor(low + (high - low) / 2);
    const comparison = arc[i] - target;
    if (comparison < 0) low = i + 1;
    else if (comparison > 0) high = i - 1;
    else {
      high = i;
      break;
    }
  }
  i = high;
  if (arc[i] === target) return i / (il - 1);
  const before = arc[i];
  const after = arc[i + 1];
  return (i + (target - before) / (after - before)) / (il - 1);
}

/** Same validation, order and messages as createRiverLane. */
export function createFlatLane(def: RiverLaneDefinition): FlatLane {
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
  const points = Object.freeze(def.controlPoints.map((p) => Object.freeze({ x: p.x, y: p.y, z: p.z })));
  const arc: number[] = [0];
  let last: MutableVec3 = curvePoint(points, closed, 0, { x: 0, y: 0, z: 0 });
  let sum = 0;
  for (let d = 1; d <= CURVE_ARC_LENGTH_DIVISIONS; d++) {
    const cur = curvePoint(points, closed, d / CURVE_ARC_LENGTH_DIVISIONS, { x: 0, y: 0, z: 0 });
    sum += Math.sqrt(distSq(cur, last));
    arc.push(sum);
    last = cur;
  }
  return Object.freeze({
    laneId: def.laneId,
    width: def.width,
    closed,
    points,
    arcLengths: Object.freeze(arc),
  });
}

/** Same checks and messages as createRiverLaneSet. */
export function createFlatLaneSet(defs: readonly RiverLaneDefinition[]): FlatLaneSet {
  if (defs.length === 0) throw new RangeError("at least one lane definition is required");
  const map = new Map<number, FlatLane>();
  const lanes: FlatLane[] = [];
  for (const def of defs) {
    const lane = createFlatLane(def);
    if (map.has(def.laneId)) throw new RangeError(`duplicate laneId: ${def.laneId}`);
    map.set(def.laneId, lane);
    lanes.push(lane);
  }
  return Object.freeze({ lanes: Object.freeze(lanes), get: (laneId: number) => map.get(laneId) });
}

/** = curve.getPointAt(u). */
export function flatLanePointAt(lane: FlatLane, u: number, out: MutableVec3): MutableVec3 {
  return curvePoint(lane.points, lane.closed, uToT(lane.arcLengths, u), out);
}

function laneParam(lane: FlatLane, progress: number): number {
  return lane.closed ? wrap01(progress) : progress >= 0 && progress <= 1 ? progress : wrap01(progress);
}

function clampLateral(lateralOffset: number): number {
  return Math.min(0.5, Math.max(-0.5, lateralOffset)); // defensive clamp, rendering only
}

/** Leaves the unit tangent in `tangent` and the unit right vector in `right`. Allocation-free. */
function writeFrame(lane: FlatLane, u: number): void {
  let a = u - TANGENT_DELTA;
  let b = u + TANGENT_DELTA;
  if (lane.closed) {
    a = wrap01(a);
    b = wrap01(b);
  } else {
    a = Math.max(0, a);
    b = Math.min(1, b);
  }
  flatLanePointAt(lane, a, scratchA);
  flatLanePointAt(lane, b, scratchB);
  let bx = scratchB.x - scratchA.x;
  let by = scratchB.y - scratchA.y;
  let bz = scratchB.z - scratchA.z;
  const inv = 1 / (Math.sqrt(bx * bx + by * by + bz * bz) || 1); // three's normalize()
  bx *= inv;
  by *= inv;
  bz *= inv;
  const h = Math.hypot(bx, bz);
  if (h < HORIZONTAL_TANGENT_EPSILON) throw new Error("lane tangent is vertical");
  tangent.x = bx;
  tangent.y = by;
  tangent.z = bz;
  right.x = -bz / h;
  right.z = bx / h;
}

export function createFlatLaneFrameOut(): FlatLaneFrameOut {
  return { cx: 0, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0, rx: 0, rz: 0 };
}

/** Twin of MFW-27's riverFrameAt: progress must be finite and in [0, 1]. */
export function flatLaneFrameInto(lane: FlatLane, progress: number, out: FlatLaneFrameOut): FlatLaneFrameOut {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError("progress must be finite and in [0, 1]");
  }
  const u = laneParam(lane, progress);
  flatLanePointAt(lane, u, scratchC);
  writeFrame(lane, u);
  out.cx = scratchC.x;
  out.cy = scratchC.y;
  out.cz = scratchC.z;
  out.tx = tangent.x;
  out.ty = tangent.y;
  out.tz = tangent.z;
  out.rx = right.x;
  out.rz = right.z;
  return out;
}

export function createFlatPoseOut(): SplinePoseOut {
  return { x: 0, y: 0, z: 0, yawRad: 0 };
}

/** Three-free twin of splineProgressToPoseInto (bit-identical). Not re-entrant. */
export function flatProgressToPoseInto(
  lane: FlatLane,
  progress: number,
  lateralOffset: number,
  out: SplinePoseOut,
): SplinePoseOut {
  if (!Number.isFinite(progress) || !Number.isFinite(lateralOffset)) {
    throw new RangeError("progress and lateralOffset must be finite");
  }
  const u = laneParam(lane, progress);
  const lat = clampLateral(lateralOffset);
  flatLanePointAt(lane, u, scratchC);
  writeFrame(lane, u);
  const d = lat * lane.width;
  out.x = scratchC.x + right.x * d;
  out.y = scratchC.y;
  out.z = scratchC.z + right.z * d;
  out.yawRad = Math.atan2(tangent.x, tangent.z);
  return out;
}

/** Three-free twin of splineCoordToPoseInto. */
export function flatCoordToPoseInto(
  coord: SplinePathCoord,
  lane: FlatLane,
  createdAtMs: number,
  nowMs: number,
  out: SplinePoseOut,
): SplinePoseOut {
  if (coord.laneId !== lane.laneId) throw new RangeError("coord.laneId does not match lane");
  return flatProgressToPoseInto(lane, currentProgress(coord, createdAtMs, nowMs), coord.lateralOffset, out);
}
