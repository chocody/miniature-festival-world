// Christmas ornament and prop design table for scripts/christmas-models.mjs (MFW-101/MFW-124, docs/design/models.md §12–§13).
// Data only. Region rules are tested in order at each face centroid in ORIENTED SOURCE coordinates (the decimated GLB after
// the optional `frame` rotation, before centring and scaling);
// the first match wins and the last rule must be { kind: "any" }. Colours are sRGB hex (the script stores them linear):
// the median of the lit half (luminance ≥ median) of a pixel box on the design's reference image ("ref box x0,y0–x1,y1").
// The snowman's eyes, buttons and nose are too small for that: darkest / most saturated quartile of a box (see the notes).
import { CREASE_DEG } from "./krathong-models.designs.mjs";

/**
 * @typedef {"body" | "cap" | "bow" | "cuff" | "ribbon" | "hat" | "scarf" | "eye" | "button" | "nose" | "sage" | "cream" | "terracotta" | "mustard"} OrnamentRegion
 * @typedef {{ region: OrnamentRegion, color: string, shape: import("./krathong-models-lib.mjs").Shape }} OrnamentRule
 * @typedef {import("./christmas-models-lib.mjs").OrnamentFrame} OrnamentFrame
 * @typedef {{ id: string, sourceFile: string, referenceImage: string, hook: boolean, rules: OrnamentRule[],
 *   frame?: OrnamentFrame, lods?: ("full" | "medium" | "low")[] }} OrnamentDesignSpec
 *   hook: write extras.ornamentHook = [0, max y, 0] (the hanging point at the top of the bbox centre axis)
 *   frame: rotate the source so that +Y = up and +Z = out before the rules run (none = no rotation)
 *   lods: the LODs built for this design (default: all of the pack's LODs)
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

/** @type {OrnamentDesignSpec} */
const BELL_01 = {
  id: "bell_01",
  sourceFile: "model-3.glb",
  referenceImage: "ref-01.45.47.png",
  hook: true,
  rules: [
    // Dome top stays under the bow mustard; body cream, ref box 130,100–230,170.
    { region: "body", color: "#E5CF9A", shape: { kind: "column", cx: 0, cz: 0, radius: 0.34, yMin: -2, yMax: 0.53 } },
    // Bow: terracotta, ref box 120,25–160,60.
    { region: "bow", color: "#CE8F7A", shape: { kind: "box", min: [-0.75, 0.42, -0.3], max: [0.75, 0.8, 0.3] } },
    // The ring and the clapper stay mustard (the last rule).
    { region: "body", color: "#E5CF9A", shape: { kind: "any" } },
  ],
};

/** @type {OrnamentDesignSpec} */
const STOCKING_01 = {
  id: "stocking_01",
  sourceFile: "model-4.glb",
  referenceImage: "ref-01.42.09.png",
  hook: true,
  // The source lies tilted: out = thinnest principal axis, up = cuff direction; cuff at the top, toe at +X, profile +Z.
  frame: { up: [0, 0.48, -0.877], out: [0.273, -0.844, -0.462] },
  rules: [
    // The leg under the cuff overhang; terracotta, ref box 190,110–290,190.
    { region: "body", color: "#D69580", shape: { kind: "column", cx: -0.15, cz: 0.05, radius: 0.6, yMin: -2, yMax: 0.19 } },
    // Cuff: cream, ref box 165,30–260,80.
    { region: "cuff", color: "#E6DCCC", shape: { kind: "band", yMin: 0.05, yMax: 2, rMin: 0, rMax: 3 } },
    { region: "body", color: "#D69580", shape: { kind: "any" } },
  ],
};

/** @type {OrnamentDesignSpec} */
const GIFT_01 = {
  id: "gift_01",
  sourceFile: "model-5.glb",
  referenceImage: "ref-01.42.14.png",
  hook: true,
  // out = source +X turns the bow loops to face +Z.
  frame: { up: [0, 1, 0], out: [1, 0, 0] },
  rules: [
    // Bow and loop; cream ribbon, ref box 197,110–211,170.
    { region: "ribbon", color: "#D5C6B6", shape: { kind: "band", yMin: 0.62, yMax: 2, rMin: 0, rMax: 3 } },
    { region: "ribbon", color: "#D5C6B6", shape: { kind: "box", min: [-2, -2, -0.18], max: [2, 2, 0.15] } },
    { region: "ribbon", color: "#D5C6B6", shape: { kind: "box", min: [-0.14, -2, -2], max: [0.18, 2, 2] } },
    // Box: sage, ref box 220,110–233,170.
    { region: "body", color: "#99A48F", shape: { kind: "any" } },
  ],
};

/** @type {OrnamentDesignSpec} */
const SNOWMAN_01 = {
  id: "snowman_01",
  sourceFile: "model-6.glb",
  referenceImage: "ref-01.42.25.png",
  hook: false,
  lods: ["medium", "low"],
  rules: [
    // Orange nose: median of the most saturated quartile of ref box 115,108–126,122.
    { region: "nose", color: "#E09261", shape: { kind: "box", min: [-0.13, 0.19, 0.43], max: [0.07, 0.37, 0.8] } },
    // Brown eyes and buttons: median of the darkest quartile of ref box 98,98–110,108.
    { region: "eye", color: "#5B3C2E", shape: { kind: "sphere", c: [-0.2, 0.335, 0.38], radius: 0.07 } },
    { region: "eye", color: "#5B3C2E", shape: { kind: "sphere", c: [0.12, 0.335, 0.41], radius: 0.07 } },
    { region: "button", color: "#5B3C2E", shape: { kind: "sphere", c: [-0.05, -0.32, 0.52], radius: 0.07 } },
    { region: "button", color: "#5B3C2E", shape: { kind: "sphere", c: [-0.05, -0.53, 0.54], radius: 0.075 } },
    // Hat: terracotta, ref box 70,10–160,60; then the low edge of the tilted brim.
    { region: "hat", color: "#D79E8C", shape: { kind: "band", yMin: 0.47, yMax: 2, rMin: 0, rMax: 2 } },
    { region: "hat", color: "#D79E8C", shape: { kind: "band", yMin: 0.36, yMax: 2, rMin: 0.4, rMax: 2 } },
    // Scarf: the ring and the hanging tail.
    { region: "scarf", color: "#D79E8C", shape: { kind: "band", yMin: -0.15, yMax: 0.12, rMin: 0, rMax: 2 } },
    { region: "scarf", color: "#D79E8C", shape: { kind: "box", min: [0.12, -0.56, 0.4], max: [0.46, -0.1, 1] } },
    // Body: cream, ref box 60,150–110,200.
    { region: "body", color: "#E2D1C1", shape: { kind: "any" } },
  ],
};

// Gift pile: one fused island, so one box rule per object (footprints seen from the top), each y −2 … 2.
// Colours from ref-01.42.39.png: sage box 200,45–225,90; cream 75,95–110,150; terracotta 320,90–350,130; mustard 175,240–205,280.
const SAGE = "#ABB59E", CREAM = "#D8BFAA", TERRACOTTA = "#E1A28B", MUSTARD = "#D3B276";
/** @param {OrnamentRegion} region @param {string} color @param {number} x0 @param {number} x1 @param {number} z0 @param {number} z1 @returns {OrnamentRule} */
const footprint = (region, color, x0, x1, z0, z1) => ({ region, color, shape: { kind: "box", min: [x0, -2, z0], max: [x1, 2, z1] } });

/** @type {OrnamentDesignSpec} */
const GIFT_PILE_01 = {
  id: "gift_pile_01",
  sourceFile: "model-7.glb",
  referenceImage: "ref-01.42.39.png",
  hook: false,
  lods: ["medium", "low"],
  rules: [
    footprint("cream", CREAM, -0.52, 0.02, -1.0, -0.48),
    footprint("sage", SAGE, -0.05, 0.75, -0.62, 0.06),
    footprint("sage", SAGE, -1.0, -0.48, -0.5, 0.02),
    footprint("mustard", MUSTARD, -0.47, -0.02, -0.42, 0.02),
    footprint("terracotta", TERRACOTTA, -0.82, -0.35, 0.05, 0.5),
    footprint("cream", CREAM, -0.27, 0.27, 0.02, 0.53),
    footprint("sage", SAGE, -0.03, 0.48, 0.5, 0.95),
    footprint("terracotta", TERRACOTTA, 0.25, 0.98, -0.03, 0.62),
    footprint("mustard", MUSTARD, -0.53, -0.05, 0.48, 0.93),
    { region: "sage", color: SAGE, shape: { kind: "any" } },
  ],
};

/** In ORNAMENT_GLB_DESIGN_IDS order (CA1). */
export const CHRISTMAS_MODEL_DESIGNS = Object.freeze([BALL_01, STAR_01, BOW_01, BELL_01, STOCKING_01, GIFT_01]);

/** Scene props (MFW-124): medium and low LODs only, no hook. */
export const CHRISTMAS_PROP_DESIGNS = Object.freeze([SNOWMAN_01, GIFT_PILE_01]);
