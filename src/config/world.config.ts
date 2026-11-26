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

/**
 * MFW-58: stretches rendered on each side of the camera's stretch (3 slots: S−1, S, S+1). Technical: endlessRiver.test.ts proves the
 * largest view plus the hysteresis never reaches past S±1.
 */
export const RIVER_STRETCH_RENDER_RADIUS = 1;
/**
 * MFW-58: stretches whose zones are kept loaded on each side of the camera in 3D (5 stretches, ≤ 5 zones). DRAFT (spec silent: how
 * many zones stay loaded); 2 = the next zone is loaded a full stretch before it can come into view. 0 while no scene is mounted.
 */
export const ZONE_STREAM_LOAD_RADIUS = 2;
/** MFW-58: world units the camera focus must pass a seam before the current stretch changes (no flip-flop at a seam). Technical DRAFT. */
export const RIVER_STRETCH_SWITCH_HYSTERESIS = 1;
