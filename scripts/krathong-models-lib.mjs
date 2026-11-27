// Pure functions of the krathong model colouring pipeline (MFW-65, docs/design/models.md). Node built-ins only, no
// randomness, no dates: the same input gives byte-identical output (tests/unit/krathong-models-script.test.ts).
//
// Pipeline (buildDesignLod): read the decimated source GLB → classify every face into a region rule (source coordinates)
// → normalise to the krathong footprint → cut the flame out (each flame becomes an anchor; the hole is capped) → crease
// normals → per-face vertex colour → de-duplicate corners → write a GLB that follows the contract in docs/design/models.md.
import { CREASE_DEG, FOOTPRINT } from "./krathong-models.designs.mjs";

/**
 * @typedef {"base" | "leaves" | "flowers" | "candle" | "flame"} Region
 * @typedef {{ kind: "column", cx: number, cz: number, radius: number, yMin: number, yMax: number }
 *   | { kind: "band", yMin: number, yMax: number, rMin: number, rMax: number }
 *   | { kind: "box", min: number[], max: number[] }
 *   | { kind: "sphere", c: number[], radius: number }
 *   | { kind: "any" }} Shape
 * @typedef {{ region: string, color: string, shape: Shape }} Rule region: a Region for krathong designs; any label for other
 *   packs (classification ignores it; extractFlames compares it to "flame")
 * @typedef {{ x: number, y: number, z: number, height: number, radius: number }} AddedFlame flame anchor in SOURCE coordinates
 *   (y = flame base), for a flame the model lacks (MFW-76)
 * @typedef {{ id: string, sourceFile: string, referenceImage: string, rules: Rule[],
 *   maxFlames?: { full?: number, medium?: number, low?: number }, addedFlames?: AddedFlame[] }} DesignSpec
 *   maxFlames: the most flame islands per LOD that are cut out (the tallest win; the rest stay in the body in their rule
 *   colour); a missing LOD means no limit. addedFlames: anchors appended after the cut ones at every LOD.
 * @typedef {"full" | "medium" | "low"} Lod
 * @typedef {{ positions: Float32Array, normals: Float32Array, colors: Uint8Array, indices: Uint16Array | Uint32Array | number[], flames?: number[][] }} GlbInput
 *   flames: written as extras.krathongFlames when writeGlb gets no `extras` option
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;
const MAX_UINT16_VERTICES = 65_535;
const ANCHOR_DECIMALS = 4;
export const GLB_GENERATOR = "mfw scripts/krathong-models.mjs";

const COMPONENT_BYTES = /** @type {Record<number, number>} */ ({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 });
const TYPE_SIZE = /** @type {Record<string, number>} */ ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 });

/** @param {Uint8Array} bytes */
function dataView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Reads mesh 0, primitive 0 of a GLB v2: positions and triangle indices (ubyte / ushort / uint; none = sequential).
 * @param {Uint8Array} bytes
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function readGlbMesh(bytes) {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) throw new Error("not a glTF 2 binary: too short");
  const view = dataView(bytes);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a glTF 2 binary: bad magic");
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error("not a glTF 2 binary: version is not 2");
  const jsonLength = view.getUint32(HEADER_BYTES, true);
  if (view.getUint32(HEADER_BYTES + 4, true) !== CHUNK_JSON) throw new Error("not a glTF 2 binary: first chunk is not JSON");
  const jsonStart = HEADER_BYTES + CHUNK_HEADER_BYTES;
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(jsonStart, jsonStart + jsonLength)));
  const binHeader = jsonStart + jsonLength;
  /** @type {Uint8Array | null} */
  let bin = null;
  if (binHeader + CHUNK_HEADER_BYTES <= bytes.byteLength && view.getUint32(binHeader + 4, true) === CHUNK_BIN) {
    const binLength = view.getUint32(binHeader, true);
    bin = bytes.subarray(binHeader + CHUNK_HEADER_BYTES, binHeader + CHUNK_HEADER_BYTES + binLength);
  }
  if (bin === null) throw new Error("not a glTF 2 binary: no BIN chunk");
  const primitive = json.meshes?.[0]?.primitives?.[0];
  if (!primitive || primitive.attributes?.POSITION === undefined) throw new Error("glTF has no mesh 0 primitive 0 with POSITION");
  const binBytes = /** @type {Uint8Array} */ (bin);
  /** @param {number} accessorIndex @returns {number[]} */
  const readAccessor = (accessorIndex) => {
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    const componentBytes = COMPONENT_BYTES[accessor.componentType];
    const size = TYPE_SIZE[accessor.type];
    if (!componentBytes || !size) throw new Error(`unsupported accessor ${accessorIndex}`);
    const stride = bufferView.byteStride ?? componentBytes * size;
    const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const v = dataView(binBytes);
    /** @type {number[]} */
    const out = new Array(accessor.count * size);
    for (let i = 0; i < accessor.count; i++) {
      for (let c = 0; c < size; c++) {
        const at = base + i * stride + c * componentBytes;
        let value;
        switch (accessor.componentType) {
          case FLOAT: value = v.getFloat32(at, true); break;
          case UNSIGNED_BYTE: value = v.getUint8(at); break;
          case UNSIGNED_SHORT: value = v.getUint16(at, true); break;
          case UNSIGNED_INT: value = v.getUint32(at, true); break;
          default: throw new Error(`unsupported component type ${accessor.componentType}`);
        }
        out[i * size + c] = value;
      }
    }
    return out;
  };
  const positions = Float32Array.from(readAccessor(primitive.attributes.POSITION));
  const vertexCount = positions.length / 3;
  const indices =
    primitive.indices === undefined
      ? Uint32Array.from({ length: vertexCount }, (_, i) => i)
      : Uint32Array.from(readAccessor(primitive.indices));
  return { positions, indices };
}

/**
 * Scales and moves the mesh so its horizontal bounding radius about the bbox centre axis is `radius` and its lowest point is
 * `bottomY`. x' = (x−cx)·s, z' = (z−cz)·s, y' = (y−minY)·s + bottomY, s = radius / max hypot(x−cx, z−cz).
 * @param {Float32Array} positions
 * @param {{ radius: number, bottomY: number }} footprint
 * @returns {Float32Array}
 */
export function normaliseToFootprint(positions, footprint) {
  const { cx, cz, minY, s } = footprintTransform(positions, footprint);
  const { bottomY } = footprint;
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = (positions[i] - cx) * s;
    out[i + 1] = (positions[i + 1] - minY) * s + bottomY;
    out[i + 2] = (positions[i + 2] - cz) * s;
  }
  return out;
}

/**
 * The transform normaliseToFootprint applies: bbox centre x / z, lowest y and the scale s = radius / max hypot(x−cx, z−cz).
 * @param {ArrayLike<number>} positions
 * @param {{ radius: number, bottomY: number }} footprint
 * @returns {{ cx: number, cz: number, minY: number, s: number }}
 */
export function footprintTransform(positions, { radius }) {
  const { cx, cz, minY } = boundsOf(positions);
  let maxR = 0;
  for (let i = 0; i < positions.length; i += 3) maxR = Math.max(maxR, Math.hypot(positions[i] - cx, positions[i + 2] - cz));
  if (!(maxR > 0)) throw new Error("mesh has no horizontal extent");
  return { cx, cz, minY, s: radius / maxR };
}

/** @param {ArrayLike<number>} positions */
function boundsOf(positions) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, minY, maxY };
}

/**
 * @param {Shape} shape
 * @param {number} x @param {number} y @param {number} z
 * @param {number} axisX @param {number} axisZ  bbox centre of the whole mesh (for "band")
 */
function shapeContains(shape, x, y, z, axisX, axisZ) {
  switch (shape.kind) {
    case "column":
      return y >= shape.yMin && y <= shape.yMax && Math.hypot(x - shape.cx, z - shape.cz) <= shape.radius;
    case "band": {
      const r = Math.hypot(x - axisX, z - axisZ);
      return y >= shape.yMin && y <= shape.yMax && r >= shape.rMin && r <= shape.rMax;
    }
    case "box":
      return x >= shape.min[0] && x <= shape.max[0] && y >= shape.min[1] && y <= shape.max[1] && z >= shape.min[2] && z <= shape.max[2];
    case "sphere":
      return Math.hypot(x - shape.c[0], y - shape.c[1], z - shape.c[2]) <= shape.radius;
    case "any":
      return true;
    default:
      throw new Error(`unknown shape kind ${/** @type {{kind: string}} */ (shape).kind}`);
  }
}

/**
 * Rule index per face, tested at the face centroid; the first matching rule wins. The last rule must be `{kind:"any"}`.
 * @param {ArrayLike<number>} positions
 * @param {ArrayLike<number>} indices
 * @param {Rule[]} rules
 * @returns {Uint16Array}
 */
export function classifyFaces(positions, indices, rules) {
  if (rules.length === 0 || rules[rules.length - 1].shape.kind !== "any") throw new Error('the last rule must be { shape: { kind: "any" } }');
  const { cx, cz } = boundsOf(positions);
  const faceCount = indices.length / 3;
  const out = new Uint16Array(faceCount);
  for (let f = 0; f < faceCount; f++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k] * 3;
      x += positions[v]; y += positions[v + 1]; z += positions[v + 2];
    }
    x /= 3; y /= 3; z /= 3;
    let r = 0;
    while (!shapeContains(rules[r].shape, x, y, z, cx, cz)) r++;
    out[f] = r;
  }
  return out;
}

/** Union-find with path halving; the root is always the smallest member (deterministic). */
function makeUnionFind(/** @type {number} */ n) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (/** @type {number} */ a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (/** @type {number} */ a, /** @type {number} */ b) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };
  return { find, union };
}

const round = (/** @type {number} */ v) => Number(v.toFixed(ANCHOR_DECIMALS));
/** Rounds an anchor coordinate to the contract's 4 decimals. */
export const roundAnchor = round;
const edgeKey = (/** @type {number} */ a, /** @type {number} */ b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/**
 * Removes every face whose rule region is "flame", caps the holes it leaves in the body and returns one anchor per flame
 * island: [x, y, z, height, radius] (bbox centre x/z, min y, height, max horizontal distance from (x, z); 4 decimals).
 * `capFaceSource[f]` is, for every output face f, the input face whose rule it takes: itself for a kept face, the body face
 * across the boundary edge for a cap face.
 * With more islands than `maxFlames`, only the `maxFlames` tallest (unrounded max y − min y; a tie goes to the lower island
 * index) are cut; every other island stays in the body as ordinary kept faces (no cap), in the original face order. No
 * island at all returns `flames: []` and the input faces unchanged.
 * @param {Float32Array} positions
 * @param {ArrayLike<number>} indices
 * @param {ArrayLike<number>} faceRuleIds
 * @param {Rule[]} rules
 * @param {number} [maxFlames] Infinity (default) or an integer ≥ 0
 * @returns {{ positions: Float32Array, indices: Uint32Array, capFaceSource: Int32Array, flames: number[][] }}
 */
export function extractFlames(positions, indices, faceRuleIds, rules, maxFlames = Infinity) {
  if (maxFlames !== Infinity && !(Number.isInteger(maxFlames) && maxFlames >= 0)) throw new Error("bad maxFlames");
  const faceCount = indices.length / 3;
  const vertexCount = positions.length / 3;
  const isFlame = (/** @type {number} */ f) => rules[faceRuleIds[f]].region === "flame";
  // Islands of flame faces, joined through shared vertices.
  const uf = makeUnionFind(vertexCount);
  for (let f = 0; f < faceCount; f++) {
    if (!isFlame(f)) continue;
    uf.union(indices[f * 3], indices[f * 3 + 1]);
    uf.union(indices[f * 3], indices[f * 3 + 2]);
  }
  /** @type {Map<number, number>} vertex root → island number (ordered by the island's lowest face index) */
  const islandOfRoot = new Map();
  /** @type {number[][]} */
  const allIslandFaces = [];
  for (let f = 0; f < faceCount; f++) {
    if (!isFlame(f)) continue;
    const root = uf.find(indices[f * 3]);
    let island = islandOfRoot.get(root);
    if (island === undefined) {
      island = allIslandFaces.length;
      islandOfRoot.set(root, island);
      allIslandFaces.push([]);
    }
    allIslandFaces[island].push(f);
  }
  /** @param {number[]} faces @returns {number[]} sorted vertex ids of an island */
  const islandVerts = (faces) =>
    [...new Set(faces.flatMap((f) => [indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]]))].sort((a, b) => a - b);
  /** @type {number[][]} the islands that are cut, in island order */
  let islandFaces = allIslandFaces;
  if (allIslandFaces.length > maxFlames) {
    const heights = allIslandFaces.map((faces) => {
      let minY = Infinity, maxY = -Infinity;
      for (const v of islandVerts(faces)) {
        minY = Math.min(minY, positions[v * 3 + 1]);
        maxY = Math.max(maxY, positions[v * 3 + 1]);
      }
      return maxY - minY;
    });
    const ranked = allIslandFaces.map((_, i) => i).sort((a, b) => heights[b] - heights[a] || a - b);
    const cut = new Set(ranked.slice(0, maxFlames));
    islandFaces = allIslandFaces.filter((_, i) => cut.has(i));
  }

  // Anchors, from the island vertices.
  const flames = islandFaces.map((faces) => {
    const verts = islandVerts(faces);
    const coords = verts.flatMap((v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);
    const { cx, cz, minY, maxY } = boundsOf(coords);
    let radius = 0;
    for (let i = 0; i < coords.length; i += 3) radius = Math.max(radius, Math.hypot(coords[i] - cx, coords[i + 2] - cz));
    return [round(cx), round(minY), round(cz), round(maxY - minY), round(radius)];
  });

  // Edge use: how many kept faces use it (and the last kept face with its direction), and which islands touch it.
  /** @type {Map<string, { kept: number, face: number, a: number, b: number, islands: Set<number> }>} */
  const edges = new Map();
  /** @param {string} key */
  const entry = (key) => {
    let e = edges.get(key);
    if (e === undefined) {
      e = { kept: 0, face: -1, a: -1, b: -1, islands: new Set() };
      edges.set(key, e);
    }
    return e;
  };
  /** @type {Int32Array} island per face, −1 for kept faces */
  const faceIsland = new Int32Array(faceCount).fill(-1);
  islandFaces.forEach((faces, island) => faces.forEach((f) => (faceIsland[f] = island)));
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[f * 3 + k];
      const b = indices[f * 3 + ((k + 1) % 3)];
      const e = entry(edgeKey(a, b));
      if (faceIsland[f] >= 0) e.islands.add(faceIsland[f]);
      else {
        e.kept += 1;
        e.face = f;
        e.a = a;
        e.b = b;
      }
    }
  }

  /** @type {number[]} */
  const outIndices = [];
  /** @type {number[]} */
  const source = [];
  for (let f = 0; f < faceCount; f++) {
    if (faceIsland[f] >= 0) continue;
    outIndices.push(indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]);
    source.push(f);
  }
  /** @type {number[]} */
  const extra = [];
  for (let island = 0; island < islandFaces.length; island++) {
    // Boundary edges of the body left by this island, in a deterministic order (by kept face, then corner).
    const boundary = [...edges.values()]
      .filter((e) => e.kept === 1 && e.islands.has(island))
      .sort((p, q) => p.face - q.face || p.a - q.a || p.b - q.b);
    if (boundary.length === 0) continue; // a free-floating flame leaves no hole
    // Loops: boundary edges joined through shared vertices.
    const loopUf = makeUnionFind(vertexCount);
    for (const e of boundary) loopUf.union(e.a, e.b);
    /** @type {Map<number, typeof boundary>} */
    const loops = new Map();
    for (const e of boundary) {
      const root = loopUf.find(e.a);
      const list = loops.get(root);
      if (list) list.push(e);
      else loops.set(root, [e]);
    }
    for (const root of [...loops.keys()].sort((a, b) => a - b)) {
      const loop = /** @type {typeof boundary} */ (loops.get(root));
      const loopVerts = [...new Set(loop.flatMap((e) => [e.a, e.b]))].sort((a, b) => a - b);
      let x = 0, y = 0, z = 0;
      for (const v of loopVerts) {
        x += positions[v * 3]; y += positions[v * 3 + 1]; z += positions[v * 3 + 2];
      }
      const centre = vertexCount + extra.length / 3;
      extra.push(x / loopVerts.length, y / loopVerts.length, z / loopVerts.length);
      // The kept face has a→b; the cap uses b→a, so the closed surface keeps one orientation.
      for (const e of loop) {
        outIndices.push(e.b, e.a, centre);
        source.push(e.face);
      }
    }
  }
  const outPositions = new Float32Array(positions.length + extra.length);
  outPositions.set(positions);
  outPositions.set(extra, positions.length);
  return { positions: outPositions, indices: Uint32Array.from(outIndices), capFaceSource: Int32Array.from(source), flames };
}

/**
 * One normal per face corner (length = indices.length × 3): the normalised sum of the area-weighted normals of the faces
 * around that vertex whose normal is within `creaseDeg` of this face's normal.
 * @param {ArrayLike<number>} positions
 * @param {ArrayLike<number>} indices
 * @param {number} creaseDeg
 * @returns {Float32Array}
 */
export function computeCreaseNormals(positions, indices, creaseDeg) {
  const faceCount = indices.length / 3;
  const vertexCount = positions.length / 3;
  const area = new Float64Array(faceCount * 3); // area-weighted (un-normalised cross product)
  const unit = new Float64Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area[f * 3] = nx; area[f * 3 + 1] = ny; area[f * 3 + 2] = nz;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      unit[f * 3] = nx / len; unit[f * 3 + 1] = ny / len; unit[f * 3 + 2] = nz / len;
    }
  }
  // Faces around each vertex (CSR).
  const start = new Int32Array(vertexCount + 1);
  for (let i = 0; i < indices.length; i++) start[indices[i] + 1] += 1;
  for (let v = 0; v < vertexCount; v++) start[v + 1] += start[v];
  const fill = start.slice(0, vertexCount);
  const around = new Int32Array(indices.length);
  for (let i = 0; i < indices.length; i++) around[fill[indices[i]]++] = Math.floor(i / 3);
  const cosLimit = Math.cos((creaseDeg * Math.PI) / 180);
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const f = Math.floor(i / 3);
    const v = indices[i];
    let x = 0, y = 0, z = 0, allX = 0, allY = 0, allZ = 0;
    for (let k = start[v]; k < start[v + 1]; k++) {
      const g = around[k];
      allX += area[g * 3]; allY += area[g * 3 + 1]; allZ += area[g * 3 + 2];
      const dot = unit[f * 3] * unit[g * 3] + unit[f * 3 + 1] * unit[g * 3 + 1] + unit[f * 3 + 2] * unit[g * 3 + 2];
      if (g === f || dot >= cosLimit) {
        x += area[g * 3]; y += area[g * 3 + 1]; z += area[g * 3 + 2];
      }
    }
    let len = Math.hypot(x, y, z);
    if (!(len > 0)) {
      x = allX; y = allY; z = allZ; // a degenerate face: fall back to the vertex average
      len = Math.hypot(x, y, z);
    }
    if (!(len > 0)) {
      x = 0; y = 1; z = 0;
      len = 1;
    }
    out[i * 3] = x / len; out[i * 3 + 1] = y / len; out[i * 3 + 2] = z / len;
  }
  return out;
}

/**
 * IEC 61966-2-1 sRGB → linear, then Math.round(v · 255).
 * @param {string} hex "#RRGGBB"
 * @returns {[number, number, number]}
 */
export function srgbHexToLinearBytes(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`bad colour ${hex}`);
  /** @param {number} at */
  const channel = (at) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return Math.round(linear * 255);
  };
  return [channel(1), channel(3), channel(5)];
}

const pad4 = (/** @type {number} */ n) => (n + 3) & ~3;

/**
 * Writes the design GLB (contract: docs/design/models.md). Indices are uint16 when there are ≤ 65 535 vertices.
 * `options.generator` defaults to GLB_GENERATOR. `options.extras`: undefined writes `{ krathongFlames: input.flames }`,
 * null omits `meshes[0].extras`, an object is written as-is.
 * @param {GlbInput} input
 * @param {{ generator?: string, extras?: Record<string, unknown> | null }} [options]
 * @returns {Uint8Array}
 */
export function writeGlb({ positions, normals, colors, indices, flames }, options = {}) {
  const generator = options.generator ?? GLB_GENERATOR;
  const extras = options.extras === undefined ? { krathongFlames: flames } : options.extras;
  const vertexCount = positions.length / 3;
  if (normals.length !== positions.length || colors.length !== vertexCount * 4) throw new Error("attribute lengths differ");
  const wide = vertexCount > MAX_UINT16_VERTICES;
  const indexBytes = wide ? 4 : 2;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  const views = [
    { byteLength: positions.length * 4 },
    { byteLength: normals.length * 4 },
    { byteLength: colors.length },
    { byteLength: indices.length * indexBytes },
  ];
  let offset = 0;
  const bufferViews = views.map((v) => {
    const out = { buffer: 0, byteOffset: offset, byteLength: v.byteLength };
    offset = pad4(offset + v.byteLength);
    return out;
  });
  const binLength = offset;
  const json = {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, mode: TRIANGLES }],
        ...(extras === null ? {} : { extras }),
      },
    ],
    accessors: [
      { bufferView: 0, componentType: FLOAT, count: vertexCount, type: "VEC3", min: min.map(Math.fround), max: max.map(Math.fround) },
      { bufferView: 1, componentType: FLOAT, count: vertexCount, type: "VEC3" },
      { bufferView: 2, componentType: UNSIGNED_BYTE, normalized: true, count: vertexCount, type: "VEC4" },
      { bufferView: 3, componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT, count: indices.length, type: "SCALAR" },
    ],
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.length);
  const total = HEADER_BYTES + CHUNK_HEADER_BYTES + jsonLength + CHUNK_HEADER_BYTES + binLength;
  const out = new Uint8Array(total);
  const view = dataView(out);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const bin = 20 + jsonLength;
  view.setUint32(bin, binLength, true);
  view.setUint32(bin + 4, CHUNK_BIN, true);
  const body = bin + CHUNK_HEADER_BYTES;
  for (let i = 0; i < positions.length; i++) view.setFloat32(body + bufferViews[0].byteOffset + i * 4, positions[i], true);
  for (let i = 0; i < normals.length; i++) view.setFloat32(body + bufferViews[1].byteOffset + i * 4, normals[i], true);
  out.set(colors, body + bufferViews[2].byteOffset);
  for (let i = 0; i < indices.length; i++) {
    if (wide) view.setUint32(body + bufferViews[3].byteOffset + i * 4, indices[i], true);
    else view.setUint16(body + bufferViews[3].byteOffset + i * 2, indices[i], true);
  }
  return out;
}

/**
 * Crease normals, per-face vertex colour and corner de-duplication: every face corner becomes one output vertex keyed by
 * (input vertex, normal bits, colour), in first-seen order, with alpha 255.
 * @param {{ positions: ArrayLike<number>, indices: ArrayLike<number>, creaseDeg: number,
 *   faceRgb: (face: number) => readonly number[] }} input faceRgb: linear RGB bytes of a face
 * @returns {{ positions: Float32Array, normals: Float32Array, colors: Uint8Array, indices: number[] }}
 */
export function colourAndWeld({ positions: inPositions, indices: inIndices, creaseDeg, faceRgb }) {
  const cornerNormals = computeCreaseNormals(inPositions, inIndices, creaseDeg);
  const normalBits = new Uint32Array(new Float32Array(cornerNormals).buffer);
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const colors = [];
  const indices = new Array(inIndices.length);
  for (let i = 0; i < inIndices.length; i++) {
    const v = inIndices[i];
    const rgb = faceRgb(Math.floor(i / 3));
    const key = `${v}/${normalBits[i * 3]}/${normalBits[i * 3 + 1]}/${normalBits[i * 3 + 2]}/${rgb[0]}/${rgb[1]}/${rgb[2]}`;
    let out = seen.get(key);
    if (out === undefined) {
      out = positions.length / 3;
      seen.set(key, out);
      positions.push(inPositions[v * 3], inPositions[v * 3 + 1], inPositions[v * 3 + 2]);
      normals.push(cornerNormals[i * 3], cornerNormals[i * 3 + 1], cornerNormals[i * 3 + 2]);
      colors.push(rgb[0], rgb[1], rgb[2], 255);
    }
    indices[i] = out;
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Uint8Array.from(colors),
    indices,
  };
}

/**
 * The whole pipeline for one design at one LOD (see the header). Byte-identical across runs.
 * @param {Uint8Array} sourceBytes decimated source GLB
 * @param {DesignSpec} design
 * @param {Lod} lod
 * @returns {Uint8Array}
 */
export function buildDesignLod(sourceBytes, design, lod) {
  const crease = CREASE_DEG[lod];
  if (crease === undefined) throw new Error(`unknown lod ${lod}`);
  const source = readGlbMesh(sourceBytes);
  const faceRules = classifyFaces(source.positions, source.indices, design.rules);
  const normalised = normaliseToFootprint(source.positions, FOOTPRINT);
  const cut = extractFlames(normalised, source.indices, faceRules, design.rules, design.maxFlames?.[lod] ?? Infinity);
  const flames = [...cut.flames];
  if (design.addedFlames !== undefined && design.addedFlames.length > 0) {
    const { cx, cz, minY, s } = footprintTransform(source.positions, FOOTPRINT);
    for (const a of design.addedFlames)
      flames.push([round((a.x - cx) * s), round((a.y - minY) * s + FOOTPRINT.bottomY), round((a.z - cz) * s), round(a.height * s), round(a.radius * s)]);
  }
  if (flames.length === 0) throw new Error("no flame found");
  const ruleBytes = design.rules.map((rule) => srgbHexToLinearBytes(rule.color));
  const welded = colourAndWeld({
    positions: cut.positions,
    indices: cut.indices,
    creaseDeg: crease,
    faceRgb: (f) => ruleBytes[faceRules[cut.capFaceSource[f]]],
  });
  return writeGlb({ ...welded, flames });
}
