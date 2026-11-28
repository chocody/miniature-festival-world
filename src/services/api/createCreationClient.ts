import type { FestivalEventId } from "@/config/events/types";
import { CREATE_CREATION_TIMEOUT_MS } from "@/config/ritual.config";
import { ZONE_ID_MIN } from "@/config/world.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { parseModerationBlockedBody } from "@/services/moderation";
import { CREATIONS_API_PATH } from "./apiPaths";
import { coordModeForEvent } from "./creationCoordMode";
import type { CreateCreationRequestBody } from "./createCreationTypes";
import type { PublicCreation } from "./creationTypes";
import { isPlainObject } from "./json";

export type CreateCreationFailure =
  | "aborted"
  | "network"
  | "timeout"
  | "unavailable"
  | "event_closed"
  | "moderation_blocked"
  | "rejected"
  | "invalid_response";
export type CreateCreationResult =
  | { readonly ok: true; readonly creation: PublicCreation }
  | { readonly ok: false; readonly reason: CreateCreationFailure; readonly moderationBody: unknown | null };

export interface SubmitCreationOptions {
  readonly fetch?: typeof fetch; // default: looked up at call time
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number; // default CREATE_CREATION_TIMEOUT_MS
}

/** Defence in depth (invariant C): same rule as the zone client. */
const PRIVATE_KEY_PATTERN = /owner_?token|private_?wish/i;

function containsPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([k, v]) => PRIVATE_KEY_PATTERN.test(k) || containsPrivateKey(v));
}

const isIsoLike = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

/** Allowlist copy of the 201 `creation`, or null (invariant C defence in depth). Coord must be a valid persistable coord of the event's mode. */
export function toCreatedPublicCreation(raw: unknown, eventId: FestivalEventId): PublicCreation | null {
  if (!isPlainObject(raw)) return null;
  const id = raw.id;
  const itemEvent = raw.eventId;
  const zoneId = raw.zoneId;
  const appearance = raw.appearance;
  const coord = raw.coord;
  const publicWishText = raw.publicWishText;
  const createdAt = raw.createdAt;
  const expiresAt = raw.expiresAt;
  const displayName = raw.displayName;
  if (typeof id !== "string" || id === "") return null;
  if (itemEvent !== eventId) return null;
  if (typeof zoneId !== "number" || !Number.isSafeInteger(zoneId) || zoneId < ZONE_ID_MIN) return null;
  if (!isPlainObject(appearance)) return null;
  const mode = coordModeForEvent(eventId);
  if (mode === null) return null;
  const parsedCoord = parsePersistableCoord(coord);
  if (!parsedCoord.ok || parsedCoord.coord.mode !== mode) return null;
  if (publicWishText !== null && typeof publicWishText !== "string") return null;
  if (!isIsoLike(createdAt) || !isIsoLike(expiresAt)) return null;
  if (containsPrivateKey(appearance) || containsPrivateKey(coord)) return null;
  // MFW-62: absent (older server / mock) or null → null; any non-string → invalid; never a name without an open wish.
  if (displayName !== undefined && displayName !== null && typeof displayName !== "string") return null;
  return {
    id,
    eventId,
    zoneId,
    appearance: appearance as PublicCreation["appearance"],
    coord: parsedCoord.coord, // the parser's fresh allowlist copy
    publicWishText,
    createdAt,
    expiresAt,
    displayName: publicWishText === null ? null : (displayName ?? null),
  };
}

const fail = (reason: CreateCreationFailure, moderationBody: unknown | null = null): CreateCreationResult => ({
  ok: false,
  reason,
  moderationBody,
});

/** POST /api/creations. The raw ownerToken travels only in this JSON body (owner decision 1). Never logs. */
export async function submitCreation(
  body: CreateCreationRequestBody,
  options: SubmitCreationOptions = {},
): Promise<CreateCreationResult> {
  const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? CREATE_CREATION_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forward = (): void => controller.abort();
  const external = options.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forward);
  }
  try {
    let res: Response;
    try {
      res = await fetchImpl(CREATIONS_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
    } catch {
      return fail(timedOut ? "timeout" : external?.aborted ? "aborted" : "network");
    }
    const json: unknown = await res.json().catch(() => undefined);
    if (res.ok) {
      const creation = isPlainObject(json) ? toCreatedPublicCreation(json.creation, body.eventId) : null;
      return creation === null ? fail("invalid_response") : { ok: true, creation };
    }
    if (res.status === 422 && parseModerationBlockedBody(json) !== null) return fail("moderation_blocked", json);
    if (res.status === 409) return fail("event_closed");
    if (res.status >= 500) return fail("unavailable");
    return fail("rejected");
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forward);
  }
}
