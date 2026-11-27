/**
 * Shared core of the design GLB parsers (krathong MFW-65, Christmas ornaments MFW-101; contract in docs/design/models.md
 * §5 / §12f). Pure, no three: the typed arrays are views on the input buffer (no copy). Pack-specific extras (krathong
 * flames, ornament hook) are parsed by the callers.
 */

export interface DesignMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Uint8Array; // RGBA, linear, normalized
  readonly indices: Uint16Array | Uint32Array;
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
  meshes?: { primitives?: { attributes?: Record<string, number>; indices?: number; mode?: number }[]; extras?: unknown }[];
  accessors?: Accessor[];
  bufferViews?: BufferView[];
  [key: string]: unknown;
}

/** Absent, or a non-negative integer. */
function isOffset(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function parseJsonChunk(bytes: Uint8Array, fail: (reason: string) => never): GltfJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail("JSON chunk does not parse");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) fail("JSON chunk is not an object");
  return parsed as GltfJson;
}

/**
 * Validates every contract check shared by the design packs and returns views on `buffer` plus `meshes[0].extras` (a plain
 * object, else `{}`). Every failure goes through `fail`, so each pack keeps its own error class and message prefix.
 */
export function parseDesignGlbCore(
  buffer: ArrayBuffer,
  fail: (reason: string) => never,
): { mesh: DesignMeshData; extras: Readonly<Record<string, unknown>> } {
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
  const json = parseJsonChunk(new Uint8Array(buffer, jsonStart, jsonLength), fail);
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
  const rawExtras = meshes[0].extras;
  const extras: Readonly<Record<string, unknown>> =
    rawExtras !== null && typeof rawExtras === "object" && !Array.isArray(rawExtras) ? (rawExtras as Record<string, unknown>) : {};

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
  return { mesh: { positions, normals, colors, indices }, extras };
}
