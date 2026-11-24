/** Server-only env var names (never NEXT_PUBLIC). Both set → Supabase backend; both absent → in-memory; one → misconfigured. */
export const SUPABASE_URL_ENV = "SUPABASE_URL";
export const SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
/** Hostnames allowed over plain http (local Supabase only); everything else must be https. */
export const LOCAL_SUPABASE_HOSTNAMES = Object.freeze(["localhost", "127.0.0.1"] as const);
/** PostgREST base path, relative to the project URL. */
export const SUPABASE_REST_PATH = "/rest/v1/";
/** Server-only view that hides flagged / hidden / auto-hidden / expired items (open question 3). */
export const CREATIONS_PUBLIC_VISIBLE_VIEW = "creations_public_visible";
/** Atomic two-table insert function (relative to SUPABASE_REST_PATH). */
export const INSERT_CREATION_RPC_PATH = "rpc/mfw_insert_creation";
/** Stable zone order: oldest first, id as tie-breaker. */
export const PUBLIC_ZONE_ORDER = "created_at.asc,id.asc";
/** Explicit column allowlist for every public read (invariant C). Never "*". */
export const PUBLIC_CREATION_COLUMNS = Object.freeze([
  "id",
  "event_id",
  "zone_id",
  "appearance",
  "coord",
  "public_wish_text",
  "created_at",
  "expires_at",
] as const);
/** Fail fast so callers get 503 instead of hanging. Lead decision, MFW-12. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 5_000;
/** Postgres `integer` upper bound (zone_id column type). */
export const PG_INT4_MAX = 2_147_483_647;
/** Postgres uuid text form (lowercase). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Atomic report increment (relative to SUPABASE_REST_PATH). MFW-13. */
export const REPORT_CREATION_RPC_PATH = "rpc/mfw_report_creation";
/** Zone directory read (MFW-25): explicit column allowlist, never "*". */
export const ZONE_DIRECTORY_COLUMNS = Object.freeze(["zone_id"] as const);
/** Highest visible zone first. */
export const HIGHEST_ZONE_ORDER = "zone_id.desc";
/** One row is enough to know the highest zone id. */
export const ZONE_DIRECTORY_LIMIT = 1;

/** MFW-45 RPCs (relative to SUPABASE_REST_PATH). Names equal the SQL functions of 20261124020000_mfw45_guarded_creation_insert.sql. */
export const ZONE_ITEM_COUNTS_RPC_PATH = "rpc/mfw_zone_item_counts";
export const ZONE_OCCUPANTS_RPC_PATH = "rpc/mfw_zone_occupants";
export const INSERT_CREATION_GUARDED_RPC_PATH = "rpc/mfw_insert_creation_guarded";
/** Vercel sets VERCEL_ENV to "production" | "preview" | "development". Writes never use the in-memory backend in production. */
export const DEPLOYMENT_ENV = "VERCEL_ENV";
export const PRODUCTION_DEPLOYMENT = "production";
