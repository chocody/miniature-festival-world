// Pure functions of the house model pipeline (MFW-66, docs/design/models.md §10). Node built-ins only, no randomness, no
// dates: the same input gives byte-identical output (tests/unit/house-model-script.test.ts).
//
// Pipeline (buildHouseModel): read every node primitive of the owner GLB → drop the door knob → give every face a region →
// turn into the rotated frame (walls axis-aligned) → drop degenerate, down-facing and into-the-wall faces → house-local
// transform (door at +Z, walls centred, base y 0, walls width = bodyWidth) → shell (vertex-coloured regions) + roof →
// round + weld → window glass boxes behind the five openings. renderHouseModelModule writes the generated TS module.
import { HOUSE_MODEL_SPEC, SHELL_REGION_ORDER } from "./house-model.data.mjs";

/**
 * @typedef {typeof HOUSE_MODEL_SPEC} HouseModelSpec
 * @typedef {{ node: string, material: number, positions: Float32Array, indices: Uint32Array }} GlbPrimitive
 * @typedef {{
 *   positions: number[], indices: number[], faceColors: number[] | null, palette: string[],
 *   halfExtents: [number, number, number], centerY: number,
 * }} StaticPartMeshBuild
 * @typedef {{ x: number, y: number, z: number, yawRad: number }} WindowBuild
 * @typedef {{
 *   scale: number, shell: StaticPartMeshBuild, roof: StaticPartMeshBuild, windows: WindowBuild[],
 *   glass: { width: number, height: number, depth: number }, stats: Record<string, number>,
 * }} HouseModelBuild
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
const NUMBERS_PER_LINE = 24;
export const HOUSE_MODEL_GENERATOR = "mfw scripts/house-model.mjs";

/** @param {string} reason */
const glbError = (reason) => new Error(`house GLB: ${reason}`);

/**
 * One entry per (node with a mesh, primitive), in node order, with copies of the arrays.
 * @param {Uint8Array} bytes
 * @returns {GlbPrimitive[]}
 */
export function readGlbPrimitives(bytes) {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) throw glbError("too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw glbError("wrong magic");
  if (view.getUint32(4, true) !== GLB_VERSION) throw glbError("version is not 2");
  const jsonLength = view.getUint32(HEADER_BYTES, true);
  if (view.getUint32(HEADER_BYTES + 4, true) !== CHUNK_JSON) throw glbError("first chunk is not JSON");
  const jsonStart = HEADER_BYTES + CHUNK_HEADER_BYTES;
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(jsonStart, jsonStart + jsonLength)));
  const binHeader = jsonStart + jsonLength;
  if (binHeader + CHUNK_HEADER_BYTES > bytes.byteLength || view.getUint32(binHeader + 4, true) !== CHUNK_BIN)
    throw glbError("no BIN chunk");
  const binLength = view.getUint32(binHeader, true);
  const binStart = binHeader + CHUNK_HEADER_BYTES;
  const bin = new DataView(bytes.buffer, bytes.byteOffset + binStart, binLength);

  /**
   * @param {number} index
   * @param {(accessor: { componentType: number, type: string }) => string | null} check  returns a reason to reject
   * @returns {number[]}
   */
  const readAccessor = (index, check) => {
    const accessor = json.accessors?.[index];
    if (!accessor || accessor.bufferView === undefined) throw glbError(`accessor ${index} has no buffer view`);
    const reason = check(accessor);
    if (reason !== null) throw glbError(reason);
    const size = accessor.type === "VEC3" ? 3 : 1;
    const componentBytes = accessor.componentType === UNSIGNED_BYTE ? 1 : accessor.componentType === UNSIGNED_SHORT ? 2 : 4;
    const bufferView = json.bufferViews[accessor.bufferView];
    const stride = bufferView.byteStride ?? componentBytes * size;
    const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    /** @type {number[]} */
    const out = new Array(accessor.count * size);
    for (let i = 0; i < accessor.count; i++) {
      for (let c = 0; c < size; c++) {
        const at = base + i * stride + c * componentBytes;
        switch (accessor.componentType) {
          case FLOAT: out[i * size + c] = bin.getFloat32(at, true); break;
          case UNSIGNED_BYTE: out[i * size + c] = bin.getUint8(at); break;
          case UNSIGNED_SHORT: out[i * size + c] = bin.getUint16(at, true); break;
          default: out[i * size + c] = bin.getUint32(at, true);
        }
      }
    }
    return out;
  };

  /** @type {GlbPrimitive[]} */
  const out = [];
  const nodes = json.nodes ?? [];
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    for (const key of ["translation", "rotation", "scale", "matrix", "children"]) {
      if (node[key] !== undefined) throw glbError(`node ${node.name ?? n} has ${key}`);
    }
    if (node.mesh === undefined) continue;
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) throw glbError(`node ${node.name ?? n} points at a missing mesh`);
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) throw glbError(`node ${node.name ?? n}: mode ${primitive.mode} is not triangles`);
      if (primitive.indices === undefined) throw glbError(`node ${node.name ?? n}: missing indices`);
      if (primitive.attributes?.POSITION === undefined) throw glbError(`node ${node.name ?? n}: missing POSITION`);
      const positions = readAccessor(primitive.attributes.POSITION, (a) =>
        a.componentType === FLOAT && a.type === "VEC3" ? null : `node ${node.name ?? n}: POSITION is not FLOAT VEC3`,
      );
      const indices = readAccessor(primitive.indices, (a) =>
        a.type === "SCALAR" && [UNSIGNED_BYTE, UNSIGNED_SHORT, UNSIGNED_INT].includes(a.componentType)
          ? null
          : `node ${node.name ?? n}: unsupported index accessor`,
      );
      out.push({
        node: node.name ?? "",
        material: primitive.material ?? -1,
        positions: Float32Array.from(positions),
        indices: Uint32Array.from(indices),
      });
    }
  }
  return out;
}

/**
 * @param {GlbPrimitive} prim
 * @param {HouseModelSpec} spec
 * @returns {"roof" | import("./house-model.data.mjs").ShellRegion}
 */
function regionOf(prim, spec) {
  if (prim.material === spec.roofMaterial) return "roof";
  const r = spec.regions;
  if (prim.node === r.walls.node && prim.material === r.walls.material) return "walls";
  if (r.chimney.includes(prim.node)) return "chimney";
  if (r.chimneyCap.includes(prim.node)) return "chimneyCap";
  if (r.step.includes(prim.node)) return "step";
  if (r.door.includes(prim.node)) return "door";
  return "trim";
}

/**
 * @param {number} v
 * @param {number} decimals
 */
const roundTo = (v, decimals) => {
  const r = Number(v.toFixed(decimals));
  return r === 0 ? 0 : r; // no "-0"
};

/**
 * Splits house faces into the shell / roof parts (see the file header).
 * @param {GlbPrimitive[]} prims
 * @param {HouseModelSpec} [spec]
 * @returns {HouseModelBuild}
 */
export function buildHouseModel(prims, spec = HOUSE_MODEL_SPEC) {
  /** @type {Record<string, number>} */
  const stats = {};
  const count = (/** @type {string} */ key) => (stats[key] = (stats[key] ?? 0) + 1);
  const cos = Math.cos(spec.sourceYawRad);
  const sin = Math.sin(spec.sourceYawRad);

  // 1–3: drop the knob, region per face, rotate.
  /** @type {{ region: string, v: number[][] }[]} */
  const faces = [];
  for (const prim of prims) {
    const dropped = spec.droppedNodes.includes(prim.node);
    const region = regionOf(prim, spec);
    for (let f = 0; f < prim.indices.length; f += 3) {
      if (dropped) {
        count("knob");
        continue;
      }
      const v = [0, 1, 2].map((k) => {
        const i = prim.indices[f + k] * 3;
        const x = prim.positions[i];
        const y = prim.positions[i + 1];
        const z = prim.positions[i + 2];
        return [x * cos - z * sin, y, x * sin + z * cos];
      });
      faces.push({ region, v });
    }
  }

  // 4: walls bbox (before culling) and the four wall planes.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const face of faces) {
    if (face.region !== "walls") continue;
    for (const p of face.v)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p[a]);
        max[a] = Math.max(max[a], p[a]);
      }
  }
  if (!(max[0] > min[0])) throw new Error("house model: no walls faces");
  const walls = [
    { axis: 0, at: min[0], out: -1 },
    { axis: 0, at: max[0], out: 1 },
    { axis: 2, at: min[2], out: -1 },
    { axis: 2, at: max[2], out: 1 },
  ];

  // 5: cull.
  /** @type {{ region: string, v: number[][] }[]} */
  const kept = [];
  for (const face of faces) {
    const [A, B, C] = face.v;
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const length = Math.hypot(n[0], n[1], n[2]);
    if (!(length > 0)) {
      count(`${face.region}:degenerate`);
      continue;
    }
    if (n[1] / length < spec.downFaceMaxNormalY) {
      count(`${face.region}:down`);
      continue;
    }
    if (/** @type {readonly string[]} */ (spec.inwardRegions).includes(face.region)) {
      const centroid = [0, 1, 2].map((a) => (A[a] + B[a] + C[a]) / 3);
      let best = walls[0];
      let bestDistance = Infinity;
      for (const wall of walls) {
        const d = Math.abs(centroid[wall.axis] - wall.at);
        if (d < bestDistance) {
          bestDistance = d;
          best = wall;
        }
      }
      if (bestDistance <= spec.wallBand && (n[best.axis] / length) * best.out < spec.inwardDot) {
        count(`${face.region}:inward`);
        continue;
      }
    }
    kept.push(face);
  }

  // 6: local transform (180° about +Y: door at +Z, winding kept).
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const y0 = min[1];
  const k = spec.bodyWidth / (max[0] - min[0]);
  const toLocal = (/** @type {number[]} */ p) => [-(p[0] - cx) * k, (p[1] - y0) * k, -(p[2] - cz) * k];

  // 7–9: shell / roof parts.
  const paletteOf = spec.palette;
  /** @type {string[]} */
  const shellPalette = [];
  for (const region of SHELL_REGION_ORDER) {
    const hex = paletteOf[region].hex;
    if (!shellPalette.includes(hex)) shellPalette.push(hex);
  }
  const shell = buildPart(
    kept.filter((f) => f.region !== "roof"),
    toLocal,
    spec.decimals,
    (region) => shellPalette.indexOf(paletteOf[/** @type {keyof typeof paletteOf} */ (region)].hex),
    shellPalette,
  );
  const roof = buildPart(
    kept.filter((f) => f.region === "roof"),
    toLocal,
    spec.decimals,
    null,
    [],
  );

  // 10: window glass behind each opening.
  const openings = Object.values(spec.openings);
  /** @type {WindowBuild[]} */
  const windows = openings.map((o) => {
    const alongMid = (o.along[0] + o.along[1]) / 2;
    const yMid = (o.y[0] + o.y[1]) / 2;
    const rotated = o.axis === "z" ? [alongMid, yMid, o.inner] : [o.inner, yMid, alongMid];
    const centre = toLocal(rotated);
    const sign = Math.sign(o.outer - o.inner);
    // Rotated-frame outward normal, then the 180° local turn negates x and z.
    const outward = o.axis === "z" ? [0, 0, -sign] : [-sign, 0, 0];
    const half = spec.glassDepth / 2;
    return {
      x: roundTo(centre[0] - outward[0] * half, spec.decimals),
      y: roundTo(centre[1], spec.decimals),
      z: roundTo(centre[2] - outward[2] * half, spec.decimals),
      // Kept exact (a quarter turn): the module writes it as a Math.PI expression (renderYaw).
      yawRad: Math.atan2(outward[0], outward[2]),
    };
  });
  const glass = {
    width: roundTo(Math.max(...openings.map((o) => (o.along[1] - o.along[0]) * k)) + 2 * spec.glassMargin, spec.decimals),
    height: roundTo(Math.max(...openings.map((o) => (o.y[1] - o.y[0]) * k)) + 2 * spec.glassMargin, spec.decimals),
    depth: roundTo(spec.glassDepth, spec.decimals),
  };

  return { scale: roundTo(k, spec.decimals), shell, roof, windows, glass, stats };
}

/**
 * Steps 8–9 for one part: round, weld by the rounded xyz string (first-seen order), centre y on the part's y range.
 * @param {{ region: string, v: number[][] }[]} faces
 * @param {(p: number[]) => number[]} toLocal
 * @param {number} decimals
 * @param {((region: string) => number) | null} colorOf
 * @param {string[]} palette
 * @returns {StaticPartMeshBuild}
 */
function buildPart(faces, toLocal, decimals, colorOf, palette) {
  /** @type {Map<string, number>} */
  const weld = new Map();
  /** @type {number[][]} */
  const vertices = [];
  /** @type {number[]} */
  const indices = [];
  /** @type {number[]} */
  const faceColors = [];
  for (const face of faces) {
    for (const p of face.v) {
      const local = toLocal(p).map((c) => roundTo(c, decimals));
      const key = local.join(",");
      let index = weld.get(key);
      if (index === undefined) {
        index = vertices.length;
        weld.set(key, index);
        vertices.push(local);
      }
      indices.push(index);
    }
    if (colorOf) faceColors.push(colorOf(face.region));
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of vertices) {
    yMin = Math.min(yMin, v[1]);
    yMax = Math.max(yMax, v[1]);
  }
  const centerY = vertices.length === 0 ? 0 : roundTo((yMin + yMax) / 2, decimals);
  /** @type {number[]} */
  const positions = [];
  const half = [0, 0, 0];
  for (const v of vertices) {
    const stored = [v[0], roundTo(v[1] - centerY, decimals), v[2]];
    for (let a = 0; a < 3; a++) half[a] = Math.max(half[a], Math.abs(stored[a]));
    positions.push(...stored);
  }
  return {
    positions,
    indices,
    faceColors: colorOf ? faceColors : null,
    palette,
    halfExtents: /** @type {[number, number, number]} */ (half),
    centerY,
  };
}

/**
 * @param {readonly number[]} values
 * @param {number} decimals
 * @param {string} indent
 */
function numberLines(values, decimals, indent) {
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < values.length; i += NUMBERS_PER_LINE) {
    lines.push(`${indent}${values.slice(i, i + NUMBERS_PER_LINE).map((v) => num(v, decimals)).join(", ")},`);
  }
  return lines.join("\n");
}

/**
 * A window yaw: quarter turns as exact `Math.PI` expressions (no rounding error), anything else as a rounded number.
 * @param {number} v
 * @param {number} decimals
 */
function renderYaw(v, decimals) {
  const quarters = Math.round(v / (Math.PI / 2));
  if (Math.abs(v - (quarters * Math.PI) / 2) > 1e-12) return num(v, decimals);
  switch (quarters) {
    case 0: return "0";
    case 1: return "Math.PI / 2";
    case -1: return "-Math.PI / 2";
    case 2: return "Math.PI";
    case -2: return "-Math.PI";
    default: return `${quarters} * (Math.PI / 2)`;
  }
}

/** @param {number} v @param {number} decimals */
const num = (v, decimals) => String(roundTo(v, decimals));

/**
 * @param {string} name
 * @param {StaticPartMeshBuild} part
 * @param {number} decimals
 */
function renderPart(name, part, decimals) {
  const faceColors =
    part.faceColors === null ? "    faceColors: null," : `    faceColors: [\n${numberLines(part.faceColors, decimals, "      ")}\n    ],`;
  return [
    `  ${name}: {`,
    `    positions: [\n${numberLines(part.positions, decimals, "      ")}\n    ],`,
    `    indices: [\n${numberLines(part.indices, decimals, "      ")}\n    ],`,
    faceColors,
    `    palette: [${part.palette.map((hex) => JSON.stringify(hex)).join(", ")}],`,
    `    halfExtents: [${part.halfExtents.map((v) => num(v, decimals)).join(", ")}],`,
    `    centerY: ${num(part.centerY, decimals)},`,
    "  },",
  ].join("\n");
}

/**
 * TS source of src/config/events/loyKrathong.houseModel.ts (deterministic: no dates).
 * @param {HouseModelBuild} build
 * @param {{ file: string, sha256: string }} source
 * @param {number} [decimals]
 * @returns {string}
 */
export function renderHouseModelModule(build, source, decimals = HOUSE_MODEL_SPEC.decimals) {
  const d = decimals;
  const windows = build.windows
    .map((w) => `    { x: ${num(w.x, d)}, y: ${num(w.y, d)}, z: ${num(w.z, d)}, yawRad: ${renderYaw(w.yawRad, d)} },`)
    .join("\n");
  return [
    "// Generated by scripts/house-model.mjs (MFW-66) from the owner-supplied house model. Do not edit: rebuild it as",
    "// described in docs/design/models.md §10.",
    'import type { HouseModelData } from "@/config/scene.config";',
    "",
    "export const LOY_KRATHONG_HOUSE_MODEL: HouseModelData = {",
    `  source: { file: ${JSON.stringify(source.file)}, sha256: ${JSON.stringify(source.sha256)}, generator: ${JSON.stringify(HOUSE_MODEL_GENERATOR)} },`,
    `  scale: ${num(build.scale, d)},`,
    renderPart("shell", build.shell, d),
    renderPart("roof", build.roof, d),
    `  windows: [\n${windows}\n  ],`,
    `  glass: { width: ${num(build.glass.width, d)}, height: ${num(build.glass.height, d)}, depth: ${num(build.glass.depth, d)} },`,
    "};",
    "",
  ].join("\n");
}
