// House model table for scripts/house-model.mjs (MFW-66, docs/design/models.md §10). Data only.
// "Source units" = the owner file's units; "rotated frame" = after the sourceYawRad turn, where the walls are axis-aligned.

/**
 * @typedef {"walls" | "chimney" | "chimneyCap" | "step" | "door" | "trim"} ShellRegion
 * @typedef {{ axis: "x" | "z", along: readonly [number, number], y: readonly [number, number], outer: number, inner: number }} Opening
 * @typedef {{ key: string, hex: string }} PaletteEntry
 */

/** @type {PaletteEntry} */
const STONE = Object.freeze({ key: "stone", hex: "#B9B7A8" });
/** @type {PaletteEntry} */
const WOOD_DARK = Object.freeze({ key: "woodDark", hex: "#725F46" });

/**
 * @param {"x" | "z"} axis
 * @param {[number, number]} along
 * @param {[number, number]} y
 * @param {number} outer
 * @param {number} inner
 * @returns {Opening}
 */
const opening = (axis, along, y, outer, inner) =>
  Object.freeze({ axis, along: Object.freeze(along), y: Object.freeze(y), outer, inner });

export const HOUSE_MODEL_SPEC = Object.freeze({
  /** rotated = (x cosθ − z sinθ, y, x sinθ + z cosθ) makes the walls axis-aligned. */
  sourceYawRad: Math.PI / 18,
  /** The walls' x extent after scaling (= the old procedural body width, so every layout guard holds). */
  bodyWidth: 0.8,
  /** Drop faces with unit normal y below this (back-facing at the fixed camera elevation, any yaw). */
  downFaceMaxNormalY: -0.84,
  /** Source units: a face is "on a wall" if its centroid is this close to the nearest wall plane. */
  wallBand: 6,
  /** Drop an on-wall face of an inwardRegions region if n · (that wall's outward normal) < this. */
  inwardDot: -0.9,
  inwardRegions: Object.freeze(/** @type {ShellRegion[]} */ (["trim", "door", "step"])),
  /** Regions left out of the LOW lite shell (MFW-77, owner 2026-11-27). */
  liteDroppedRegions: Object.freeze(/** @type {ShellRegion[]} */ (["trim"])),
  /** The door knob (216 triangles, under 1 px). */
  droppedNodes: Object.freeze(["Cylinder001"]),
  /** Any primitive with this material index is the roof. */
  roofMaterial: 1,
  /** First match wins, after the roof rule; every other node is "trim". */
  regions: Object.freeze({
    walls: Object.freeze({ node: "Box001", material: 0 }),
    chimney: Object.freeze(["Box002"]),
    chimneyCap: Object.freeze(["Box003"]),
    step: Object.freeze(["Box040"]),
    door: Object.freeze(["Plane006", "Box035", "Box036", "Box037", "Box038", "Box039"]),
  }),
  /** Region colours; `key` = the LOOK_PALETTE name (tests/unit/house-model-asset.test.ts HA3). */
  palette: Object.freeze(
    /** @type {Record<ShellRegion, PaletteEntry>} */ ({
      walls: Object.freeze({ key: "wallCream", hex: "#E4D4B3" }),
      chimney: STONE,
      chimneyCap: WOOD_DARK,
      step: STONE,
      door: Object.freeze({ key: "doorWood", hex: "#B9815A" }),
      trim: WOOD_DARK,
    }),
  ),
  /** Window holes in the rotated frame (axis = the wall normal axis; along = the range on the other horizontal axis). */
  openings: Object.freeze({
    frontA: opening("z", [110.29, 129.63], [16.79, 39.3], 13.13, 15.8),
    frontB: opening("z", [169.54, 188.88], [16.79, 39.3], 13.13, 15.8),
    backA: opening("z", [110.29, 129.63], [16.82, 39.33], 82.36, 79.69),
    backB: opening("z", [169.54, 188.88], [16.8, 39.31], 82.36, 79.69),
    side: opening("x", [37.95, 57.18], [16.84, 39.05], 99.98, 102.41),
  }),
  /** Local units added on each side of the largest opening. */
  glassMargin: 0.01,
  /** Local units (= the old houseWindow box depth). */
  glassDepth: 0.02,
  /** Output rounding. */
  decimals: 4,
});

/** Region order of the shell palette (buildHouseModel step 9). */
export const SHELL_REGION_ORDER = Object.freeze(
  /** @type {ShellRegion[]} */ (["walls", "chimney", "chimneyCap", "step", "door", "trim"]),
);
