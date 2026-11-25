import type { FestivalEventId } from "@/config/events/types";
import { ZONE_ID_MIN, ZONE_ITEM_CAP } from "@/config/world.config";
import { CREATIONS_API_PATH, ZONES_API_PATH, ZONE_API_QUERY_PARAMS } from "./apiPaths";
import type { PublicCreation } from "./creationTypes";

export type ZoneFetchFailure = "aborted" | "network" | "http" | "invalid_body";
export type ZoneDirectoryResult =
  | { readonly ok: true; readonly zoneCount: number }
  | { readonly ok: false; readonly reason: ZoneFetchFailure };
export type ZoneItemsResult =
  | { readonly ok: true; readonly items: readonly PublicCreation[] }
  | { readonly ok: false; readonly reason: ZoneFetchFailure };
export interface ZoneFetchOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
}

/** Defence in depth (invariant C): an item carrying a private-looking key anywhere in appearance/coord is dropped. */
const PRIVATE_KEY_PATTERN = /owner_?token|private_?wish/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function containsPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([k, v]) => PRIVATE_KEY_PATTERN.test(k) || containsPrivateKey(v));
}

function isIsoLike(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function buildZoneDirectoryUrl(eventId: FestivalEventId): string {
  return `${ZONES_API_PATH}?${new URLSearchParams({ [ZONE_API_QUERY_PARAMS.event]: eventId })}`;
}

export function buildZoneItemsUrl(eventId: FestivalEventId, zoneId: number): string {
  const params = new URLSearchParams({
    [ZONE_API_QUERY_PARAMS.event]: eventId,
    [ZONE_API_QUERY_PARAMS.zone]: String(zoneId),
  });
  return `${CREATIONS_API_PATH}?${params}`;
}

type JsonResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly reason: ZoneFetchFailure };

async function getJson(url: string, options: ZoneFetchOptions): Promise<JsonResult> {
  const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch {
    return { ok: false, reason: options.signal?.aborted ? "aborted" : "network" };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "http" };
  }
  try {
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, reason: options.signal?.aborted ? "aborted" : "invalid_body" };
  }
}

/** Allowlist copy of one received item, or null (invariant C defence in depth). Coord/appearance are deep-validated in the 3D chunk. */
export function toClientPublicCreation(raw: unknown, eventId: FestivalEventId, zoneId: number): PublicCreation | null {
  if (!isPlainRecord(raw)) return null;
  const { id, eventId: itemEvent, zoneId: itemZone, appearance, coord, publicWishText, createdAt, expiresAt, displayName } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (itemEvent !== eventId || itemZone !== zoneId) return null;
  if (!isPlainRecord(appearance) || !isPlainRecord(coord)) return null;
  if (publicWishText !== null && typeof publicWishText !== "string") return null;
  if (!isIsoLike(createdAt) || !isIsoLike(expiresAt)) return null;
  if (containsPrivateKey(appearance) || containsPrivateKey(coord)) return null;
  // MFW-62: absent (older server / mock) or null → null; any non-string → drop the item; never a name without an open wish.
  if (displayName !== undefined && displayName !== null && typeof displayName !== "string") return null;
  return {
    id,
    eventId,
    zoneId,
    appearance: appearance as PublicCreation["appearance"],
    coord: coord as unknown as PublicCreation["coord"],
    publicWishText,
    createdAt,
    expiresAt,
    displayName: publicWishText === null ? null : (displayName ?? null),
  };
}

export async function fetchZoneDirectory(
  eventId: FestivalEventId,
  options: ZoneFetchOptions = {},
): Promise<ZoneDirectoryResult> {
  const res = await getJson(buildZoneDirectoryUrl(eventId), options);
  if (!res.ok) return res;
  const body = res.body;
  if (!isPlainRecord(body) || body.eventId !== eventId) return { ok: false, reason: "invalid_body" };
  const count = body.zoneCount;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < ZONE_ID_MIN) {
    return { ok: false, reason: "invalid_body" };
  }
  return { ok: true, zoneCount: count };
}

export async function fetchZoneItems(
  eventId: FestivalEventId,
  zoneId: number,
  options: ZoneFetchOptions = {},
): Promise<ZoneItemsResult> {
  const res = await getJson(buildZoneItemsUrl(eventId, zoneId), options);
  if (!res.ok) return res;
  const body = res.body;
  if (!isPlainRecord(body) || body.eventId !== eventId || body.zoneId !== zoneId || !Array.isArray(body.items)) {
    return { ok: false, reason: "invalid_body" };
  }
  const items: PublicCreation[] = [];
  const seen = new Set<string>();
  for (const raw of body.items as unknown[]) {
    if (items.length >= ZONE_ITEM_CAP) break;
    const item = toClientPublicCreation(raw, eventId, zoneId);
    if (item === null || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return { ok: true, items: Object.freeze(items) };
}
