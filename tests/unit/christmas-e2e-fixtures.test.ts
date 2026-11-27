// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isEventEnabled } from "../../src/config/featureFlags.config";
import { christmasConfig } from "../../src/config/events/christmas.config";
import { TREE_MAX_BANDS } from "../../src/config/events/christmas.tree.config";
import { ZONE_ID_MIN, ZONE_ITEM_CAP } from "../../src/config/world.config";
import { CREATIONS_API_PATH, ZONES_API_PATH } from "../../src/services/api/apiPaths";
import { fetchZoneDirectory, fetchZoneItems } from "../../src/services/api/zoneClient";
import {
  CHRISTMAS_E2E_BAND_COUNT,
  CHRISTMAS_E2E_BAND_LIMIT,
  CHRISTMAS_E2E_CREATIONS_PATH,
  CHRISTMAS_E2E_DIRECTORY,
  CHRISTMAS_E2E_EVENT_ID,
  CHRISTMAS_E2E_FIRST_BAND,
  CHRISTMAS_E2E_ZONES_PATH,
  makeChristmasBandBody,
  makeChristmasDirectoryBody,
} from "../e2e/fixtures/christmasFixtures";

function fakeFetch(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
}

describe("christmas e2e fixtures", () => {
  it("CF1: the literals match the app", () => {
    expect(CHRISTMAS_E2E_EVENT_ID).toBe(christmasConfig.id);
    expect(isEventEnabled(CHRISTMAS_E2E_EVENT_ID)).toBe(true);
    expect(CHRISTMAS_E2E_FIRST_BAND).toBe(ZONE_ID_MIN);
    expect(CHRISTMAS_E2E_BAND_LIMIT).toBe(ZONE_ITEM_CAP);
    expect(CHRISTMAS_E2E_ZONES_PATH).toBe(ZONES_API_PATH);
    expect(CHRISTMAS_E2E_CREATIONS_PATH).toBe(CREATIONS_API_PATH);
    expect(CHRISTMAS_E2E_BAND_COUNT).toBe(12);
    expect(CHRISTMAS_E2E_BAND_COUNT).toBeLessThanOrEqual(TREE_MAX_BANDS);
  });

  it("CF2: the directory fixture is frozen and the client accepts it", async () => {
    expect(CHRISTMAS_E2E_DIRECTORY).toEqual({ eventId: "christmas", zoneCount: 12 });
    expect(Object.isFrozen(CHRISTMAS_E2E_DIRECTORY)).toBe(true);
    const res = await fetchZoneDirectory("christmas", { fetch: fakeFetch(CHRISTMAS_E2E_DIRECTORY) });
    expect(res).toEqual({ ok: true, zoneCount: 12 });
  });

  it.each([1, 12])("CF3: band %i body passes the client", async (n) => {
    const res = await fetchZoneItems("christmas", n, { fetch: fakeFetch(makeChristmasBandBody(n)) });
    expect(res).toEqual({ ok: true, items: [] });
  });

  it("CF4: bad counts and ids throw RangeError", () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => makeChristmasDirectoryBody(bad)).toThrow(RangeError);
      expect(() => makeChristmasBandBody(bad)).toThrow(RangeError);
    }
    expect(makeChristmasDirectoryBody(3).zoneCount).toBe(3);
  });
});
