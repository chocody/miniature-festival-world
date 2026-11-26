import { FLAT_PATH_DECIMALS } from "@/config/fallback2d.config";

/**
 * SVG path strings of the 2D fallback (MFW-51). Pure and three-free. Every number goes through formatPathNumber; tokens are
 * separated by one space. Points are derived at render time (model units or CSS px), never persisted (invariant A).
 */
export interface FlatPoint2D {
  readonly x: number;
  readonly y: number;
}

const SIXTH = 6;
const HALF = 2;
const MIN_POLYGON_POINTS = 3;
const MIN_OPEN_POINTS = 2;

/** String(Number(n.toFixed(FLAT_PATH_DECIMALS))): no trailing zeros, and −0 → "0". */
export function formatPathNumber(n: number): string {
  const v = Number(n.toFixed(FLAT_PATH_DECIMALS));
  return String(v === 0 ? 0 : v);
}

function assertPoints(points: readonly FlatPoint2D[], min: number, name: string): void {
  if (points.length < min) throw new RangeError(`${name} needs at least ${min} points`);
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError(`${name}: point coordinates must be finite`);
  }
}

const pt = (x: number, y: number): string => formatPathNumber(x) + " " + formatPathNumber(y);

/** Uniform Catmull-Rom segment P1 → P2 as one cubic Bézier: " C c1 c2 P2". */
function catmullRomSegment(p0: FlatPoint2D, p1: FlatPoint2D, p2: FlatPoint2D, p3: FlatPoint2D): string {
  return (
    " C " +
    pt(p1.x + (p2.x - p0.x) / SIXTH, p1.y + (p2.y - p0.y) / SIXTH) +
    " " +
    pt(p2.x - (p3.x - p1.x) / SIXTH, p2.y - (p3.y - p1.y) / SIXTH) +
    " " +
    pt(p2.x, p2.y)
  );
}

/** Open Catmull-Rom segments (end points repeated as phantom neighbours), without the leading move. */
function openSegments(points: readonly FlatPoint2D[]): string {
  const n = points.length;
  const at = (i: number) => points[Math.min(n - 1, Math.max(0, i))];
  let d = "";
  for (let i = 0; i < n - 1; i++) d += catmullRomSegment(at(i - 1), at(i), at(i + 1), at(i + 2));
  return d;
}

/** "M x0 y0 L x1 y1 … Z". */
export function polygonPath(points: readonly FlatPoint2D[]): string {
  assertPoints(points, MIN_POLYGON_POINTS, "polygonPath");
  return "M " + points.map((p) => pt(p.x, p.y)).join(" L ") + " Z";
}

/** Closed uniform Catmull-Rom curve through every point (n cubic segments). */
export function smoothClosedPath(points: readonly FlatPoint2D[]): string {
  assertPoints(points, MIN_POLYGON_POINTS, "smoothClosedPath");
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  let d = "M " + pt(points[0].x, points[0].y);
  for (let i = 0; i < n; i++) d += catmullRomSegment(at(i - 1), at(i), at(i + 1), at(i + 2));
  return d + " Z";
}

/** Open uniform Catmull-Rom curve (n − 1 cubic segments, no Z). */
export function smoothOpenPath(points: readonly FlatPoint2D[]): string {
  assertPoints(points, MIN_OPEN_POINTS, "smoothOpenPath");
  return "M " + pt(points[0].x, points[0].y) + openSegments(points);
}

/** Leaf / petal blade: two smooth open curves base → tip (points[0..tipAt]) and tip → base, so base and tip stay pointed. */
export function bladePath(points: readonly FlatPoint2D[], tipAt: number): string {
  assertPoints(points, MIN_POLYGON_POINTS, "bladePath");
  if (!Number.isInteger(tipAt) || tipAt < 1 || tipAt > points.length - 2) {
    throw new RangeError("bladePath tipAt must be an integer in [1, length − 2]");
  }
  const left = points.slice(0, tipAt + 1);
  const right = [...points.slice(tipAt), points[0]];
  return "M " + pt(points[0].x, points[0].y) + openSegments(left) + openSegments(right) + " Z";
}

/** Polygon with every corner rounded by a quadratic curve; the cut is min(radius, half of each adjacent edge). */
export function roundedPolygonPath(points: readonly FlatPoint2D[], radius: number): string {
  assertPoints(points, MIN_POLYGON_POINTS, "roundedPolygonPath");
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError("roundedPolygonPath radius must be finite and ≥ 0");
  const n = points.length;
  const corner = (i: number) => {
    const p = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const lp = Math.hypot(prev.x - p.x, prev.y - p.y);
    const ln = Math.hypot(next.x - p.x, next.y - p.y);
    const c = Math.min(radius, lp / HALF, ln / HALF);
    const a = lp > 0 ? { x: p.x + ((prev.x - p.x) * c) / lp, y: p.y + ((prev.y - p.y) * c) / lp } : p;
    const b = ln > 0 ? { x: p.x + ((next.x - p.x) * c) / ln, y: p.y + ((next.y - p.y) * c) / ln } : p;
    return { a, p, b };
  };
  const first = corner(0);
  let d = "M " + pt(first.b.x, first.b.y);
  for (let i = 1; i < n; i++) {
    const { a, p, b } = corner(i);
    d += " L " + pt(a.x, a.y) + " Q " + pt(p.x, p.y) + " " + pt(b.x, b.y);
  }
  d += " L " + pt(first.a.x, first.a.y) + " Q " + pt(first.p.x, first.p.y) + " " + pt(first.b.x, first.b.y);
  return d + " Z";
}

/** Circle as two arcs. */
export function circlePath(cx: number, cy: number, r: number): string {
  return ellipsePath(cx, cy, r, r);
}

/** Axis-aligned ellipse as two arcs. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  if (![cx, cy, rx, ry].every(Number.isFinite) || rx < 0 || ry < 0) {
    throw new RangeError("ellipsePath needs finite numbers and radii ≥ 0");
  }
  const arc = " A " + formatPathNumber(rx) + " " + formatPathNumber(ry) + " 0 1 0 ";
  return "M " + pt(cx - rx, cy) + arc + pt(cx + rx, cy) + arc + pt(cx - rx, cy) + " Z";
}

/** Andrew's monotone chain (collinear points removed); fewer than 3 distinct points → the distinct points. */
export function convexHull2D(points: readonly FlatPoint2D[]): FlatPoint2D[] {
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError("convexHull2D: point coordinates must be finite");
  }
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const distinct: FlatPoint2D[] = [];
  for (const p of sorted) {
    const last = distinct[distinct.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) distinct.push(p);
  }
  if (distinct.length < MIN_POLYGON_POINTS) return distinct;
  const cross = (o: FlatPoint2D, a: FlatPoint2D, b: FlatPoint2D) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: FlatPoint2D[] = [];
  for (const p of distinct) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: FlatPoint2D[] = [];
  for (let i = distinct.length - 1; i >= 0; i--) {
    const p = distinct[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
