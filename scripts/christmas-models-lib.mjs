// Pure functions of the Christmas ornament colouring pack (MFW-101, docs/design/models.md §12) on the shared krathong
// pipeline library. Node built-ins only, no randomness, no dates: the same input gives byte-identical output.
//
// Pipeline (buildOrnamentLod): read the decimated source GLB → classify every face into a region rule (source coordinates)
// → normalise to the model-local frame (bbox centre at the origin, bounding radius MODEL_RADIUS, no rotation: the sources
// already have +Y = hook/up and face ±Z) → crease normals → per-face vertex colour → de-duplicate corners → write a GLB
// with the optional extras.ornamentHook anchor.
import { MODEL_RADIUS, ORNAMENT_CREASE_DEG } from "./christmas-models.designs.mjs";
import { classifyFaces, colourAndWeld, readGlbMesh, roundAnchor, srgbHexToLinearBytes, writeGlb } from "./krathong-models-lib.mjs";

export const CHRISTMAS_GLB_GENERATOR = "mfw scripts/christmas-models.mjs";

/**
 * Bbox centre on all three axes and the scale s = radius / max |p − c|.
 * @param {ArrayLike<number>} positions
 * @param {number} radius
 * @returns {{ cx: number, cy: number, cz: number, s: number }}
 */
export function boundsCentreTransform(positions, radius) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  let maxR = 0;
  for (let i = 0; i < positions.length; i += 3) maxR = Math.max(maxR, Math.hypot(positions[i] - cx, positions[i + 1] - cy, positions[i + 2] - cz));
  if (!(maxR > 0)) throw new Error("mesh has no extent");
  return { cx, cy, cz, s: radius / maxR };
}

/**
 * p' = (p − c)·s with c the bbox centre and s = radius / max |p − c| (boundsCentreTransform).
 * @param {ArrayLike<number>} positions
 * @param {number} radius
 * @returns {Float32Array}
 */
export function normaliseToBoundingRadius(positions, radius) {
  const { cx, cy, cz, s } = boundsCentreTransform(positions, radius);
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = (positions[i] - cx) * s;
    out[i + 1] = (positions[i + 1] - cy) * s;
    out[i + 2] = (positions[i + 2] - cz) * s;
  }
  return out;
}

/**
 * The whole pipeline for one ornament design at one LOD (see the header). Byte-identical across runs.
 * @param {Uint8Array} sourceBytes decimated source GLB
 * @param {import("./christmas-models.designs.mjs").OrnamentDesignSpec} design
 * @param {"full" | "medium" | "low"} lod
 * @returns {Uint8Array}
 */
export function buildOrnamentLod(sourceBytes, design, lod) {
  const crease = /** @type {Record<string, number | undefined>} */ (ORNAMENT_CREASE_DEG)[lod];
  if (crease === undefined) throw new Error(`unknown lod ${lod}`);
  const source = readGlbMesh(sourceBytes);
  const faceRules = classifyFaces(source.positions, source.indices, design.rules);
  const normalised = normaliseToBoundingRadius(source.positions, MODEL_RADIUS);
  const ruleBytes = design.rules.map((rule) => srgbHexToLinearBytes(rule.color));
  const welded = colourAndWeld({ positions: normalised, indices: source.indices, creaseDeg: crease, faceRgb: (f) => ruleBytes[faceRules[f]] });
  let extras = null;
  if (design.hook) {
    let maxY = -Infinity;
    for (let i = 1; i < normalised.length; i += 3) maxY = Math.max(maxY, normalised[i]);
    extras = { ornamentHook: [0, roundAnchor(maxY), 0] };
  }
  return writeGlb(welded, { generator: CHRISTMAS_GLB_GENERATOR, extras });
}
