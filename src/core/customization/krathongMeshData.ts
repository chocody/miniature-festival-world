import type { BladeSpec, KrathongMeshSpec, MeshProfilePoint, MeshTransform, PetalDiscSpec } from "@/config/krathongModel.config";
import { assembleKrathong } from "./krathongAssembler";
import { meshSpecFor } from "./krathongAssetKeys";
import type { KrathongAppearance, KrathongPartInstance } from "./types";

/**
 * Pure (three-free, React-free) builders of the v2 krathong meshes (MFW-48). Every mesh is an indexed closed solid with
 * counter-clockwise triangles seen from outside, so it renders FrontSide only with smooth normals.
 */
export interface KrathongMeshData {
  readonly positions: Float32Array; // xyz per vertex
  readonly indices: Uint16Array; // CCW seen from outside; every mesh is a closed solid
  readonly vertexCount: number;
  readonly triangleCount: number;
}

const XYZ = 3;
const TRI = 3;
const TAU = 2 * Math.PI;
const MAX_VERTICES = 65_535;
const MIN_LATHE_SEGMENTS = 3;
const MIN_PROFILE_POINTS = 2;
const MIN_BLADE_SEGMENTS = 2;
const BLADE_RING = 4; // left, front, right, back
const SPINE_MIDPOINT = 0.5;
const HALF = 0.5;
const MIN_PETALS = 3;
const MIN_PETAL_SAMPLES = 2;
const DISC_CENTRES = 2; // top and bottom centre vertices
const SIGNED_VOLUME_DIVISOR = 6;

function finish(positions: readonly number[], indices: readonly number[]): KrathongMeshData {
  const vertexCount = positions.length / XYZ;
  if (vertexCount > MAX_VERTICES) throw new RangeError(`krathong mesh has ${vertexCount} vertices (max ${MAX_VERTICES})`);
  return Object.freeze({
    positions: Float32Array.from(positions),
    indices: Uint16Array.from(indices),
    vertexCount,
    triangleCount: indices.length / TRI,
  });
}

const isInt = (n: number, min: number) => Number.isInteger(n) && n >= min;

export function buildLatheMeshData(profile: readonly MeshProfilePoint[], segments: number): KrathongMeshData {
  if (!isInt(segments, MIN_LATHE_SEGMENTS)) throw new RangeError(`lathe segments must be an integer ≥ ${MIN_LATHE_SEGMENTS}`);
  if (profile.length < MIN_PROFILE_POINTS) throw new RangeError("lathe profile needs at least 2 points");
  for (const [r, y] of profile) {
    if (!Number.isFinite(r) || !Number.isFinite(y) || r < 0) throw new RangeError("lathe profile points must be finite with r ≥ 0");
  }
  if (profile[0][0] !== 0 || profile[profile.length - 1][0] !== 0) {
    throw new RangeError("lathe profile must start and end on the axis (closed solid)");
  }
  const positions: number[] = [];
  const indices: number[] = [];
  // Row descriptor: a pole vertex index (r = 0) or the first index of a ring.
  const rows: { pole: boolean; start: number }[] = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    if (i > 0 && r === 0 && profile[i - 1][0] === 0) throw new RangeError("lathe profile has two consecutive axis points");
    const start = positions.length / XYZ;
    if (r === 0) {
      positions.push(0, y, 0);
      rows.push({ pole: true, start });
    } else {
      for (let s = 0; s < segments; s++) {
        const a = (TAU * s) / segments;
        positions.push(r * Math.sin(a), y, r * Math.cos(a));
      }
      rows.push({ pole: false, start });
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const A = rows[i];
    const B = rows[i + 1];
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      if (A.pole) indices.push(A.start, B.start + s1, B.start + s);
      else if (B.pole) indices.push(A.start + s, A.start + s1, B.start);
      else indices.push(A.start + s, A.start + s1, B.start + s, A.start + s1, B.start + s1, B.start + s);
    }
  }
  return finish(positions, indices);
}

export function buildBladeMeshData(spec: BladeSpec): KrathongMeshData {
  const { length, width, widestAt, frontBulge, backBulge, baseTiltRad, curlRad, segments: m } = spec;
  const fields = [length, width, widestAt, frontBulge, backBulge, baseTiltRad, curlRad];
  if (fields.some((v) => !Number.isFinite(v))) throw new RangeError("blade fields must be finite");
  if (length <= 0 || width <= 0) throw new RangeError("blade length and width must be > 0");
  if (widestAt <= 0 || widestAt >= 1) throw new RangeError("blade widestAt must be in (0, 1)");
  if (frontBulge < 0 || backBulge < 0 || frontBulge + backBulge <= 0) throw new RangeError("blade bulges must be ≥ 0 with a positive sum");
  if (!isInt(m, MIN_BLADE_SEGMENTS)) throw new RangeError(`blade segments must be an integer ≥ ${MIN_BLADE_SEGMENTS}`);

  const exponent = Math.log(HALF) / Math.log(widestAt);
  const step = length / m;
  const spineY: number[] = [0];
  const spineZ: number[] = [0];
  for (let i = 1; i <= m; i++) {
    const phi = baseTiltRad + curlRad * ((i - SPINE_MIDPOINT) / m);
    spineY.push(spineY[i - 1] + step * Math.cos(phi));
    spineZ.push(spineZ[i - 1] + step * Math.sin(phi));
  }
  const positions: number[] = [0, 0, 0];
  for (let i = 1; i < m; i++) {
    const t = i / m;
    const phi = baseTiltRad + curlRad * t;
    const w = width * Math.sin(Math.PI * t ** exponent);
    const k = w / width;
    const ny = -Math.sin(phi);
    const nz = Math.cos(phi);
    const y = spineY[i];
    const z = spineZ[i];
    positions.push(-w * HALF, y, z); // left
    positions.push(0, y - ny * frontBulge * k, z - nz * frontBulge * k); // front
    positions.push(w * HALF, y, z); // right
    positions.push(0, y + ny * backBulge * k, z + nz * backBulge * k); // back
  }
  const tip = positions.length / XYZ;
  positions.push(0, spineY[m], spineZ[m]);
  const R = (i: number, k: number) => 1 + BLADE_RING * (i - 1) + (k % BLADE_RING);
  const indices: number[] = [];
  for (let k = 0; k < BLADE_RING; k++) indices.push(0, R(1, k), R(1, k + 1));
  for (let i = 1; i < m - 1; i++) {
    for (let k = 0; k < BLADE_RING; k++) {
      indices.push(R(i, k), R(i + 1, k), R(i, k + 1), R(i, k + 1), R(i + 1, k), R(i + 1, k + 1));
    }
  }
  for (let k = 0; k < BLADE_RING; k++) indices.push(R(m - 1, k), tip, R(m - 1, k + 1));
  return finish(positions, indices);
}

export function buildPetalDiscMeshData(spec: PetalDiscSpec): KrathongMeshData {
  const { petals, samplesPerPetal, outerRadius, innerRadius, roundness, rimLift, topHeight, bottomDepth, phaseRad } = spec;
  const fields = [outerRadius, innerRadius, roundness, rimLift, topHeight, bottomDepth, phaseRad];
  if (fields.some((v) => !Number.isFinite(v))) throw new RangeError("petal disc fields must be finite");
  if (!isInt(petals, MIN_PETALS)) throw new RangeError(`petal disc petals must be an integer ≥ ${MIN_PETALS}`);
  if (!isInt(samplesPerPetal, MIN_PETAL_SAMPLES)) throw new RangeError(`petal disc samplesPerPetal must be an integer ≥ ${MIN_PETAL_SAMPLES}`);
  if (innerRadius <= 0 || innerRadius >= outerRadius) throw new RangeError("petal disc needs 0 < innerRadius < outerRadius");
  if (roundness <= 0) throw new RangeError("petal disc roundness must be > 0");
  if (topHeight + bottomDepth <= 0) throw new RangeError("petal disc needs topHeight + bottomDepth > 0");

  const n = petals * samplesPerPetal;
  const positions: number[] = [0, topHeight, 0, 0, -bottomDepth, 0];
  for (let j = 0; j < n; j++) {
    const u = (TAU * j) / n;
    const lobe = Math.abs(Math.cos((petals * u) / 2)) ** roundness;
    const r = innerRadius + (outerRadius - innerRadius) * lobe;
    const a = phaseRad + u;
    positions.push(r * Math.sin(a), (rimLift * r) / outerRadius, r * Math.cos(a));
  }
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    const o = DISC_CENTRES + j;
    const o1 = DISC_CENTRES + ((j + 1) % n);
    indices.push(0, o, o1, 1, o1, o);
  }
  return finish(positions, indices);
}

export function applyMeshTransform(data: KrathongMeshData, transform: MeshTransform | undefined): KrathongMeshData {
  if (transform === undefined) return data;
  const [sx, sy, sz] = transform.scale ?? [1, 1, 1];
  if (!(sx > 0 && sy > 0 && sz > 0)) throw new RangeError("mesh transform scale components must be > 0");
  const ax = transform.rotateXRad ?? 0;
  const ay = transform.rotateYRad ?? 0;
  const [tx, ty, tz] = transform.translate ?? [0, 0, 0];
  const cx = Math.cos(ax);
  const sxr = Math.sin(ax);
  const cy = Math.cos(ay);
  const syr = Math.sin(ay);
  const src = data.positions;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += XYZ) {
    const x = src[i] * sx;
    const y0 = src[i + 1] * sy;
    const z0 = src[i + 2] * sz;
    const y = y0 * cx - z0 * sxr;
    const z = y0 * sxr + z0 * cx;
    out[i] = x * cy + z * syr + tx;
    out[i + 1] = y + ty;
    out[i + 2] = -x * syr + z * cy + tz;
  }
  return Object.freeze({ positions: out, indices: data.indices, vertexCount: data.vertexCount, triangleCount: data.triangleCount });
}

export function mergeMeshData(parts: readonly KrathongMeshData[]): KrathongMeshData {
  const vertexCount = parts.reduce((sum, p) => sum + p.vertexCount, 0);
  if (vertexCount > MAX_VERTICES) throw new RangeError(`krathong mesh has ${vertexCount} vertices (max ${MAX_VERTICES})`);
  const indexCount = parts.reduce((sum, p) => sum + p.indices.length, 0);
  const positions = new Float32Array(vertexCount * XYZ);
  const indices = new Uint16Array(indexCount);
  let vOffset = 0;
  let iOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vOffset * XYZ);
    for (let i = 0; i < part.indices.length; i++) indices[iOffset + i] = part.indices[i] + vOffset;
    vOffset += part.vertexCount;
    iOffset += part.indices.length;
  }
  return Object.freeze({ positions, indices, vertexCount, triangleCount: indexCount / TRI });
}

export function buildKrathongMeshData(spec: KrathongMeshSpec): KrathongMeshData {
  let data: KrathongMeshData;
  switch (spec.kind) {
    case "lathe":
      data = buildLatheMeshData(spec.profile, spec.segments);
      break;
    case "blade":
      data = buildBladeMeshData(spec.blade);
      break;
    case "petalDisc":
      data = buildPetalDiscMeshData(spec.disc);
      break;
    case "group":
      data = mergeMeshData(spec.children.map(buildKrathongMeshData));
      break;
  }
  return applyMeshTransform(data, spec.transform);
}

/** Σ v0·(v1×v2)/6: positive for a closed solid wound counter-clockwise seen from outside. */
export function meshSignedVolume(data: KrathongMeshData): number {
  const p = data.positions;
  const idx = data.indices;
  let sum = 0;
  for (let t = 0; t < idx.length; t += TRI) {
    const a = idx[t] * XYZ;
    const b = idx[t + 1] * XYZ;
    const c = idx[t + 2] * XYZ;
    const cx = p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1];
    const cy = p[b + 2] * p[c] - p[b] * p[c + 2];
    const cz = p[b] * p[c + 1] - p[b + 1] * p[c];
    sum += p[a] * cx + p[a + 1] * cy + p[a + 2] * cz;
  }
  return sum / SIGNED_VOLUME_DIVISOR;
}

export function meshMaxRadiusXZ(data: KrathongMeshData): number {
  const p = data.positions;
  let max = 0;
  for (let i = 0; i < p.length; i += XYZ) max = Math.max(max, Math.hypot(p[i], p[i + 2]));
  return max;
}

export function meshYRange(data: KrathongMeshData): { readonly min: number; readonly max: number } {
  const p = data.positions;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 1; i < p.length; i += XYZ) {
    min = Math.min(min, p[i]);
    max = Math.max(max, p[i]);
  }
  return Object.freeze({ min, max });
}

const meshCache = new Map<string, KrathongMeshData>();
function cachedMeshData(key: KrathongPartInstance["geometryKey"]): KrathongMeshData {
  let data = meshCache.get(key);
  if (data === undefined) {
    data = buildKrathongMeshData(meshSpecFor(key));
    meshCache.set(key, data);
  }
  return data;
}

/** Σ triangleCount(buildKrathongMeshData(meshSpecFor(part.geometryKey))) over all assembled parts. */
export function countKrathongTriangles(appearance: KrathongAppearance): number {
  const assembly = assembleKrathong(appearance);
  let sum = 0;
  for (const part of assembly.body) sum += cachedMeshData(part.geometryKey).triangleCount;
  for (const part of assembly.centerAnchor.parts) sum += cachedMeshData(part.geometryKey).triangleCount;
  return sum;
}

/** Max XZ distance from the model origin over all parts (part transform T·R_y·S applied; centre-anchor parts offset by the anchor). */
export function krathongModelRadiusXZ(appearance: KrathongAppearance): number {
  const assembly = assembleKrathong(appearance);
  const anchor = assembly.centerAnchor.localPosition;
  let max = 0;
  const measure = (part: KrathongPartInstance, ox: number, oz: number) => {
    const p = cachedMeshData(part.geometryKey).positions;
    const c = Math.cos(part.rotationY);
    const s = Math.sin(part.rotationY);
    const [sx, , sz] = part.scale;
    for (let i = 0; i < p.length; i += XYZ) {
      const x = p[i] * sx;
      const z = p[i + 2] * sz;
      const wx = x * c + z * s + part.localPosition[0] + ox;
      const wz = -x * s + z * c + part.localPosition[2] + oz;
      max = Math.max(max, Math.hypot(wx, wz));
    }
  };
  for (const part of assembly.body) measure(part, 0, 0);
  for (const part of assembly.centerAnchor.parts) measure(part, anchor[0], anchor[2]);
  return max;
}
