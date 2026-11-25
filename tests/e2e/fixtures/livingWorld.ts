/**
 * MFW-50 living-world e2e literals. src/ is not imported into Playwright: tests/unit/living-world-e2e-literals.test.ts pins
 * the counts to LIVING_WORLD_TIERS and the names to SCENE_OBJECT_NAMES.
 */
export const E2E_LIVING_WORLD = {
  villagerCount: { HIGH: 8, MEDIUM: 5, LOW: 2 },
  moteCount: { HIGH: 16, MEDIUM: 10, LOW: 0 },
  headsName: "scene-villager-heads",
  motesName: "scene-ambient-motes",
  livingPrefixes: ["scene-villager", "scene-ambient-motes", "scene-blob-shadows-villagers"],
  /** Poll budget for "something moved" (the idle redraw ticks every 67 ms on MEDIUM). */
  moveTimeoutMs: 5_000,
  /** Two reads this far apart must be identical when nothing may move. */
  staticWindowMs: 1_500,
  /** World units: a translation change above this is movement (not float noise). */
  minMove: 0.001,
} as const;
