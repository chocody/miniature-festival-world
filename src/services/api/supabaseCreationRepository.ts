import {
  CLOSE_CREATION_WISH_RPC_PATH,
  CREATION_OWNERSHIP_RPC_PATH,
  CREATION_WISH_STATE_RPC_PATH,
  CREATIONS_PUBLIC_VISIBLE_VIEW,
  HIGHEST_ZONE_ORDER,
  INSERT_CREATION_GUARDED_V2_RPC_PATH,
  INSERT_CREATION_RPC_PATH,
  LOCAL_SUPABASE_HOSTNAMES,
  OPEN_CREATION_WISH_RPC_PATH,
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
import { PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_KEY_ID_PATTERN } from "@/config/privateWish.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { isOwnerTokenHash } from "@/services/auth";
import { CreationRepositoryError, type CreationRepository, type ReportOutcome } from "./creationRepository";
import type {
  AppearanceJson,
  CloseWishInput,
  CreationOwnershipRecord,
  GuardedInsertResult,
  GuardedNewCreation,
  NewCreation,
  OpenWishInput,
  PrivateWishCiphertext,
  PublicCreation,
  WishSwitchOutcome,
  WishSwitchRecord,
  ZoneItemCount,
  ZoneOccupant,
  ZoneQuery,
} from "./creationTypes";
import {
  isFestivalEventId,
  isZoneId,
  toIsoTimestamp,
  validateCloseWishInput,
  validateGuardedNewCreation,
  validateNewCreation,
  validateOpenWishInput,
} from "./creationValidation";
import { isPlainObject } from "./json";
import { publicRowToCreation } from "./publicCreation";

/** Body of POST /rest/v1/rpc/mfw_creation_ownership; key equals the SQL parameter name. Carries no token and no hash. */
export interface CreationOwnershipRpcBody {
  readonly p_creation_id: string;
}

/** One mfw_creation_ownership row → record, or null if malformed (named keys only, no spreading). */
function ownershipRowToRecord(row: unknown): CreationOwnershipRecord | null {
  if (!isPlainObject(row)) return null;
  const { owner_token_hash, private_wish_text, private_wish_key_id } = row;
  if (!isOwnerTokenHash(owner_token_hash)) return null;
  if (private_wish_text === null && private_wish_key_id === null) return { ownerTokenHash: owner_token_hash, privateWish: null };
  if (typeof private_wish_text !== "string" || !PRIVATE_WISH_CIPHERTEXT_PATTERN.test(private_wish_text)) return null;
  if (typeof private_wish_key_id !== "string" || !PRIVATE_WISH_KEY_ID_PATTERN.test(private_wish_key_id)) return null;
  return {
    ownerTokenHash: owner_token_hash,
    privateWish: { ciphertext: private_wish_text as PrivateWishCiphertext, keyId: private_wish_key_id },
  };
}

/** Body of POST /rest/v1/rpc/mfw_creation_wish_state (MFW-62); key equals the SQL parameter name. Carries no token and no hash. */
export interface CreationWishStateRpcBody {
  readonly p_creation_id: string;
}

/** Body of POST /rest/v1/rpc/mfw_open_creation_wish (MFW-62); keys equal the SQL parameter names. No token, no hash. */
export interface OpenCreationWishRpcBody {
  readonly p_creation_id: string;
  readonly p_expected_private_wish_text: string; // ciphertext envelope (compare-and-set)
  readonly p_public_wish_text: string;
  readonly p_display_name: string | null;
}

/** Body of POST /rest/v1/rpc/mfw_close_creation_wish (MFW-62); keys equal the SQL parameter names. No token, no hash. */
export interface CloseCreationWishRpcBody {
  readonly p_creation_id: string;
  readonly p_expected_public_wish_text: string;
  readonly p_expected_display_name: string | null;
  readonly p_private_wish_text: string; // ciphertext envelope, never plaintext
  readonly p_private_wish_key_id: string;
  readonly p_private_display_name: string | null; // ciphertext envelope under p_private_wish_key_id
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** One mfw_creation_wish_state row → record, or null if malformed (named keys only, no spreading; fail closed). */
function wishStateRowToRecord(row: unknown): WishSwitchRecord | null {
  if (!isPlainObject(row)) return null;
  const { owner_token_hash, public_wish_text, display_name, private_wish_text, private_wish_key_id, private_display_name, hidden } =
    row;
  if (!isOwnerTokenHash(owner_token_hash)) return null;
  if (typeof hidden !== "boolean") return null;
  if (!isNullableString(public_wish_text) || !isNullableString(display_name)) return null;
  if (display_name !== null && public_wish_text === null) return null;
  let privateWish: { ciphertext: PrivateWishCiphertext; keyId: string } | null = null;
  if (private_wish_text !== null || private_wish_key_id !== null) {
    if (typeof private_wish_text !== "string" || !PRIVATE_WISH_CIPHERTEXT_PATTERN.test(private_wish_text)) return null;
    if (typeof private_wish_key_id !== "string" || !PRIVATE_WISH_KEY_ID_PATTERN.test(private_wish_key_id)) return null;
    privateWish = { ciphertext: private_wish_text as PrivateWishCiphertext, keyId: private_wish_key_id };
  }
  if (private_display_name !== null) {
    if (typeof private_display_name !== "string" || !PRIVATE_WISH_CIPHERTEXT_PATTERN.test(private_display_name)) return null;
    if (privateWish === null) return null;
  }
  if (public_wish_text !== null && privateWish !== null) return null;
  return {
    ownerTokenHash: owner_token_hash,
    hidden,
    publicWishText: public_wish_text,
    displayName: display_name,
    privateWish,
    privateDisplayName:
      private_display_name === null || privateWish === null
        ? null
        : { ciphertext: private_display_name as PrivateWishCiphertext, keyId: privateWish.keyId },
  };
}

function toSwitchOutcome(data: unknown): WishSwitchOutcome {
  if (data === true) return "switched";
  if (data === false) return "conflict";
  throw new CreationRepositoryError("invalid_backend_response", "wish_switch");
}

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
/** Keys equal the SQL parameter names of mfw_insert_creation_guarded_v2 (MFW-62). */
export interface InsertCreationGuardedV2RpcBody extends InsertCreationGuardedRpcBody {
  readonly p_display_name: string | null;
  readonly p_private_display_name: string | null; // ciphertext only; its key id is p_private_wish_key_id
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
      // The unguarded v1 SQL function has no name parameters (seeding / tests only): refuse instead of dropping a name.
      if ((v.displayName ?? null) !== null) throw new CreationRepositoryError("invalid_input", "displayName");
      if ((v.privateDisplayName ?? null) !== null) throw new CreationRepositoryError("invalid_input", "privateDisplayName");
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
      const body: InsertCreationGuardedV2RpcBody = {
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
        p_display_name: v.displayName ?? null,
        p_private_display_name: v.privateDisplayName?.ciphertext ?? null,
      };
      const data = await send(new URL(INSERT_CREATION_GUARDED_V2_RPC_PATH, restBase), "POST", JSON.stringify(body));
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

    async readOwnership(creationId: string): Promise<CreationOwnershipRecord | null> {
      if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
        throw new CreationRepositoryError("invalid_input", "creationId"); // before any request
      }
      const body: CreationOwnershipRpcBody = { p_creation_id: creationId };
      const data = await send(new URL(CREATION_OWNERSHIP_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (!Array.isArray(data) || data.length > 1) throw new CreationRepositoryError("invalid_backend_response", "ownership");
      if (data.length === 0) return null;
      const record = ownershipRowToRecord(data[0]);
      if (record === null) throw new CreationRepositoryError("invalid_backend_response", "ownership"); // fail closed → 503
      return record;
    },

    async readWishSwitchState(creationId: string): Promise<WishSwitchRecord | null> {
      if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
        throw new CreationRepositoryError("invalid_input", "creationId"); // before any request
      }
      const body: CreationWishStateRpcBody = { p_creation_id: creationId };
      const data = await send(new URL(CREATION_WISH_STATE_RPC_PATH, restBase), "POST", JSON.stringify(body));
      if (!Array.isArray(data) || data.length > 1) throw new CreationRepositoryError("invalid_backend_response", "wish_state");
      if (data.length === 0) return null;
      const record = wishStateRowToRecord(data[0]);
      if (record === null) throw new CreationRepositoryError("invalid_backend_response", "wish_state"); // fail closed → 503
      return record;
    },

    async openWish(input: OpenWishInput): Promise<WishSwitchOutcome> {
      const v = validateOpenWishInput(input); // throws before any request
      const body: OpenCreationWishRpcBody = {
        p_creation_id: v.creationId,
        p_expected_private_wish_text: v.expectedPrivateWish,
        p_public_wish_text: v.publicWishText,
        p_display_name: v.displayName,
      };
      return toSwitchOutcome(await send(new URL(OPEN_CREATION_WISH_RPC_PATH, restBase), "POST", JSON.stringify(body)));
    },

    async closeWish(input: CloseWishInput): Promise<WishSwitchOutcome> {
      const v = validateCloseWishInput(input); // throws before any request
      const body: CloseCreationWishRpcBody = {
        p_creation_id: v.creationId,
        p_expected_public_wish_text: v.expectedPublicWishText,
        p_expected_display_name: v.expectedDisplayName,
        p_private_wish_text: v.privateWish.ciphertext,
        p_private_wish_key_id: v.privateWish.keyId,
        p_private_display_name: v.privateDisplayName === null ? null : v.privateDisplayName.ciphertext,
      };
      return toSwitchOutcome(await send(new URL(CLOSE_CREATION_WISH_RPC_PATH, restBase), "POST", JSON.stringify(body)));
    },
  };
}
