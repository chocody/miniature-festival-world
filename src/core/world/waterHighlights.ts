import type { RIVER_WATER_HIGHLIGHTS } from "@/config/events/loyKrathong.river.config";
import { MS_PER_SECOND } from "@/config/gimmicks.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import type { RiverLane } from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";
import { riverFrameAt } from "./riverEnvironment";

/** Stylized water (MFW-49, backlog 9.3 AC4): pure geometry and motion for the shore band, drifting glints and ripple rings. */

/** Mesh with per-vertex alpha (rgba colour), drawn with the shared blob-shadow program (vertex colours, transparent). */
export interface VertexAlphaMeshData {
  readonly positions: Float32Array; // xyz per vertex, y = 0 (the mesh / instance sets the height)
  readonly colors: Float32Array; // rgba per vertex, rgb = 1
  readonly indices: Uint16Array | Uint32Array;
  readonly vertexCount: number;
}

export type WaterGlintSpec = typeof RIVER_WATER_HIGHLIGHTS.glint;
export type KrathongRippleSpec = typeof RIVER_WATER_HIGHLIGHTS.ripple;

const XYZ = 3;
const RGBA = 4;
const ALPHA = 3;
const QUAD_INDICES = 6;
const MIN_RING_SEGMENTS = 3;
const RING_COUNT = 3;
const FULL_TURN = 2 * Math.PI;
const UINT16_VERTEX_LIMIT = 65_536;
/** Golden-ratio conjugate: k·SCATTER mod 1 is a low-discrepancy sequence, so glints and phases spread evenly without randomness. */
const SCATTER = (Math.sqrt(5) - 1) / 2;

const frac = (v: number) => v - Math.floor(v);

function indexArray(vertexCount: number, length: number): Uint16Array | Uint32Array {
  return vertexCount < UINT16_VERTEX_LIMIT ? new Uint16Array(length) : new Uint32Array(length);
}

/**
 * Soft light band along both banks, inside the water: per side, segments+1 rows of (inner vertex at lateral
 * side·(W/2 − bandWidth), alpha 0; edge vertex at side·W/2, alpha 1). Every face points +y.
 */
export function buildShoreHighlightData(channel: RiverLane, bandWidth: number, segments: number): VertexAlphaMeshData {
  const half = channel.width / 2;
  if (!Number.isFinite(bandWidth) || bandWidth <= 0 || bandWidth >= half) {
    throw new RangeError("bandWidth must be finite and in (0, channel.width / 2)");
  }
  if (!Number.isInteger(segments) || segments < 1) throw new RangeError("segments must be an integer >= 1");
  const rows = segments + 1;
  const vertexCount = 2 * rows * 2;
  const positions = new Float32Array(vertexCount * XYZ);
  const colors = new Float32Array(vertexCount * RGBA).fill(1);
  const indices = indexArray(vertexCount, 2 * segments * QUAD_INDICES);
  let n = 0;
  ([-1, 1] as const).forEach((side, s) => {
    const base = s * rows * 2;
    for (let i = 0; i < rows; i++) {
      const { centerline: c, right } = riverFrameAt(channel, i / segments);
      const inner = base + i * 2;
      const edge = inner + 1;
      const dIn = side * (half - bandWidth);
      const dEdge = side * half;
      positions[inner * XYZ] = c.x + right.x * dIn;
      positions[inner * XYZ + 2] = c.z + right.z * dIn;
      positions[edge * XYZ] = c.x + right.x * dEdge;
      positions[edge * XYZ + 2] = c.z + right.z * dEdge;
      colors[inner * RGBA + ALPHA] = 0;
      colors[edge * RGBA + ALPHA] = 1;
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2; // inner, row i
      const b = a + 1; // edge, row i (outward)
      const c = a + 2; // inner, row i + 1 (downstream)
      const d = c + 1;
      // Outward along +right (side 1) with (a, b, c) faces +y; side -1 mirrors the winding.
      if (side === 1) {
        indices[n++] = a; indices[n++] = b; indices[n++] = c;
        indices[n++] = b; indices[n++] = d; indices[n++] = c;
      } else {
        indices[n++] = a; indices[n++] = c; indices[n++] = b;
        indices[n++] = b; indices[n++] = c; indices[n++] = d;
      }
    }
  });
  return { positions, colors, indices, vertexCount };
}

/**
 * Unit annulus in the xz plane: vertex rings at radii innerRatio, peakRatio and 1 (alpha 0 / 1 / 0), `segments` vertices
 * each at angle θ = 2πs/segments, (r cos θ, 0, −r sin θ). 4·segments triangles, all facing +y.
 */
export function buildRingFanData(spec: {
  readonly segments: number;
  readonly innerRatio: number;
  readonly peakRatio: number;
}): VertexAlphaMeshData {
  const { segments, innerRatio, peakRatio } = spec;
  if (!Number.isInteger(segments) || segments < MIN_RING_SEGMENTS) throw new RangeError("segments must be an integer >= 3");
  if (!(Number.isFinite(innerRatio) && Number.isFinite(peakRatio) && innerRatio > 0 && innerRatio < peakRatio && peakRatio < 1)) {
    throw new RangeError("ring ratios must satisfy 0 < innerRatio < peakRatio < 1");
  }
  const radii = [innerRatio, peakRatio, 1];
  const alphas = [0, 1, 0];
  const vertexCount = RING_COUNT * segments;
  const positions = new Float32Array(vertexCount * XYZ);
  const colors = new Float32Array(vertexCount * RGBA).fill(1);
  for (let k = 0; k < RING_COUNT; k++) {
    for (let s = 0; s < segments; s++) {
      const v = k * segments + s;
      const theta = (FULL_TURN * s) / segments;
      positions[v * XYZ] = radii[k] * Math.cos(theta);
      positions[v * XYZ + 2] = -radii[k] * Math.sin(theta);
      colors[v * RGBA + ALPHA] = alphas[k];
    }
  }
  const indices = indexArray(vertexCount, (RING_COUNT - 1) * segments * QUAD_INDICES);
  let n = 0;
  for (let k = 0; k < RING_COUNT - 1; k++) {
    const a = k * segments;
    const b = a + segments;
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      indices[n++] = a + s; indices[n++] = b + s; indices[n++] = b + next;
      indices[n++] = a + s; indices[n++] = b + next; indices[n++] = a + next;
    }
  }
  return { positions, colors, indices, vertexCount };
}

/** Mutable out-parameter of waterGlintPoseInto (render-time only, never persisted). */
export interface GlintPoseOut {
  progress: number; // channel progress [0, 1)
  lateral: number; // channel-width fraction, ±0.5 = the banks
  envelope: number; // [0, 1]: size factor of the fading glint
}

export function createGlintPoseOut(): GlintPoseOut {
  return { progress: 0, lateral: 0, envelope: 0 };
}

/**
 * Deterministic drifting glint `index` of `count` near the banks (even = left bank, odd = right). It drifts downstream at
 * speedScale × the krathong drift speed and fades in and out over lifeMs. Allocation-free.
 */
export function waterGlintPoseInto(
  index: number,
  count: number,
  timeMs: number,
  spec: WaterGlintSpec,
  out: GlintPoseOut,
): GlintPoseOut {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count must be an integer >= 1");
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError("index must be an integer in [0, count)");
  if (!Number.isFinite(timeMs)) throw new RangeError("timeMs must be finite");
  const side = index % 2 === 0 ? -1 : 1;
  const k = Math.floor(index / 2);
  const perSide = Math.ceil(count / 2);
  out.lateral = side * (0.5 - spec.edgeInset - spec.edgeSpread * frac(k * SCATTER));
  out.progress = wrap01(
    (k + (side > 0 ? 0.5 : 0)) / perSide + (timeMs / MS_PER_SECOND) * RIVER_DRIFT_SPEED_FACTOR * spec.speedScale,
  );
  out.envelope = Math.sin(Math.PI * frac(timeMs / spec.lifeMs + frac(index * SCATTER)));
  return out;
}

/** Ring radius (world units) of the ripple under river krathong `index`: constant under reduced motion, else a gentle pulse. */
export function krathongRippleScale(index: number, timeMs: number, reducedMotion: boolean, spec: KrathongRippleSpec): number {
  if (reducedMotion) return spec.radius;
  return spec.radius * (1 + spec.pulseAmplitude * Math.sin(FULL_TURN * (timeMs / spec.periodMs + frac(index * SCATTER))));
}
