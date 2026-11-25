// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { parsePersistableCoord } from "@/core/coordinates";
import { parseKrathongAppearance } from "@/core/customization";
import { publicCreationsToRiverItems } from "@/core/world/zoneRiverItems";
import type { PublicCreation } from "@/services/api/creationTypes";
import { E2E_APPEARANCE, E2E_LANE_ID, E2E_SPEED_FACTOR, makeZoneBody, makeZoneItem } from "../e2e/fixtures/zoneFixtures";

describe("zone e2e fixtures", () => {
  it("match the real constants and validators", () => {
    expect(E2E_LANE_ID).toBe(LOY_KRATHONG_RIVER_LANE_ID);
    expect(E2E_SPEED_FACTOR).toBe(RIVER_DRIFT_SPEED_FACTOR);
    expect(parsePersistableCoord(makeZoneItem(1, 0).coord).ok).toBe(true);
    expect(parseKrathongAppearance(E2E_APPEARANCE).ok).toBe(true);
    const body = makeZoneBody(3, 85);
    expect(publicCreationsToRiverItems(body.items as unknown as PublicCreation[], { eventId: "loy_krathong", zoneId: 3 })).toHaveLength(80);
    const ids = body.items.map((i) => i.id as string);
    expect(new Set(ids).size).toBe(85);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
