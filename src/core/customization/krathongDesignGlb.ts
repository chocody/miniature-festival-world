import { KRATHONG_DESIGN_MAX_FLAMES } from "@/config/krathongDesigns.config";

/**
 * Parser of the owner-supplied krathong design GLB written by scripts/krathong-models.mjs (MFW-65; contract in
 * docs/design/models.md). Pure, no three: the typed arrays are views on the input buffer (no copy).
 */

/** One flame of a design, in model-local coordinates: (x, z) = flame axis, y = flame base. Render-time only (invariant A). */
export interface KrathongFlameAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly radius: number;
}

export interface KrathongDesignMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Uint8Array; // RGBA, linear, normalized
  readonly indices: Uint16Array | Uint32Array;
  readonly flames: readonly KrathongFlameAnchor[];
}

export class KrathongGlbError extends Error {
  constructor(reason: string) {
    super(`krathong design GLB: ${reason}`);
    this.name = "KrathongGlbError";
  }
}

const GLB_MAGIC = 0x46546c67;
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
const FORBIDDEN_KEYS = ["materials", "textures", "images", "samplers"] as const;
const ATTRIBUTES = ["POSITION", "NORMAL", "COLOR_0"] as const;
const ANCHOR_FIELDS = 5;

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  normalized?: boolean;
  count?: number;
  type?: string;
}
interface BufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  byteStride?: number;
}
interface GltfJson {
  asset?: { version?: string };
  meshes?: { primitives?: { attributes?: Record<string, number>; indices?: number; mode?: number }[]; extras?: { krathongFlames?: unknown } }[];
  accessors?: Accessor[];
  bufferViews?: BufferView[];
  [key: string]: unknown;
}

/** Absent, or a non-negative integer. */
function isOffset(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function fail(reason: string): never {
  throw new KrathongGlbError(reason);
}

function parseJsonChunk(bytes: Uint8Array): GltfJson {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) fail("JSON chunk is not an object");
    return parsed as GltfJson;
  } catch (error) {
    if (error instanceof KrathongGlbError) throw error;
    return fail("JSON chunk does not parse");
  }
}

function parseFlames(value: unknown): KrathongFlameAnchor[] {
  if (!Array.isArray(value)) return fail("extras.krathongFlames is missing");
  if (value.length > KRATHONG_DESIGN_MAX_FLAMES) fail(`more than ${KRATHONG_DESIGN_MAX_FLAMES} flames`);
  return value.map((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== ANCHOR_FIELDS || !entry.every((n) => typeof n === "number" && Number.isFinite(n)))
      fail("a flame anchor is not [x, y, z, height, radius]");
    const [x, y, z, height, radius] = entry as number[];
    if (!(height > 0) || !(radius > 0)) fail("a flame anchor has a non-positive size");
    return Object.freeze({ x, y, z, height, radius });
  });
}

/** Validates the contract and returns views on `buffer`. Throws KrathongGlbError naming the reason. */
export function parseKrathongDesignGlb(buffer: ArrayBuffer): KrathongDesignMeshData {
  if (buffer.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) fail("truncated header");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) fail("wrong magic");
  if (view.getUint32(4, true) !== GLB_VERSION) fail("version is not 2");
  if (view.getUint32(8, true) !== buffer.byteLength) fail("length does not match the header (truncated?)");
  const jsonLength = view.getUint32(HEADER_BYTES, true);
  if (view.getUint32(HEADER_BYTES + 4, true) !== CHUNK_JSON) fail("first chunk is not JSON");
  const jsonStart = HEADER_BYTES + CHUNK_HEADER_BYTES;
  const binHeader = jsonStart + jsonLength;
  if (jsonLength % 4 !== 0 || binHeader + CHUNK_HEADER_BYTES > buffer.byteLength) fail("truncated JSON chunk");
  const json = parseJsonChunk(new Uint8Array(buffer, jsonStart, jsonLength));
  const binLength = view.getUint32(binHeader, true);
  if (view.getUint32(binHeader + 4, true) !== CHUNK_BIN) fail("second chunk is not BIN");
  const binStart = binHeader + CHUNK_HEADER_BYTES;
  if (binStart + binLength > buffer.byteLength) fail("truncated BIN chunk");

  if (json.asset?.version !== "2.0") fail("asset.version is not 2.0");
  for (const key of FORBIDDEN_KEYS) if (key in json) fail(`has "${key}" (no materials or textures allowed)`);
  const meshes = json.meshes;
  if (!Array.isArray(meshes) || meshes.length !== 1) fail("needs exactly one mesh");
  const primitives = meshes[0].primitives;
  if (!Array.isArray(primitives) || primitives.length !== 1) fail("needs exactly one primitive");
  const primitive = primitives[0];
  if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) fail("primitive mode is not TRIANGLES");
  const attributes = primitive.attributes ?? {};
  const names = Object.keys(attributes).sort();
  for (const name of ATTRIBUTES) if (attributes[name] === undefined) fail(`missing ${name}`);
  if (names.length !== ATTRIBUTES.length) fail("unexpected attributes");
  if (primitive.indices === undefined) fail("missing indices");
  const flames = parseFlames(meshes[0].extras?.krathongFlames);

  const accessor = (index: number, componentType: number, type: string, elementBytes: number): { offset: number; count: number } => {
    const a = json.accessors?.[index];
    if (!a || a.componentType !== componentType || a.type !== type || !Number.isInteger(a.count))
      fail(`accessor ${index} is not ${type} of ${componentType}`);
    const bv = json.bufferViews?.[a.bufferView ?? -1];
    if (!bv || bv.byteStride !== undefined) fail(`accessor ${index} needs a tightly packed buffer view`);
    if ((a.count as number) < 0) fail(`accessor ${index} has a negative count`);
    if (!isOffset(a.byteOffset) || !isOffset(bv.byteOffset) || !isOffset(bv.byteLength)) fail(`accessor ${index} has a negative or non-integer offset`);
    const offset = binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (offset % 4 !== 0) fail(`accessor ${index} is not 4-byte aligned`);
    if ((bv.byteOffset ?? 0) + (bv.byteLength ?? 0) > binLength) fail(`buffer view of accessor ${index} overruns the BIN chunk`);
    if ((a.byteOffset ?? 0) + (a.count as number) * elementBytes > (bv.byteLength ?? 0)) fail(`accessor ${index} overruns its buffer view`);
    return { offset, count: a.count as number };
  };
  const pos = accessor(attributes.POSITION, FLOAT, "VEC3", 12);
  const nor = accessor(attributes.NORMAL, FLOAT, "VEC3", 12);
  const col = accessor(attributes.COLOR_0, UNSIGNED_BYTE, "VEC4", 4);
  if (json.accessors?.[attributes.COLOR_0]?.normalized !== true) fail("COLOR_0 is not normalized");
  if (nor.count !== pos.count || col.count !== pos.count) fail("attribute counts differ");
  const indexType = json.accessors?.[primitive.indices]?.componentType;
  if (indexType !== UNSIGNED_SHORT && indexType !== UNSIGNED_INT) fail("indices are not uint16 or uint32");
  const idx = accessor(primitive.indices, indexType, "SCALAR", indexType === UNSIGNED_SHORT ? 2 : 4);
  if (idx.count % 3 !== 0) fail("index count is not a multiple of 3");

  const positions = new Float32Array(buffer, pos.offset, pos.count * 3);
  const normals = new Float32Array(buffer, nor.offset, nor.count * 3);
  const colors = new Uint8Array(buffer, col.offset, col.count * 4);
  const indices = indexType === UNSIGNED_SHORT ? new Uint16Array(buffer, idx.offset, idx.count) : new Uint32Array(buffer, idx.offset, idx.count);
  for (let i = 0; i < indices.length; i++) if (indices[i] >= pos.count) fail("an index is out of range");
  return { positions, normals, colors, indices, flames: Object.freeze(flames) };
}
