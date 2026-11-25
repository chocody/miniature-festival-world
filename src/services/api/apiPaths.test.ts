// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CREATIONS_API_PATH, ZONES_API_PATH, ZONE_API_QUERY_PARAMS } from "./apiPaths";
import { ZONE_QUERY_PARAMS } from "./zoneQuery";

describe("apiPaths", () => {
  it("has the shared constants", () => {
    expect(ZONE_API_QUERY_PARAMS).toEqual({ event: "event", zone: "zone" });
    expect(ZONE_QUERY_PARAMS).toBe(ZONE_API_QUERY_PARAMS);
    expect(CREATIONS_API_PATH).toBe("/api/creations");
    expect(ZONES_API_PATH).toBe("/api/zones");
  });
});
