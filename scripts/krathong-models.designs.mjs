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


/**
 * Region rules of the MFW-76 designs (docs/design/models.md §4.2). Positions: orthographic top / front views of the welded
 * source on a 0.1 grid. Colours: the median of the lit half (luminance ≥ median) of a pixel box on the design's reference
 * image ("ref box x0,y0–x1,y1" in image pixels).
 */
/** lotus_bud_01 candle axis (centre of the candle circle in the top view). */
const LOTUS_AXIS = { cx: -0.02, cz: -0.023 };
/** @type {DesignSpec} */
const LOTUS_BUD_01 = {
  id: "lotus_bud_01",
  sourceFile: "hy3d-model (1).glb",
  referenceImage: "image_1795720193203851.png",
  rules: [
    // Flame: the bud-shaped teardrop on the candle top, above the wick neck (y 0.46; cut, drawn by the procedural flame). #FBD7A1 = ref flame, box 560,180–630,290.
    { region: "flame", color: "#FBD7A1", shape: { kind: "column", ...LOTUS_AXIS, radius: 0.21, yMin: 0.45, yMax: 2 } },
    // Candle top: cream, ref box 560,320–640,400.
    { region: "candle", color: "#FDDCB2", shape: { kind: "column", ...LOTUS_AXIS, radius: 0.18, yMin: 0.15, yMax: 0.45 } },
    // Candle foot: peach, ref box 560,460–640,520.
    { region: "candle", color: "#CE8F83", shape: { kind: "column", ...LOTUS_AXIS, radius: 0.18, yMin: -0.3, yMax: 0.15 } },
    // Open lotus (back left): yellow centre, ref box 370,285–400,300.
    { region: "flowers", color: "#EDDA91", shape: { kind: "sphere", c: [-0.33, 0.4, -0.61], radius: 0.07 } },
    // Open lotus petals: ref box 330,240–450,340.
    { region: "flowers", color: "#E1A49B", shape: { kind: "sphere", c: [-0.33, 0.3, -0.61], radius: 0.22 } },
    // Right bud: pink tip (ref box 400,150–450,200) over green sepals (ref box 400,215–415,235).
    { region: "flowers", color: "#DEA3A7", shape: { kind: "sphere", c: [0.64, 0.56, 0.21], radius: 0.12 } },
    { region: "flowers", color: "#8B9963", shape: { kind: "sphere", c: [0.64, 0.42, 0.21], radius: 0.17 } },
    // Back bud: as the right bud.
    { region: "flowers", color: "#DEA3A7", shape: { kind: "sphere", c: [-0.03, 0.62, -0.75], radius: 0.12 } },
    { region: "flowers", color: "#8B9963", shape: { kind: "sphere", c: [-0.03, 0.48, -0.75], radius: 0.17 } },
    // Inner petals: pale pink, ref box 530,530–640,600.
    { region: "leaves", color: "#E0BDC0", shape: { kind: "band", yMin: -0.45, yMax: 0.13, rMin: 0, rMax: 0.5 } },
    // Lily pads and stems above the petals: ref box 250,380–330,420.
    { region: "flowers", color: "#AAC39C", shape: { kind: "band", yMin: 0.05, yMax: 2, rMin: 0.33, rMax: 2 } },
    // Base drum: green, ref box 330,690–450,760.
    { region: "base", color: "#5F815D", shape: { kind: "band", yMin: -2, yMax: -0.45, rMin: 0, rMax: 2 } },
    // Everything else: the deeper pink outer petals, ref box 210,490–330,560.
    { region: "leaves", color: "#D69EA1", shape: { kind: "any" } },
  ],
};

/** marigold_01 marigolds: angle (degrees, atan2(z, x) about the candle axis) and colour key, read from a top view. */
const MARIGOLDS = [-103, -73, -43, -13, 17, 47, 77, 107, 137, 167, -163, -133].map((deg, i) => [deg, i % 2 === 0 ? "ORANGE" : "YELLOW"]);
/** Marigold orange (ref box 400,600–520,700) and yellow (ref box 290,540–400,640). */
const MARIGOLD = { ORANGE: "#CD8A42", YELLOW: "#DDAC56" };
const MARIGOLD_AXIS = { cx: -0.023, cz: -0.023 };
/** @type {DesignSpec} */
const MARIGOLD_01 = {
  id: "marigold_01",
  sourceFile: "hy3d-model (2).glb",
  referenceImage: "image_1795720401483270.png",
  rules: [
    // Flame above the wick neck (cut). #E5B870 = ref flame, box 560,180–620,290.
    { region: "flame", color: "#E5B870", shape: { kind: "column", ...MARIGOLD_AXIS, radius: 0.17, yMin: 0.43, yMax: 2 } },
    // Cream candle: ref box 550,320–650,480.
    { region: "candle", color: "#DDC4A3", shape: { kind: "column", ...MARIGOLD_AXIS, radius: 0.175, yMin: -0.2, yMax: 0.43 } },
    // Inner lotus petals round the candle: lighter rose, ref box 380,420–460,560 (lit side).
    { region: "leaves", color: "#D27F83", shape: { kind: "band", yMin: -0.45, yMax: 2, rMin: 0, rMax: 0.45 } },
    // Outer lotus petals: deep rose, ref box 380,420–460,560.
    { region: "leaves", color: "#C67577", shape: { kind: "band", yMin: -0.1, yMax: 2, rMin: 0, rMax: 0.7 } },
    // Lower woven band: ref box 380,790–800,850.
    { region: "base", color: "#4E7B4F", shape: { kind: "band", yMin: -2, yMax: -0.61, rMin: 0, rMax: 2 } },
    // Upper woven band: ref box 320,690–340,710.
    { region: "base", color: "#729E6F", shape: { kind: "band", yMin: -0.61, yMax: -0.44, rMin: 0, rMax: 2 } },
    // Marigolds round the rim, orange / yellow alternating as in the reference.
    ...MARIGOLDS.map(([deg, c]) => ({
      region: "flowers",
      color: MARIGOLD[c],
      shape: { kind: "sphere", c: [MARIGOLD_AXIS.cx + 0.82 * Math.cos((deg * Math.PI) / 180), -0.2, MARIGOLD_AXIS.cz + 0.82 * Math.sin((deg * Math.PI) / 180)], radius: 0.3 },
    })),
    // Everything else: marigold orange.
    { region: "flowers", color: MARIGOLD.ORANGE, shape: { kind: "any" } },
  ],
};

/**
 * naga_01 candles: [x, z, top y, radius, flame yMin, colour]; the axis is the flame tip (x, z), the top the candle's flat top. A flame
 * column starts above the neighbouring candle tops too, so it never takes a neighbour's rim.
 */
const NAGA_CANDLES = [
  [-0.033, -0.004, 0.42, 0.12, 0.435, "PEACH"],
  [0.126, -0.192, 0.38, 0.1, 0.4, "PEACH"],
  [-0.157, -0.163, 0.39, 0.1, 0.435, "PINK"],
  [0.124, 0.126, 0.39, 0.1, 0.435, "PEACH"],
  [-0.237, 0.086, 0.22, 0.1, 0.245, "PINK"],
  [-0.077, 0.213, 0.23, 0.1, 0.245, "PEACH"],
];
/** Candle colours of the naga reference: the pink candle on the left, the peach (glow-lit) ones. */
const NAGA_CANDLE = { PINK: "#EEA5A4", PEACH: "#FCDCAF" };
/** @type {DesignSpec} */
const NAGA_01 = {
  id: "naga_01",
  sourceFile: "hy3d-model (4).glb",
  referenceImage: "image_1795720609153034.png",
  maxFlames: { medium: 3, low: 3 },
  rules: [
    // Flames above each candle (cut). #F9D6B1 = ref flame glow, box 580,290–650,380.
    ...NAGA_CANDLES.map(([x, z, , , yMin]) => ({ region: "flame", color: "#F9D6B1", shape: { kind: "column", cx: x, cz: z, radius: 0.09, yMin, yMax: 2 } })),
    // Candles: pink (ref box 515,320–560,420) or peach (ref box 580,290–650,380).
    ...NAGA_CANDLES.map(([x, z, , r, yMin, c]) => ({ region: "candle", color: NAGA_CANDLE[c], shape: { kind: "column", cx: x, cz: z, radius: r, yMin: -0.3, yMax: yMin } })),
    // Naga crest: gold, ref box 555,505–585,550.
    { region: "flowers", color: "#D5AA8E", shape: { kind: "sphere", c: [-0.165, 0.06, 0.8], radius: 0.07 } },
    // Naga head at the front: green, ref box 320,640–360,670 (the scaly naga body).
    { region: "flowers", color: "#94AB84", shape: { kind: "sphere", c: [-0.165, -0.05, 0.8], radius: 0.17 } },
    // Rice stalks (left, right, back): gold, ref box 440,210–520,250.
    { region: "flowers", color: "#E0B789", shape: { kind: "sphere", c: [-0.62, 0.15, 0.45], radius: 0.25 } },
    { region: "flowers", color: "#E0B789", shape: { kind: "sphere", c: [0.78, 0.2, 0.3], radius: 0.28 } },
    { region: "flowers", color: "#E0B789", shape: { kind: "sphere", c: [0.04, 0.15, -0.9], radius: 0.2 } },
    // Naga body swags over the drum: green, as the head.
    { region: "flowers", color: "#94AB84", shape: { kind: "band", yMin: -0.72, yMax: -0.4, rMin: 0.86, rMax: 2 } },
    // Base drum: green, ref box 330,700–450,760.
    { region: "base", color: "#6D9368", shape: { kind: "band", yMin: -2, yMax: -0.42, rMin: 0, rMax: 2 } },
    // Inner petals: pale pink, ref box 480,520–560,580.
    { region: "leaves", color: "#D2A6A4", shape: { kind: "band", yMin: -0.42, yMax: 2, rMin: 0, rMax: 0.6 } },
    // Everything else: the outer pink petals, ref box 260,450–330,520.
    { region: "leaves", color: "#D39D97", shape: { kind: "any" } },
  ],
};

/**
 * rose_candles_01 (hy3d-model (3).glb, reference image_1795720517989598.png). Candles: [x, z, top y, radius, colour]; the
 * axis is the flame tip (x, z), the top is the candle's flat top, both measured on the welded source.
 */
const ROSE_CANDLES = [
  // Big front candle (the glowing one in the reference).
  [-0.1, 0.07, 0.43, 0.19, "CREAM"],
  // Back row (z ≈ −0.65), left to right.
  [-0.578, -0.618, 0.25, 0.12, "GREEN"],
  [-0.337, -0.686, 0.49, 0.12, "CREAM"],
  [-0.081, -0.656, 0.69, 0.12, "GREEN"],
  [0.189, -0.635, 0.49, 0.12, "CREAM"],
  // Middle row (z ≈ −0.4).
  [-0.617, -0.333, 0.11, 0.12, "CREAM"],
  [-0.443, -0.44, 0.3, 0.12, "GREEN"],
  [-0.253, -0.409, 0.42, 0.12, "CREAM"],
  [-0.034, -0.371, 0.42, 0.12, "GREEN"],
  [0.211, -0.394, 0.42, 0.12, "GREEN"],
  // Front row (z ≈ −0.2).
  [-0.455, -0.218, 0.19, 0.12, "GREEN"],
  [-0.247, -0.194, 0.21, 0.12, "CREAM"],
  [-0.055, -0.167, 0.21, 0.12, "GREEN"],
  [0.205, -0.204, 0.2, 0.12, "CREAM"],
  [0.438, -0.229, 0.2, 0.12, "GREEN"],
];
/** The two candles without a flame (flat tops at y ≈ 0.26), back right. */
const ROSE_PLAIN_CANDLES = [
  [0.432, -0.642, 0.12, "CREAM"],
  [0.443, -0.439, 0.12, "GREEN"],
];
/** Rose candle colours (see the candle rule). */
const ROSE = {
  CREAM: "#E0C39D",
  GREEN: "#B3C0A0",
};
/** @type {DesignSpec} */
const ROSE_CANDLES_01 = {
  id: "rose_candles_01",
  sourceFile: "hy3d-model (3).glb",
  referenceImage: "image_1795720517989598.png",
  maxFlames: { full: 16, medium: 5, low: 5 },
  rules: [
    // Flames above the wick foot (cut). #D6A355 = the matte orange small flames, ref box 495,345 (±8 px); uncut flames keep it.
    ...ROSE_CANDLES.map(([x, z, top, r]) => ({ region: "flame", color: "#D6A355", shape: { kind: "column", cx: x, cz: z, radius: r > 0.15 ? 0.15 : 0.08, yMin: top + 0.04, yMax: 2 } })),
    // Candles: cream (ref box 545,320–650,500) / pale green (ref box 330,400–380,480).
    ...ROSE_CANDLES.map(([x, z, top, r, c]) => ({ region: "candle", color: ROSE[c], shape: { kind: "column", cx: x, cz: z, radius: r, yMin: -0.1, yMax: top + 0.015 } })),
    ...ROSE_PLAIN_CANDLES.map(([x, z, r, c]) => ({ region: "candle", color: ROSE[c], shape: { kind: "column", cx: x, cz: z, radius: r, yMin: -0.1, yMax: 2 } })),
    // Base drum: green, ref box 392,772–408,788.
    { region: "base", color: "#588759", shape: { kind: "band", yMin: -2, yMax: -0.6, rMin: 0, rMax: 2 } },
    // Green filler under the flowers: ref box 302,682–318,698.
    { region: "leaves", color: "#79A177", shape: { kind: "band", yMin: -0.6, yMax: -0.5, rMin: 0, rMax: 2 } },
    // Red lotus-roses: ref box 400,480–540,560.
    { region: "flowers", color: "#AD4951", shape: { kind: "sphere", c: [-0.57, -0.05, 0.09], radius: 0.22 } },
    { region: "flowers", color: "#AD4951", shape: { kind: "sphere", c: [0.26, -0.05, 0.07], radius: 0.2 } },
    { region: "flowers", color: "#AD4951", shape: { kind: "sphere", c: [-0.23, -0.15, 0.54], radius: 0.2 } },
    // Coral roses (right): ref box 780,390–940,480.
    { region: "flowers", color: "#B96867", shape: { kind: "sphere", c: [0.65, -0.1, 0.21], radius: 0.2 } },
    { region: "flowers", color: "#B96867", shape: { kind: "sphere", c: [0.75, -0.1, -0.09], radius: 0.17 } },
    // Purple orchids, front right: ref box 650,660–750,750.
    { region: "flowers", color: "#90628E", shape: { kind: "box", min: [0.1, -0.6, 0.35], max: [1.1, 0.3, 1.1] } },
    // White carnations, front left: ref box 410,690–480,750.
    { region: "flowers", color: "#DBCFBF", shape: { kind: "box", min: [-1.1, -0.6, 0.25], max: [-0.1, 0.3, 1.1] } },
    // Everything else: pale-yellow carnations, ref box 280,520–350,570.
    { region: "flowers", color: "#EED8A6", shape: { kind: "any" } },
  ],
};

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
  LOTUS_BUD_01,
  MARIGOLD_01,
  ROSE_CANDLES_01,
  NAGA_01,
];
