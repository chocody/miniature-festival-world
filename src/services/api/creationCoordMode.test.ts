import { describe, expect, it } from "vitest";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { coordModeForEvent, EVENT_COORD_MODES } from "./creationCoordMode";
import { createDefaultReleaseAdapters } from "./releaseAdapters";

describe("coord mode per event", () => {
  it("CM1: the map", () => {
    expect(coordModeForEvent("loy_krathong")).toBe("SPLINE_PATH");
    expect(coordModeForEvent("christmas")).toBe("CYLINDRICAL_SURFACE");
    expect(coordModeForEvent("new_year")).toBeNull();
    expect(coordModeForEvent("halloween")).toBeNull();
    expect(Object.isFrozen(EVENT_COORD_MODES)).toBe(true);
  });

  it("CM2: every adapter builds a coord of its event's mode", () => {
    const registry = createDefaultReleaseAdapters();
    expect([...registry.keys()]).toEqual(["loy_krathong", "christmas"]);
    const ctx = { sceneTier: false, now: () => 0, readZone: () => ({ zoneItems: [], zone: null }) };
    for (const [id, adapter] of registry) {
      expect(adapter.eventId).toBe(id);
      expect(coordModeForEvent(id)).not.toBeNull();
      const parsed = parsePersistableCoord(adapter.buildCoord(adapter.defaultCandidate(ctx)));
      expect(parsed.ok && parsed.coord.mode).toBe(coordModeForEvent(id));
    }
  });
});
