/** Literals mirror app constants (no src/ imports, like zoneFixtures.ts); christmas-e2e-fixtures.test.ts pins each one. */

/** = christmasConfig.id */
export const CHRISTMAS_E2E_EVENT_ID = "christmas" as const;
/** The L16 "12-band fixture" (16.14, 16.17, 16.18, 16.26, 16.29). */
export const CHRISTMAS_E2E_BAND_COUNT = 12;
/** = ZONE_ID_MIN */
export const CHRISTMAS_E2E_FIRST_BAND = 1;
/** = ZONE_ITEM_CAP */
export const CHRISTMAS_E2E_BAND_LIMIT = 80;
/** = ZONES_API_PATH */
export const CHRISTMAS_E2E_ZONES_PATH = "/api/zones";
/** = CREATIONS_API_PATH */
export const CHRISTMAS_E2E_CREATIONS_PATH = "/api/creations";

/** Shape of ZoneDirectoryResponse. */
export interface ChristmasDirectoryBody {
  eventId: typeof CHRISTMAS_E2E_EVENT_ID;
  zoneCount: number;
}

/** Shape of PublicZoneResponse. */
export interface ChristmasBandBody {
  eventId: typeof CHRISTMAS_E2E_EVENT_ID;
  zoneId: number;
  limit: number;
  items: Record<string, unknown>[];
}

function assertBand(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < CHRISTMAS_E2E_FIRST_BAND) {
    throw new RangeError(`${label} must be a safe integer >= ${CHRISTMAS_E2E_FIRST_BAND}, got ${String(value)}`);
  }
}

export function makeChristmasDirectoryBody(bandCount: number = CHRISTMAS_E2E_BAND_COUNT): ChristmasDirectoryBody {
  assertBand(bandCount, "bandCount");
  return { eventId: CHRISTMAS_E2E_EVENT_ID, zoneCount: bandCount };
}

/** The 12-band directory fixture. */
export const CHRISTMAS_E2E_DIRECTORY = Object.freeze(makeChristmasDirectoryBody());

/** Bands are empty in MFW-89; later cards add ornament items. */
export function makeChristmasBandBody(bandId: number): ChristmasBandBody {
  assertBand(bandId, "bandId");
  return { eventId: CHRISTMAS_E2E_EVENT_ID, zoneId: bandId, limit: CHRISTMAS_E2E_BAND_LIMIT, items: [] };
}
