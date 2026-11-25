import {
  CREATIONS_PUBLIC_VISIBLE_VIEW,
  HIGHEST_ZONE_ORDER,
  INSERT_CREATION_GUARDED_RPC_PATH,
  INSERT_CREATION_RPC_PATH,
  LOCAL_SUPABASE_HOSTNAMES,
  PUBLIC_CREATION_COLUMNS,
  PUBLIC_ZONE_ORDER,
  REPORT_CREATION_RPC_PATH,
  SUPABASE_REQUEST_TIMEOUT_MS,
  SUPABASE_REST_PATH,
  UUID_PATTERN,
  ZONE_DIRECTORY_COLUMNS,
  ZONE_DIRECTORY_LIMIT,
  ZONE_ITEM_COUNTS_RPC_PATH,
  ZONE_OCCUPANTS_RPC_PATH,
} from "@/config/database.config";
import type { FestivalEventId } from "@/config/events/types";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { CreationRepositoryError, type CreationRepository, type ReportOutcome } from "./creationRepository";
import type {
  AppearanceJson,
  GuardedInsertResult,
  GuardedNewCreation,
  NewCreation,
  PublicCreation,
  ZoneItemCount,
  ZoneOccupant,
  ZoneQuery,
} from "./creationTypes";
import {
  isFestivalEventId,
  isZoneId,
  toIsoTimestamp,
  validateGuardedNewCreation,
  validateNewCreation,
} from "./creationValidation";
import { isPlainObject } from "./json";
import { publicRowToCreation } from "./publicCreation";

export interface SupabaseCreationRepositoryOptions {
  readonly url: string; // project URL, https (http only for LOCAL_SUPABASE_HOSTNAMES)
  readonly serviceRoleKey: string; // server-only secret; never logged, never in an error message
  readonly fetch?: typeof fetch; // injected in tests
  readonly timeoutMs?: number; // default SUPABASE_REQUEST_TIMEOUT_MS
  readonly now?: () => number; // default Date.now (only for validateNewCreation's expiresAt check)
}

/** Body of POST /rest/v1/rpc/mfw_insert_creation; keys equal the SQL parameter names. */
export interface InsertCreationRpcBody {
  readonly p_event_id: string;
  readonly p_zone_id: number;
  readonly p_appearance: AppearanceJson;
  readonly p_coord: PersistableCoord;
  readonly p_public_wish_text: string | null;
  readonly p_expires_at: string; // ISO-8601
  readonly p_owner_token_hash: string;
  readonly p_private_wish_text: string | null; // ciphertext envelope, never plaintext
  readonly p_private_wish_key_id: string | null;
}

/** Body of POST /rest/v1/rpc/mfw_report_creation; key equals the SQL parameter name. */
export interface ReportCreationRpcBody {
  readonly p_creation_id: string;
}

export interface ZoneItemCountsRpcBody {
  readonly p_event_id: string;
}
export interface ZoneOccupantsRpcBody {
  readonly p_event_id: string;
  readonly p_zone_id: number;
}
/** Keys equal the SQL parameter names of mfw_insert_creation_guarded. */
export interface InsertCreationGuardedRpcBody extends InsertCreationRpcBody {
  readonly p_created_at: string; // ISO-8601, ms precision
  readonly p_expected_occupant_ids: readonly string[];
}

export function createSupabaseCreationRepository(options: SupabaseCreationRepositoryOptions): CreationRepository {
  let base: URL;
  try {
    base = new URL(options.url);
  } catch {
    throw new CreationRepositoryError("backend_misconfigured", "url");
  }
  const isHttps = base.protocol === "https:";
  const isLocalHttp =
    base.protocol === "http:" && (LOCAL_SUPABASE_HOSTNAMES as readonly string[]).includes(base.hostname);
  if (!isHttps && !isLocalHttp) throw new CreationRepositoryError("backend_misconfigured", "url");
  const key = options.serviceRoleKey.trim();
  if (key === "") throw new CreationRepositoryError("backend_misconfigured", "serviceRoleKey");
  const restBase = new URL(SUPABASE_REST_PATH, base);
  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? SUPABASE_REQUEST_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());

  function buildHeaders(withJsonBody: boolean): Record<string, string> {
    const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
    if (withJsonBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  /** Never reads the body of a non-2xx response (it can echo private row contents). */
  async function send(target: URL, method: "GET" | "POST", body?: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(target, {
        method,
        headers: buildHeaders(body !== undefined),
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CreationRepositoryError("backend_request_failed", "network");
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new CreationRepositoryError("backend_request_failed", `status ${res.status}`);
    }
    try {
      return await res.json();
    } catch {
      throw new CreationRepositoryError("invalid_backend_response", "json");
    }
  }

  return {
    backend: "supabase",

    async listPublicZone(query: ZoneQuery): Promise<readonly PublicCreation[]> {
      if (!isFestivalEventId(query.eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
      if (!isZoneId(query.zoneId)) throw new CreationRepositoryError("invalid_input", "zoneId");
      const target = new URL(CREATIONS_PUBLIC_VISIBLE_VIEW, restBase);
      target.searchParams.set("select", PUBLIC_CREATION_COLUMNS.join(","));
      target.searchParams.set("event_id", `eq.${query.eventId}`);
      target.searchParams.set("zone_id", `eq.${query.zoneId}`);
      target.searchParams.set("order", PUBLIC_ZONE_ORDER);
      target.searchParams.set("limit", String(ZONE_ITEM_CAP));
      const data = await send(target, "GET");
      if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "list");
      const kept: PublicCreation[] = [];
      for (const row of data as unknown[]) {
        if (kept.length >= ZONE_ITEM_CAP) break;
        const c = publicRowToCreation(row);
        if (c !== null && c.eventId === query.eventId && c.zoneId === query.zoneId) kept.push(c);
      }
      return kept;
    },

    async highestVisibleZoneId(eventId: FestivalEventId): Promise<number | null> {
      if (!isFestivalEventId(eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
      const target = new URL(CREATIONS_PUBLIC_VISIBLE_VIEW, restBase);
      target.searchParams.set("select", ZONE_DIRECTORY_COLUMNS.join(","));
      target.searchParams.set("event_id", `eq.${eventId}`);
      target.searchParams.set("order", HIGHEST_ZONE_ORDER);
      target.searchParams.set("limit", String(ZONE_DIRECTORY_LIMIT));
      const data = await send(target, "GET");
      if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "list");
      if (data.length === 0) return null;
      const row: unknown = data[0];
      const zone = isPlainObject(row) ? row.zone_id : undefined;
      if (!isZoneId(zone)) throw new CreationRepositoryError("invalid_backend_response", "zone");
      return zone;
    },

    async insertCreation(input: NewCreation): Promise<PublicCreation> {
      const v = validateNewCreation(input, now());
      const body: InsertCreationRpcBody = {
        p_event_id: v.eventId,
        p_zone_id: v.zoneId,
        p_appearance: v.appearance,
        p_coord: v.coord,
        p_public_wish_text: v.publicWishText,
        p_expires_at: v.expiresAt.toISOString(),
        p_owner_token_hash: v.ownerTokenHash,
        p_private_wish_text: v.privateWish === null ? null : v.privateWish.ciphertext,
        p_private_wish_key_id: v.privateWish === null ? null : v.privateWish.keyId,
      };
      const data = await send(new URL(INSERT_CREATION_RPC_PATH, restBase), "POST", JSON.stringify(body));
      const row: unknown = Array.isArray(data) ? (data.length === 1 ? data[0] : undefined) : data;
      const created = publicRowToCreation(row);
      if (created === null) throw new CreationRepositoryError("invalid_backend_response", "insert");
      return created;
    },

    async zoneItemCounts(eventId: FestivalEventId): Promise<readonly ZoneItemCount[]> {
      if (!isFestivalEventId(eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
      const body: ZoneItemCountsRpcBody = { p_event_id: eventId };
      const data = await send(new URL(ZONE_ITEM_COUNTS_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "zone");
      const seen = new Set<number>();
      const counts: ZoneItemCount[] = [];
      for (const row of data as unknown[]) {
        // Fail closed: a dropped count could overfill a zone.
        if (!isPlainObject(row) || !isZoneId(row.zone_id) || seen.has(row.zone_id)) {
          throw new CreationRepositoryError("invalid_backend_response", "zone");
        }
        const itemCount = row.item_count;
        if (typeof itemCount !== "number" || !Number.isSafeInteger(itemCount) || itemCount < 1) {
          throw new CreationRepositoryError("invalid_backend_response", "zone");
        }
        seen.add(row.zone_id);
        counts.push({ zoneId: row.zone_id, itemCount });
      }
      return counts;
    },

    async listZoneOccupants(query: ZoneQuery): Promise<readonly ZoneOccupant[]> {
      if (!isFestivalEventId(query.eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
      if (!isZoneId(query.zoneId)) throw new CreationRepositoryError("invalid_input", "zoneId");
      const body: ZoneOccupantsRpcBody = { p_event_id: query.eventId, p_zone_id: query.zoneId };
      const data = await send(new URL(ZONE_OCCUPANTS_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "occupant");
      const seen = new Set<string>();
      const occupants: ZoneOccupant[] = [];
      for (const row of data as unknown[]) {
        if (!isPlainObject(row)) throw new CreationRepositoryError("invalid_backend_response", "occupant");
        const id = row.id;
        const parsed = parsePersistableCoord(row.coord);
        const iso = toIsoTimestamp(row.created_at);
        if (typeof id !== "string" || !UUID_PATTERN.test(id) || seen.has(id) || !parsed.ok || iso === null) {
          throw new CreationRepositoryError("invalid_backend_response", "occupant");
        }
        seen.add(id);
        occupants.push({ id, coord: parsed.coord, createdAtMs: Date.parse(iso) });
      }
      return occupants;
    },

    async insertCreationGuarded(input: GuardedNewCreation): Promise<GuardedInsertResult> {
      const v = validateGuardedNewCreation(input); // throws before any request
      const body: InsertCreationGuardedRpcBody = {
        p_event_id: v.eventId,
        p_zone_id: v.zoneId,
        p_appearance: v.appearance,
        p_coord: v.coord,
        p_public_wish_text: v.publicWishText,
        p_expires_at: v.expiresAt.toISOString(),
        p_owner_token_hash: v.ownerTokenHash,
        p_private_wish_text: v.privateWish === null ? null : v.privateWish.ciphertext,
        p_private_wish_key_id: v.privateWish === null ? null : v.privateWish.keyId,
        p_created_at: v.createdAt.toISOString(),
        p_expected_occupant_ids: [...v.expectedOccupantIds],
      };
      const data = await send(new URL(INSERT_CREATION_GUARDED_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (!Array.isArray(data)) throw new CreationRepositoryError("invalid_backend_response", "insert");
      if (data.length === 0) return { status: "zone_changed" };
      if (data.length !== 1) throw new CreationRepositoryError("invalid_backend_response", "insert");
      const creation = publicRowToCreation(data[0]);
      if (creation === null) throw new CreationRepositoryError("invalid_backend_response", "insert");
      return { status: "inserted", creation };
    },

    async reportCreation(creationId: string): Promise<ReportOutcome> {
      if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
        throw new CreationRepositoryError("invalid_input", "creationId"); // before any request
      }
      const body: ReportCreationRpcBody = { p_creation_id: creationId };
      const data = await send(new URL(REPORT_CREATION_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (data === true) return "counted";
      if (data === false) return "ignored";
      throw new CreationRepositoryError("invalid_backend_response", "report");
    },
  };
}
