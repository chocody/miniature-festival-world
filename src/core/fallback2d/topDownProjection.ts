import type { WorldXZ } from "@/core/coordinates/types";

/** CSS px, origin top-left, y down. Derived at render time, never persisted. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}
export interface BoundsXZ {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
export interface CanvasViewport {
  readonly width: number;
  readonly height: number;
  readonly paddingPx: number;
}
export interface TopDownProjection {
  readonly bounds: BoundsXZ;
  readonly viewport: CanvasViewport;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Orthographic top-down view: camera looks down -y with screen-up = -z, so screen-right = +x and
 * screen-down = +z. Not mirrored: right-of-flow stays visually right of flow.
 */
export function createTopDownProjection(bounds: BoundsXZ, viewport: CanvasViewport): TopDownProjection {
  const { width, height, paddingPx: p } = viewport;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("viewport width and height must be finite and > 0");
  }
  if (!Number.isFinite(p) || p < 0 || 2 * p >= width || 2 * p >= height) {
    throw new RangeError("paddingPx must be >= 0 and less than half of width and height");
  }
  const { minX, maxX, minZ, maxZ } = bounds;
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX < minX || maxZ < minZ) {
    throw new RangeError("bounds must be finite with max >= min");
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX === 0 && spanZ === 0) throw new RangeError("bounds must not be zero-sized on both axes");
  const availW = width - 2 * p;
  const availH = height - 2 * p;
  const scale = Math.min(spanX > 0 ? availW / spanX : Infinity, spanZ > 0 ? availH / spanZ : Infinity);
  const offsetX = p + (availW - spanX * scale) / 2;
  const offsetY = p + (availH - spanZ * scale) / 2;
  return { bounds, viewport, scale, offsetX, offsetY };
}

export function worldToCanvas(point: WorldXZ, projection: TopDownProjection): CanvasPoint {
  const { bounds, scale, offsetX, offsetY } = projection;
  return { x: offsetX + (point.x - bounds.minX) * scale, y: offsetY + (point.z - bounds.minZ) * scale };
}

export function canvasToWorldXZ(point: CanvasPoint, projection: TopDownProjection): WorldXZ {
  const { bounds, scale, offsetX, offsetY } = projection;
  return { x: bounds.minX + (point.x - offsetX) / scale, z: bounds.minZ + (point.y - offsetY) / scale };
}

/** Mutable out-parameter for per-frame 2D drawing (MFW-33). Derived, NEVER persisted. */
export interface CanvasPointOut {
  x: number;
  y: number;
}

export function createCanvasPointOut(): CanvasPointOut {
  return { x: 0, y: 0 };
}

/** Allocation-free twin of worldToCanvas; bit-identical (same expression order). */
export function worldToCanvasInto(point: WorldXZ, projection: TopDownProjection, out: CanvasPointOut): CanvasPointOut {
  out.x = projection.offsetX + (point.x - projection.bounds.minX) * projection.scale;
  out.y = projection.offsetY + (point.z - projection.bounds.minZ) * projection.scale;
  return out;
}
