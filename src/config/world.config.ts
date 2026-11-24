/** Max creations returned (and rendered) per zone; more participants open new zones (owner, 2026-11-23, open question 4). */
export const ZONE_ITEM_CAP = 80;
/** Zones are numbered from 1 (spec "zone=1", backlog 5.3 "Zone 2, 3, …"). Lead decision, MFW-12. */
export const ZONE_ID_MIN = 1;

/** Which zone a visitor sees first when entering the shared world. */
export const INITIAL_ZONE_POLICIES = Object.freeze(["NEWEST", "FIRST"] as const);
export type InitialZonePolicy = (typeof INITIAL_ZONE_POLICIES)[number];
/**
 * PLACEHOLDER product default (spec silent, MFW-25 Open question 1): start at the newest (most downstream) open zone,
 * the "front" of the growing river. Flip to "FIRST" to start at Zone 1.
 */
export const WORLD_INITIAL_ZONE_POLICY: InitialZonePolicy = "NEWEST";
