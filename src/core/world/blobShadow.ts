/** Soft blob shadow as a vertex-alpha fan (MFW-47): no texture, centre alpha 1 fading to 0 at the rim. */
export interface BlobShadowFanSpec {
  readonly segments: number;
  readonly rings: number;
  readonly falloffExponent: number;
}

export interface BlobShadowFanData {
  readonly positions: Float32Array; // xyz per vertex, unit disc in the xz plane at y = 0
  readonly colors: Float32Array; // rgba per vertex: rgb = 1, a = (1 − k/rings)^falloffExponent
  readonly indices: Uint16Array;
  readonly vertexCount: number;
}

const MIN_SEGMENTS = 3;
const XYZ = 3;
const RGBA = 4;
const ALPHA = 3;
const TRIANGLE_VERTICES = 3;
const FULL_TURN = 2 * Math.PI;

/**
 * Vertex 0 is the centre; ring k = 1..rings has `segments` vertices at radius k/rings and angle θ = 2πs/segments at
 * (cos θ, 0, −sin θ). Winding makes every face point +y. Triangles = segments × (2·rings − 1).
 */
export function buildBlobShadowFan(spec: BlobShadowFanSpec): BlobShadowFanData {
  const { segments, rings, falloffExponent } = spec;
  if (!Number.isInteger(segments) || segments < MIN_SEGMENTS) throw new RangeError(`segments must be an integer ≥ 3, got ${segments}`);
  if (!Number.isInteger(rings) || rings < 1) throw new RangeError(`rings must be an integer ≥ 1, got ${rings}`);
  if (!Number.isFinite(falloffExponent) || falloffExponent <= 0) {
    throw new RangeError(`falloffExponent must be finite and > 0, got ${falloffExponent}`);
  }
  const vertexCount = 1 + rings * segments;
  const positions = new Float32Array(vertexCount * XYZ);
  const colors = new Float32Array(vertexCount * RGBA).fill(1);
  const ringStart = (k: number) => 1 + (k - 1) * segments; // k = 1..rings
  for (let k = 1; k <= rings; k++) {
    const radius = k / rings;
    const alpha = (1 - k / rings) ** falloffExponent;
    for (let s = 0; s < segments; s++) {
      const v = ringStart(k) + s;
      const theta = (FULL_TURN * s) / segments;
      positions[v * XYZ] = radius * Math.cos(theta);
      positions[v * XYZ + 2] = -radius * Math.sin(theta);
      colors[v * RGBA + ALPHA] = alpha;
    }
  }
  const indices = new Uint16Array(segments * (2 * rings - 1) * TRIANGLE_VERTICES);
  let i = 0;
  const first = ringStart(1);
  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments;
    indices[i++] = 0;
    indices[i++] = first + s;
    indices[i++] = first + next;
  }
  for (let k = 1; k < rings; k++) {
    const a = ringStart(k);
    const b = ringStart(k + 1);
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      indices[i++] = a + s;
      indices[i++] = b + s;
      indices[i++] = b + next;
      indices[i++] = a + s;
      indices[i++] = b + next;
      indices[i++] = a + next;
    }
  }
  return { positions, colors, indices, vertexCount };
}
