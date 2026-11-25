import { UUID_PATTERN } from "@/config/database.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import type { PublicCreation } from "./creationTypes";
import { isFestivalEventId, isZoneId, toIsoTimestamp } from "./creationValidation";
import { isJsonObject, isPlainObject } from "./json";

/** Maps one creations_public / creations_public_visible row (snake_case) to a PublicCreation, or null if invalid. */
export function publicRowToCreation(row: unknown): PublicCreation | null {
  if (!isPlainObject(row)) return null;
  const { id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name } = row; // named keys only
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
  if (!isFestivalEventId(event_id) || !isZoneId(zone_id) || !isJsonObject(appearance)) return null;
  const parsed = parsePersistableCoord(coord);
  if (!parsed.ok) return null;
  if (public_wish_text !== null && typeof public_wish_text !== "string") return null;
  // MFW-62: absent (pre-migration select) or null → null; any non-string → invalid row.
  if (display_name !== undefined && display_name !== null && typeof display_name !== "string") return null;
  const displayName = public_wish_text === null ? null : (display_name ?? null); // a name is public only with an open wish
  const createdAt = toIsoTimestamp(created_at);
  const expiresAt = toIsoTimestamp(expires_at);
  if (createdAt === null || expiresAt === null) return null;
  return {
    id,
    eventId: event_id,
    zoneId: zone_id,
    appearance,
    coord: parsed.coord,
    publicWishText: public_wish_text,
    createdAt,
    expiresAt,
    displayName,
  };
}

/** Explicit allowlist copy: returns an object with exactly PUBLIC_CREATION_KEYS, whatever extra keys `source` has at runtime. */
export function pickPublicCreation(source: PublicCreation): PublicCreation {
  return {
    id: source.id,
    eventId: source.eventId,
    zoneId: source.zoneId,
    appearance: source.appearance,
    coord: source.coord,
    publicWishText: source.publicWishText,
    createdAt: source.createdAt,
    expiresAt: source.expiresAt,
    displayName: source.displayName,
  };
}
