import {
  CREATIONS_PUBLIC_VISIBLE_VIEW,
  INSERT_CREATION_RPC_PATH,
  LOCAL_SUPABASE_HOSTNAMES,
  PUBLIC_CREATION_COLUMNS,
  PUBLIC_ZONE_ORDER,
  SUPABASE_REQUEST_TIMEOUT_MS,
  SUPABASE_REST_PATH,
} from "@/config/database.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import { CreationRepositoryError, type CreationRepository } from "./creationRepository";
import type { AppearanceJson, NewCreation, PublicCreation, ZoneQuery } from "./creationTypes";
import { isFestivalEventId, isZoneId, validateNewCreation } from "./creationValidation";
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
  };
}
