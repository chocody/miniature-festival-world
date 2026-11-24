import { PG_INT4_MAX } from "@/config/database.config";
import { FESTIVAL_EVENT_IDS, type FestivalEventId } from "@/config/events/types";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_KEY_ID_PATTERN } from "@/config/privateWish.config";
import { ZONE_ID_MIN } from "@/config/world.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { isOwnerTokenHash } from "@/services/auth";
import { CreationRepositoryError } from "./creationRepository";
import type { AppearanceJson, NewCreation, PrivateWishCiphertext } from "./creationTypes";
import { isJsonObject, isPlainObject } from "./json";

export function isFestivalEventId(value: unknown): value is FestivalEventId {
  return typeof value === "string" && (FESTIVAL_EVENT_IDS as readonly string[]).includes(value);
}

export function isZoneId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= ZONE_ID_MIN && value <= PG_INT4_MAX;
}

/** Normalizes a timestamp string (Postgres or ISO) to ISO-8601 UTC with milliseconds, or null if unparsable. */
export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function invalid(field: keyof NewCreation): CreationRepositoryError {
  return new CreationRepositoryError("invalid_input", field);
}

/**
 * Validates a write-path input and returns a fresh copy built field by field. The first failure throws
 * CreationRepositoryError("invalid_input", <field>); messages never echo values.
 */
export function validateNewCreation(input: NewCreation, nowMs: number): NewCreation {
  if (!isFestivalEventId(input.eventId)) throw invalid("eventId");
  if (!isZoneId(input.zoneId)) throw invalid("zoneId");
  if (!isJsonObject(input.appearance)) throw invalid("appearance");
  const parsed = parsePersistableCoord(input.coord);
  if (!parsed.ok) throw invalid("coord");
  const publicWishText: unknown = input.publicWishText;
  if (publicWishText !== null && (typeof publicWishText !== "string" || publicWishText.trim() === "")) {
    throw invalid("publicWishText");
  }
  const expiresAt: unknown = input.expiresAt;
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= nowMs) {
    throw invalid("expiresAt");
  }
  if (!isOwnerTokenHash(input.ownerTokenHash)) throw invalid("ownerTokenHash");
  const privateWish: unknown = input.privateWish;
  if (privateWish !== null) {
    if (
      !isPlainObject(privateWish) ||
      typeof privateWish.ciphertext !== "string" ||
      !PRIVATE_WISH_CIPHERTEXT_PATTERN.test(privateWish.ciphertext) ||
      typeof privateWish.keyId !== "string" ||
      !PRIVATE_WISH_KEY_ID_PATTERN.test(privateWish.keyId)
    ) {
      throw invalid("privateWish");
    }
  }
  if (publicWishText !== null && privateWish !== null) throw invalid("privateWish");

  const checkedWish = privateWish as { ciphertext: string; keyId: string } | null;
  return {
    eventId: input.eventId,
    zoneId: input.zoneId,
    appearance: structuredClone(input.appearance) as AppearanceJson,
    coord: parsed.coord,
    publicWishText: publicWishText as string | null,
    expiresAt: new Date(expiresAt.getTime()),
    ownerTokenHash: input.ownerTokenHash,
    privateWish:
      checkedWish === null
        ? null
        : { ciphertext: checkedWish.ciphertext as PrivateWishCiphertext, keyId: checkedWish.keyId },
  };
}
