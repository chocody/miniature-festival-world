import type { Page } from "@playwright/test";
import { E2E_APPEARANCE, E2E_EVENT_ID, makeZoneBody } from "./zoneFixtures";
/** MFW-65 e2e literals (tests/unit/krathong-models-e2e-literals.test.ts pins them to the app constants). */
/** = krathongDesignUrl(KRATHONG_DEFAULT_DESIGN, "full"). */
export const E2E_DESIGN_FULL_URL = "/models/krathong/banana_leaf_01.full.glb";
/** Route pattern of every design file (KE3 aborts it). */
export const E2E_DESIGN_ROUTE = "**/models/krathong/**";

// MFW-78 design picker (EL1 pins these to the app constants)
/** = CUSTOMIZER_COPY.designGroupLabel. */
export const E2E_DESIGN_GROUP_LABEL = "แบบกระทง";
/** = KRATHONG_DESIGN_LABELS (accessible names of the five design tiles, never shown). */
export const E2E_DESIGN_LABELS = {
  banana_leaf_01: "กระทงใบตอง",
  lotus_bud_01: "กระทงบัวตูม",
  marigold_01: "กระทงดาวเรือง",
  rose_candles_01: "กระทงกุหลาบ",
  naga_01: "กระทงพญานาค",
} as const;
export type E2EDesignId = keyof typeof E2E_DESIGN_LABELS;
/** = KRATHONG_DEFAULT_DESIGN. */
export const E2E_DEFAULT_DESIGN: E2EDesignId = "banana_leaf_01";
/** = KRATHONG_DESIGN_USERDATA_KEY (userData key of the hero design body). */
export const E2E_DESIGN_USERDATA_KEY = "krathongDesign";
/** River batch mesh of each design body (= riverBatchMeshPrefix + krathongInstanceBucketIndex(`design:<id>`, "designBody")). */
export const E2E_DESIGN_BUCKET_MESH_BY_ID: Readonly<Record<E2EDesignId, string>> = {
  banana_leaf_01: "river-batch-18",
  lotus_bud_01: "river-batch-19",
  marigold_01: "river-batch-20",
  rose_candles_01: "river-batch-21",
  naga_01: "river-batch-22",
};

/** The e2e zone appearance with a chosen design. */
export function e2eAppearanceWithDesign(id: E2EDesignId): Record<string, unknown> {
  return { ...E2E_APPEARANCE, design: id };
}

/** Mixed-design zone of DP2 / X78: one zone, 12 items cycling legacy (no design), lotus_bud_01 and naga_01. */
export const E2E_MIXED_ZONE_APPEARANCES: readonly Record<string, unknown>[] = [
  E2E_APPEARANCE,
  e2eAppearanceWithDesign("lotus_bud_01"),
  e2eAppearanceWithDesign("naga_01"),
];
const E2E_MIXED_ZONE_ITEM_COUNT = 12;

/** Routes GET /api/zones (one zone) and GET /api/creations (the mixed-design zone). Register before mockCreateCreation. */
export async function mockMixedDesignZone(page: Page): Promise<void> {
  await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }));
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      const body = makeZoneBody(1, E2E_MIXED_ZONE_ITEM_COUNT);
      body.items = body.items.map((item, i) => ({ ...item, appearance: E2E_MIXED_ZONE_APPEARANCES[i % E2E_MIXED_ZONE_APPEARANCES.length] }));
      return route.fulfill({ json: body });
    },
  );
}
