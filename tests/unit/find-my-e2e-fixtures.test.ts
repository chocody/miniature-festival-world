// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MY_CREATION_ENTRY_KEYS } from "@/config/myCreations.config";
import { MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { publicCreationsToRiverItems } from "@/core/world";
import { toClientPublicCreation } from "@/services/api/zoneClient";
import { E2E_CREATION_ID } from "../e2e/fixtures/ritualRoutes";
import { E2E_MY_CREATION_ENTRY_KEYS_SORTED, E2E_MY_CREATIONS_STORAGE_KEY, makeOwnZoneItem } from "../e2e/fixtures/findMyFixtures";

describe("find-my e2e fixtures", () => {
  it("match the real constants", () => {
    expect(E2E_MY_CREATIONS_STORAGE_KEY).toBe(MY_CREATIONS_STORAGE_KEY);
    expect([...E2E_MY_CREATION_ENTRY_KEYS_SORTED]).toEqual([...MY_CREATION_ENTRY_KEYS].sort());
  });
  it("the own zone item passes the client validators", () => {
    const item = makeOwnZoneItem(2, E2E_CREATION_ID, Date.now());
    expect(toClientPublicCreation(item, "loy_krathong", 2)).not.toBeNull();
    expect(publicCreationsToRiverItems([toClientPublicCreation(item, "loy_krathong", 2)!], { eventId: "loy_krathong", zoneId: 2 })).toHaveLength(1);
  });
});
