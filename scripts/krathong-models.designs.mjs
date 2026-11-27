// Krathong design table for scripts/krathong-models.mjs (MFW-65, docs/design/models.md). Data only.
// Region rules are tested in order at each face centroid in SOURCE coordinates (the decimated GLB, before normalising);
// the first match wins and the last rule must be { kind: "any" }. Colours are sRGB hex (the script stores them linear).

/** @typedef {import("./krathong-models-lib.mjs").DesignSpec} DesignSpec */

/** = KRATHONG_DESIGN_FOOTPRINT in src/config/krathongDesigns.config.ts (KA6 asserts they are equal). */
export const FOOTPRINT = Object.freeze({ radius: 1.15, bottomY: -0.18 });

/** Crease angle per LOD for the corner normals (DRAFT, MFW-65). */
export const CREASE_DEG = Object.freeze({ full: 60, medium: 75, low: 75 });

const CANDLE_AXIS = { cx: -0.012, cz: 0.01 };
/** banana_leaf_01 flowers: [x, z, petal colour] in source coordinates (centres read from an orthographic top view). */
const FLOWERS = [
  [-0.417, 0.017, "#FFF3E6"],
  [0.309, -0.086, "#F7B3C2"],
  [-0.133, 0.398, "#F59A8C"],
  [0.232, 0.351, "#FFF3E6"],
];

/** @type {DesignSpec[]} */
export const KRATHONG_MODEL_DESIGNS = [
  {
    id: "banana_leaf_01",
    sourceFile: "hy3d-model.glb",
    referenceImage: "krathong-ref-owner.png",
    rules: [
      // Flame: everything above the wick neck on the candle axis (cut out; drawn by the procedural MFW-69 flame).
      { region: "flame", color: "#FFD27A", shape: { kind: "column", ...CANDLE_AXIS, radius: 0.16, yMin: 0.37, yMax: 2 } },
      // Candle: the cream pillar in the reference.
      { region: "candle", color: "#F6E7C1", shape: { kind: "column", ...CANDLE_AXIS, radius: 0.165, yMin: -0.3, yMax: 0.37 } },
      // Flower centres: the yellow middles of the reference's 5-petal flowers (one sphere per flower of this model).
      ...FLOWERS.map(([x, z]) => ({ region: "flowers", color: "#F7C94F", shape: { kind: "sphere", c: [x, -0.21, z], radius: 0.07 } })),
      // Flower petals: white, coral and pink, as the three flowers in the front of the reference.
      ...FLOWERS.map(([x, z, color]) => ({ region: "flowers", color, shape: { kind: "sphere", c: [x, -0.25, z], radius: 0.2 } })),
      // Base: the deep green bowl at the bottom of the reference.
      { region: "base", color: "#4F8A45", shape: { kind: "band", yMin: -2, yMax: -0.45, rMin: 0, rMax: 2 } },
      // Tall fronds behind the candle: the lighter, upright banana leaves of the reference.
      { region: "leaves", color: "#86C06A", shape: { kind: "band", yMin: -0.05, yMax: 2, rMin: 0, rMax: 2 } },
      // Everything else: the leaf ring around the rim (mid green in the reference).
      { region: "leaves", color: "#6FAE57", shape: { kind: "any" } },
    ],
  },
];
