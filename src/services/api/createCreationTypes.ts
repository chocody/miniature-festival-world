import type { FestivalEventId } from "@/config/events/types";
import type { WishVisibility } from "@/config/wish.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import type { ModerationBlockedBody } from "@/services/moderation";
import type { PublicCreation } from "./creationTypes";
import type { JsonObject } from "./json";

/** Exactly these keys; anything else is rejected (backlog 2.4). */
export const CREATE_CREATION_BODY_KEYS = Object.freeze([
  "eventId",
  "appearance",
  "coord",
  "wishText",
  "wishVisibility",
  "ownerToken",
] as const);
/** Optional keys (MFW-62, open question 36). CREATE_CREATION_BODY_KEYS stays the list of required keys. */
export const CREATE_CREATION_OPTIONAL_BODY_KEYS = Object.freeze(["displayName"] as const);
export type CreateCreationField =
  | "body"
  | (typeof CREATE_CREATION_BODY_KEYS)[number]
  | (typeof CREATE_CREATION_OPTIONAL_BODY_KEYS)[number];

/** POST /api/creations body (Content-Type: application/json). ownerToken = raw DeviceOwnerToken, body only, never a URL. */
export interface CreateCreationRequestBody {
  readonly eventId: FestivalEventId;
  readonly appearance: JsonObject; // the event's appearance (Loy Krathong: serializeKrathongAppearance)
  readonly coord: PersistableCoord; // desired spot; the server may move it (owner decision 25)
  readonly wishText: string; // non-blank after trim, at most WISH_TEXT_MAX_LENGTH
  readonly wishVisibility: WishVisibility;
  readonly ownerToken: string;
  readonly displayName?: string | null; // optional (open question 36); trimmed; empty → stored as null; ≤ DISPLAY_NAME_MAX_LENGTH; moderated like a public wish
}

/** 201 body. `creation.coord`, `zoneId`, `createdAt`, `expiresAt` are the server's final values. */
export interface CreateCreationResponseBody {
  readonly creation: PublicCreation;
}

export type CreateCreationErrorBody =
  | { readonly error: "unsupported_media_type" } // 415
  | { readonly error: "payload_too_large" } // 413
  | { readonly error: "invalid_body"; readonly field: CreateCreationField } // 400
  | { readonly error: "event_closed" } // 409
  | ModerationBlockedBody // 422
  | { readonly error: "unavailable" }; // 503
