import type { FestivalEventId } from "@/config/events/types";
import type { PersistableCoord } from "@/core/coordinates/types";
import type { OwnerTokenHash } from "@/services/auth";
import type { JsonObject } from "./json";

/** creations_public.appearance (spec §5): a JSON object. Its per-event schema is validated by the write path (2.4). */
export type AppearanceJson = JsonObject;

/** The ONLY creation shape that may leave the server on a public path (invariant C). */
export interface PublicCreation {
  readonly id: string; // uuid
  readonly eventId: FestivalEventId;
  readonly zoneId: number; // integer >= ZONE_ID_MIN
  readonly appearance: AppearanceJson;
  readonly coord: PersistableCoord; // invariant A
  readonly publicWishText: string | null;
  readonly createdAt: string; // ISO-8601 UTC ("2026-11-24T12:00:00.000Z")
  readonly expiresAt: string; // ISO-8601 UTC
}

/** Exact key set of PublicCreation, in this order. Tests compare response items against it. */
export const PUBLIC_CREATION_KEYS = Object.freeze([
  "id",
  "eventId",
  "zoneId",
  "appearance",
  "coord",
  "publicWishText",
  "createdAt",
  "expiresAt",
] as const);

/** AES-256-GCM envelope matching PRIVATE_WISH_CIPHERTEXT_PATTERN (produced by MFW-45). */
export type PrivateWishCiphertext = string & { readonly __brand: "PrivateWishCiphertext" };

export interface EncryptedPrivateWish {
  readonly ciphertext: PrivateWishCiphertext;
  readonly keyId: string; // matches PRIVATE_WISH_KEY_ID_PATTERN
}

/** Server write path input (MFW-45). Server-only; never built from a public response. */
export interface NewCreation {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
  readonly appearance: AppearanceJson;
  readonly coord: PersistableCoord;
  readonly publicWishText: string | null; // already passed the 2.3 guard
  readonly expiresAt: Date; // from computeCreationExpiresAt
  readonly ownerTokenHash: OwnerTokenHash; // SHA-256 of the raw token; the raw token never reaches the repository
  readonly privateWish: EncryptedPrivateWish | null; // at most one of publicWishText / privateWish is non-null
}

export interface ZoneQuery {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}

/** Body of GET /api/creations (200). */
export interface PublicZoneResponse {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
  readonly limit: number; // ZONE_ITEM_CAP
  readonly items: readonly PublicCreation[];
}

export type ZoneQueryField = "event" | "zone";

/** Body of GET /api/creations errors. Never contains internal details. */
export type ApiErrorBody =
  | { readonly error: "invalid_query"; readonly field: ZoneQueryField }
  | { readonly error: "unavailable" };

/** Body of GET /api/zones (200). Counts only; never item data. */
export interface ZoneDirectoryResponse {
  readonly eventId: FestivalEventId;
  /** Open zones = highest zone id with a visible creation, at least 1. Zones are 1..zoneCount. */
  readonly zoneCount: number;
}

/** Rows of one zone, counted for zone assignment. Includes hidden/flagged rows; excludes expired ones. Server-only. */
export interface ZoneItemCount {
  readonly zoneId: number; // isZoneId
  readonly itemCount: number; // safe integer >= 1
}

/** One stored krathong of a zone, for the collision re-check. Server-only: never sent in any response. */
export interface ZoneOccupant {
  readonly id: string; // lowercase uuid
  readonly coord: PersistableCoord;
  readonly createdAtMs: number; // epoch ms (open question 6)
}

/** Write input of the compare-and-insert path (MFW-45). The raw owner token never reaches it. */
export interface GuardedNewCreation extends NewCreation {
  /** Server time; stored as created_at and used for the collision check. expiresAt must be later. */
  readonly createdAt: Date;
  /** Ids of the zone's occupants the server placed against (unique uuids, fewer than ZONE_ITEM_CAP). */
  readonly expectedOccupantIds: readonly string[];
}

export type GuardedInsertResult =
  | { readonly status: "inserted"; readonly creation: PublicCreation }
  | { readonly status: "zone_changed" }; // the zone changed or is full: re-read and retry
