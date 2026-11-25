/** Public API paths and query names shared by the server routes and the client (MFW-12 / MFW-25). Dependency-free: safe in the landing chunk. */
export const CREATIONS_API_PATH = "/api/creations";
export const ZONES_API_PATH = "/api/zones";
export const ZONE_API_QUERY_PARAMS = Object.freeze({ event: "event", zone: "zone" } as const);
