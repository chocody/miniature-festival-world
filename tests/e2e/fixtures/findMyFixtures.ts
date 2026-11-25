import { makeZoneItem } from "./zoneFixtures";

/** = MY_CREATIONS_STORAGE_KEY (src/config/ownership.config.ts); checked by tests/unit/find-my-e2e-fixtures.test.ts. */
export const E2E_MY_CREATIONS_STORAGE_KEY = "mfw:myCreations:v1";
/** = MY_CREATION_ENTRY_KEYS, sorted. */
export const E2E_MY_CREATION_ENTRY_KEYS_SORTED = ["createdAt", "eventId", "expiresAt", "id", "zoneId"] as const;
/** A zone item with the given id, created now (the user's own krathong as GET /api/creations returns it). */
export function makeOwnZoneItem(zoneId: number, id: string, nowMs: number): Record<string, unknown> {
  return { ...makeZoneItem(zoneId, 0), id, createdAt: new Date(nowMs).toISOString() };
}
