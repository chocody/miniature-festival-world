import type { RiverLane } from "@/core/coordinates";
import { riverFrameAt, type BankSide } from "./riverEnvironment";

/** One point of a bank cross-section: offset = world units from the channel edge outward, y = absolute world height. */
export interface BankProfilePoint {
  readonly offset: number;
  readonly y: number;
}

/** Indexed bank surface (MFW-49): rows along the channel, `rowSize` vertices per row from the water edge outward. */
export interface BankGeometryData {
  readonly positions: Float32Array; // xyz per vertex, absolute world y
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly rowSize: number;
}

const XYZ = 3;
const QUAD_INDICES = 6;

/**
 * Throws RangeError unless the profile has ≥ 2 finite points with strictly increasing offsets, starts at offset 0 below the
 * water surface (so the shoreline is the clean water / lip intersection) and ends at offset === bankWidth.
 */
export function assertBankProfile(profile: readonly BankProfilePoint[], bankWidth: number, waterSurfaceY: number): void {
  if (profile.length < 2) throw new RangeError("bank profile needs at least 2 points");
  profile.forEach((p, i) => {
    if (!Number.isFinite(p.offset) || !Number.isFinite(p.y)) throw new RangeError(`bank profile[${i}] must be finite`);
    if (i > 0 && !(p.offset > profile[i - 1].offset)) throw new RangeError("bank profile offsets must strictly increase");
  });
  if (profile[0].offset !== 0) throw new RangeError("bank profile must start at offset 0");
  if (profile[profile.length - 1].offset !== bankWidth) throw new RangeError("bank profile must end at offset bankWidth");
  if (!(profile[0].y < waterSurfaceY)) throw new RangeError("bank profile must start below the water surface");
}

/** Bank height at `offset` from the channel edge: clamped to the end points, linear in between. */
export function bankSurfaceY(profile: readonly BankProfilePoint[], offset: number): number {
  if (!Number.isFinite(offset)) throw new RangeError("offset must be finite");
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (offset <= first.offset) return first.y;
  if (offset >= last.offset) return last.y;
  for (let k = 1; k < profile.length; k++) {
    const b = profile[k];
    if (offset <= b.offset) {
      const a = profile[k - 1];
      return a.y + ((offset - a.offset) / (b.offset - a.offset)) * (b.y - a.y);
    }
  }
  return last.y;
}

/**
 * Row i = 0..segments at progress i/segments; vertex (i, k) at lateral side·(channel.width/2 + profile[k].offset) and height
 * profile[k].y. Two triangles per quad, wound per side so every face normal points up (+y).
 */
export function buildBankProfileGeometryData(
  channel: RiverLane,
  side: BankSide,
  profile: readonly BankProfilePoint[],
  segments: number,
): BankGeometryData {
  if (!Number.isInteger(segments) || segments < 1) throw new RangeError("segments must be an integer >= 1");
  if (side !== -1 && side !== 1) throw new RangeError("side must be -1 or 1");
  if (profile.length < 2) throw new RangeError("bank profile needs at least 2 points");
  const rowSize = profile.length;
  const vertexCount = (segments + 1) * rowSize;
  const positions = new Float32Array(vertexCount * XYZ);
  const half = channel.width / 2;
  for (let i = 0; i <= segments; i++) {
    const { centerline: c, right } = riverFrameAt(channel, i / segments);
    for (let k = 0; k < rowSize; k++) {
      const d = side * (half + profile[k].offset);
      const o = (i * rowSize + k) * XYZ;
      positions[o] = c.x + right.x * d;
      positions[o + 1] = profile[k].y;
      positions[o + 2] = c.z + right.z * d;
    }
  }
  const indices = new Uint32Array(segments * (rowSize - 1) * QUAD_INDICES);
  let n = 0;
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < rowSize - 1; k++) {
      const a = i * rowSize + k; // (i, k)
      const b = a + 1; // (i, k + 1): outward
      const c = a + rowSize; // (i + 1, k): downstream
      const d = c + 1; // (i + 1, k + 1)
      // right × flow points up, so outward along +right (side 1) uses (a, b, c); side -1 mirrors the winding.
      if (side === 1) {
        indices[n++] = a; indices[n++] = b; indices[n++] = c;
        indices[n++] = b; indices[n++] = d; indices[n++] = c;
      } else {
        indices[n++] = a; indices[n++] = c; indices[n++] = b;
        indices[n++] = b; indices[n++] = c; indices[n++] = d;
      }
    }
  }
  return { positions, indices, vertexCount, rowSize };
}
