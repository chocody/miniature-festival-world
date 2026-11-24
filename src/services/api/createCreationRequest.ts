import type { FestivalEventId } from "@/config/events/types";
import type { WishVisibility } from "@/config/wish.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { isDeviceOwnerToken, type DeviceOwnerToken } from "@/services/auth";
import { CREATE_CREATION_BODY_KEYS, type CreateCreationField } from "./createCreationTypes";
import { isFestivalEventId } from "./creationValidation";
import { isPlainObject } from "./json";
import { isWishVisibility } from "./wishPayload";

export interface ParsedCreateCreationRequest {
  readonly eventId: FestivalEventId;
  readonly appearance: unknown; // validated later by parseEventAppearance
  readonly coord: PersistableCoord; // parsePersistableCoord's fresh copy
  readonly wishText: string; // as sent (type-checked only); evaluateWishDraft trims and checks it in the handler
  readonly wishVisibility: WishVisibility;
  readonly ownerToken: DeviceOwnerToken;
}

export type CreateCreationParseResult =
  | { readonly ok: true; readonly request: ParsedCreateCreationRequest }
  | { readonly ok: false; readonly field: CreateCreationField };

const fail = (field: CreateCreationField): CreateCreationParseResult => ({ ok: false, field });

/** Shape check of a POST /api/creations body. Never echoes a key name or a value. */
export function parseCreateCreationRequest(value: unknown): CreateCreationParseResult {
  if (!isPlainObject(value)) return fail("body");
  const allowed: readonly string[] = CREATE_CREATION_BODY_KEYS;
  if (Object.keys(value).some((key) => !allowed.includes(key))) return fail("body");
  const eventId = value.eventId;
  if (!isFestivalEventId(eventId)) return fail("eventId");
  if (!Object.prototype.hasOwnProperty.call(value, "appearance")) return fail("appearance");
  const coord = parsePersistableCoord(value.coord);
  if (!coord.ok) return fail("coord");
  const wishText = value.wishText;
  if (typeof wishText !== "string") return fail("wishText");
  const wishVisibility = value.wishVisibility;
  if (!isWishVisibility(wishVisibility)) return fail("wishVisibility");
  const ownerToken = value.ownerToken;
  if (!isDeviceOwnerToken(ownerToken)) return fail("ownerToken");
  return {
    ok: true,
    request: { eventId, appearance: value.appearance, coord: coord.coord, wishText, wishVisibility, ownerToken },
  };
}
