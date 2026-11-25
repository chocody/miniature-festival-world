import { PG_INT4_MAX, UUID_PATTERN } from "@/config/database.config";
import { FESTIVAL_EVENT_IDS, type FestivalEventId } from "@/config/events/types";
import { PRIVATE_WISH_CIPHERTEXT_PATTERN, PRIVATE_WISH_KEY_ID_PATTERN } from "@/config/privateWish.config";
import { ZONE_ID_MIN, ZONE_ITEM_CAP } from "@/config/world.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { isOwnerTokenHash } from "@/services/auth";
import { checkPublicWish } from "@/services/moderation";
import { CreationRepositoryError } from "./creationRepository";
import type {
  AppearanceJson,
  CloseWishInput,
  EncryptedPrivateWish,
  GuardedNewCreation,
  NewCreation,
  OpenWishInput,
  PrivateWishCiphertext,
} from "./creationTypes";
import { isStorableDisplayName } from "./displayName";
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

/** A plain { ciphertext, keyId } object matching the envelope and key id patterns (MFW-12 storage contract). */
export function isEncryptedPrivateWish(value: unknown): value is EncryptedPrivateWish {
  return (
    isPlainObject(value) &&
    typeof value.ciphertext === "string" &&
    PRIVATE_WISH_CIPHERTEXT_PATTERN.test(value.ciphertext) &&
    typeof value.keyId === "string" &&
    PRIVATE_WISH_KEY_ID_PATTERN.test(value.keyId)
  );
}

function copyEncrypted(value: EncryptedPrivateWish): EncryptedPrivateWish {
  return { ciphertext: value.ciphertext as PrivateWishCiphertext, keyId: value.keyId };
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
  if (
    publicWishText !== null &&
    (typeof publicWishText !== "string" || publicWishText.trim() === "" || !checkPublicWish(publicWishText).ok)
  ) {
    throw invalid("publicWishText"); // MFW-13 backstop (invariant G); no reasons or text in the error
  }
  const expiresAt: unknown = input.expiresAt;
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= nowMs) {
    throw invalid("expiresAt");
  }
  if (!isOwnerTokenHash(input.ownerTokenHash)) throw invalid("ownerTokenHash");
  const privateWish: unknown = input.privateWish;
  if (privateWish !== null && !isEncryptedPrivateWish(privateWish)) throw invalid("privateWish");
  if (publicWishText !== null && privateWish !== null) throw invalid("privateWish");
  const checkedWish = privateWish as EncryptedPrivateWish | null;

  // MFW-62: the name follows the wish — public with a public wish, encrypted (same key id) with a private one.
  const displayName: unknown = input.displayName ?? null;
  if (displayName !== null && (!isStorableDisplayName(displayName) || publicWishText === null)) {
    throw invalid("displayName");
  }
  const privateDisplayName: unknown = input.privateDisplayName ?? null;
  if (
    privateDisplayName !== null &&
    (!isEncryptedPrivateWish(privateDisplayName) ||
      checkedWish === null ||
      privateDisplayName.keyId !== checkedWish.keyId)
  ) {
    throw invalid("privateDisplayName");
  }

  return {
    eventId: input.eventId,
    zoneId: input.zoneId,
    appearance: structuredClone(input.appearance) as AppearanceJson,
    coord: parsed.coord,
    publicWishText: publicWishText as string | null,
    expiresAt: new Date(expiresAt.getTime()),
    ownerTokenHash: input.ownerTokenHash,
    privateWish: checkedWish === null ? null : copyEncrypted(checkedWish),
    displayName: displayName as string | null,
    privateDisplayName: privateDisplayName === null ? null : copyEncrypted(privateDisplayName as EncryptedPrivateWish),
  };
}

/**
 * Validates the compare-and-insert input (MFW-45): everything validateNewCreation checks (against createdAt, so expiresAt
 * must be later), plus createdAt and expectedOccupantIds. Returns a fresh copy; throws invalid_input without echoing values.
 */
export function validateGuardedNewCreation(input: GuardedNewCreation): GuardedNewCreation {
  const createdAt: unknown = input.createdAt;
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new CreationRepositoryError("invalid_input", "createdAt");
  }
  const base = validateNewCreation(input, createdAt.getTime());
  const ids: unknown = input.expectedOccupantIds;
  if (
    !Array.isArray(ids) ||
    ids.length >= ZONE_ITEM_CAP ||
    !ids.every((entry) => typeof entry === "string" && UUID_PATTERN.test(entry)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new CreationRepositoryError("invalid_input", "expectedOccupantIds");
  }
  return {
    eventId: base.eventId,
    zoneId: base.zoneId,
    appearance: base.appearance,
    coord: base.coord,
    publicWishText: base.publicWishText,
    expiresAt: base.expiresAt,
    ownerTokenHash: base.ownerTokenHash,
    privateWish: base.privateWish,
    displayName: base.displayName,
    privateDisplayName: base.privateDisplayName,
    createdAt: new Date(createdAt.getTime()),
    expectedOccupantIds: Object.freeze(ids.slice() as string[]),
  };
}

function invalidField(field: string): CreationRepositoryError {
  return new CreationRepositoryError("invalid_input", field);
}

function isCreationId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Validates an open (MFW-62) and returns a fresh copy. Fields in order: creationId, expectedPrivateWish, publicWishText
 * (trimmed, non-blank, passes the public-wish guard), displayName. Throws invalid_input <field>; never echoes values.
 */
export function validateOpenWishInput(input: OpenWishInput): OpenWishInput {
  if (!isCreationId(input.creationId)) throw invalidField("creationId");
  const expected: unknown = input.expectedPrivateWish;
  if (typeof expected !== "string" || !PRIVATE_WISH_CIPHERTEXT_PATTERN.test(expected)) throw invalidField("expectedPrivateWish");
  const text: unknown = input.publicWishText;
  if (typeof text !== "string" || text !== text.trim() || text === "" || !checkPublicWish(text).ok) {
    throw invalidField("publicWishText"); // invariant G backstop; no reasons or text in the error
  }
  const displayName: unknown = input.displayName;
  if (displayName !== null && !isStorableDisplayName(displayName)) throw invalidField("displayName");
  return {
    creationId: input.creationId,
    expectedPrivateWish: expected as PrivateWishCiphertext,
    publicWishText: text,
    displayName: displayName as string | null,
  };
}

/**
 * Validates a close (MFW-62) and returns a fresh copy. Fields in order: creationId, expectedPublicWishText, expectedDisplayName
 * (null or non-blank; not re-moderated), privateWish, privateDisplayName (null or same key id). Throws invalid_input <field>.
 */
export function validateCloseWishInput(input: CloseWishInput): CloseWishInput {
  if (!isCreationId(input.creationId)) throw invalidField("creationId");
  if (!isNonBlankString(input.expectedPublicWishText)) throw invalidField("expectedPublicWishText");
  const expectedName: unknown = input.expectedDisplayName;
  if (expectedName !== null && !isNonBlankString(expectedName)) throw invalidField("expectedDisplayName");
  const privateWish: unknown = input.privateWish;
  if (!isEncryptedPrivateWish(privateWish)) throw invalidField("privateWish");
  const privateName: unknown = input.privateDisplayName;
  if (privateName !== null && (!isEncryptedPrivateWish(privateName) || privateName.keyId !== privateWish.keyId)) {
    throw invalidField("privateDisplayName");
  }
  return {
    creationId: input.creationId,
    expectedPublicWishText: input.expectedPublicWishText,
    expectedDisplayName: expectedName as string | null,
    privateWish: copyEncrypted(privateWish),
    privateDisplayName: privateName === null ? null : copyEncrypted(privateName as EncryptedPrivateWish),
  };
}
