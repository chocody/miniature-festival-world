// Christmas ornament design table for scripts/christmas-models.mjs (MFW-101, docs/design/models.md §12). Data only.
// Region rules are tested in order at each face centroid in SOURCE coordinates (the decimated GLB, before normalising);
// the first match wins and the last rule must be { kind: "any" }. Colours are sRGB hex (the script stores them linear):
// the median of the lit half (luminance ≥ median) of a pixel box on the design's reference image ("ref box x0,y0–x1,y1").
import { CREASE_DEG } from "./krathong-models.designs.mjs";

/**
 * @typedef {"body" | "cap"} OrnamentRegion
 * @typedef {{ region: OrnamentRegion, color: string, shape: import("./krathong-models-lib.mjs").Shape }} OrnamentRule
 * @typedef {{ id: string, sourceFile: string, referenceImage: string, hook: boolean, rules: OrnamentRule[] }} OrnamentDesignSpec
 *   hook: write extras.ornamentHook = [0, max y, 0] (the hanging point at the top of the bbox centre axis)
 */

/** Model-local bounding radius about the bbox centre (= ORNAMENT_MODEL_RADIUS in src/config/ornamentModels.config.ts; CA6). */
export const MODEL_RADIUS = 1;

/** Crease angle per LOD for the corner normals: the krathong DRAFT values (one source of truth). */
export const ORNAMENT_CREASE_DEG = CREASE_DEG;

/** @type {OrnamentDesignSpec} */
const BALL_01 = {
  id: "ball_01",
  sourceFile: "model-0.glb",
  referenceImage: "ref-01.41.46.png",
  hook: true,
  rules: [
    // Cap and ring: the cap is a column r ≈ 0.27, y 0.35–0.56 with the ring above it. Tan, ref box 215,60–265,80.
    { region: "cap", color: "#CAB8A0", shape: { kind: "band", yMin: 0.35, yMax: 2, rMin: 0, rMax: 2 } },
    // Body: cream, ref box 180,110–280,200.
    { region: "body", color: "#E0D4C4", shape: { kind: "any" } },
  ],
};

/** @type {OrnamentDesignSpec} */
const STAR_01 = {
  id: "star_01",
  sourceFile: "model-1.glb",
  referenceImage: "ref-01.41.57.png",
  hook: true,
  rules: [
    // Body: mustard, ref box 190,90–300,180.
    { region: "body", color: "#D1B271", shape: { kind: "any" } },
  ],
};

/** @type {OrnamentDesignSpec} */
const BOW_01 = {
  id: "bow_01",
  sourceFile: "model-2.glb",
  referenceImage: "ref-01.42.03.png",
  hook: true,
  rules: [
    // Body: terracotta, ref box 150,70–330,130.
    { region: "body", color: "#CE927E", shape: { kind: "any" } },
  ],
};

/** In ORNAMENT_GLB_DESIGN_IDS order (CA1). */
export const CHRISTMAS_MODEL_DESIGNS = Object.freeze([BALL_01, STAR_01, BOW_01]);
