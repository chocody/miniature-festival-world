// MFW-62 (backlog 12.1): POST /api/wish-visibility — the owner opens or closes a creation's wish (owner decisions 29 and 36).
import { UUID_PATTERN } from "@/config/database.config";
import { WISH_VISIBILITY_REQUEST_MAX_BYTES } from "@/config/ownerWish.config";
import { hashOwnerToken, isDeviceOwnerToken, type DeviceOwnerToken } from "@/services/auth";
import { ownerTokenHashesMatch } from "@/services/auth/ownerProof";
import { checkPublicWish, toModerationBlockedBody, type ModerationReason } from "@/services/moderation";
import type { CreationBackend, CreationRepository } from "./creationRepository";
import { getCreationRepository, isProductionDeployment } from "./creationRepositoryFactory";
import { isStorableDisplayName, normalizeDisplayName } from "./displayName";
import { isPlainObject } from "./json";
import { getPrivateWishCipher, getPrivateWishReader, type PrivateWishCipher, type PrivateWishReader } from "./privateWishCipher";
import { readRequestTextWithLimit } from "./requestBody";
import {
  WISH_VISIBILITY_BODY_KEYS,
  type WishVisibilityErrorBody,
  type WishVisibilityResponseBody,
} from "./wishVisibilityTypes";

export interface WishVisibilitySwitchDeps {
  readonly getRepository: () => CreationRepository; // may throw → 503
  readonly getWishReader: (backend: CreationBackend) => Promise<PrivateWishReader>; // may reject → 503
  readonly getCipher: (backend: CreationBackend) => Promise<PrivateWishCipher>; // may reject → 503
  readonly isProduction: boolean;
}

export interface ParsedWishVisibilityRequest {
  readonly creationId: string;
  readonly ownerToken: DeviceOwnerToken;
  readonly open: boolean;
}

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_STORE = { "Cache-Control": "no-store" } as const;
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
/** One frozen body for unknown, expired, not-yours and nothing-to-switch: byte-identical answers (no oracle). */
const NOT_FOUND: WishVisibilityErrorBody = Object.freeze({ error: "not_found" });
const OPENED: WishVisibilityResponseBody = Object.freeze({ open: true });
const CLOSED: WishVisibilityResponseBody = Object.freeze({ open: false });

function respond(status: number, body: WishVisibilityResponseBody | WishVisibilityErrorBody): Response {
  return Response.json(body, { status, headers: NO_STORE });
}
const invalidBody = (): Response => respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
const unavailable = (): Response => respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
const notFound = (): Response => respond(HTTP_NOT_FOUND, NOT_FOUND);
const conflict = (): Response => respond(HTTP_CONFLICT, { error: "conflict" });

/** Exactly WISH_VISIBILITY_BODY_KEYS in any order; lowercase uuid; isDeviceOwnerToken; open is a boolean. Else null. Never echoes. */
export function parseWishVisibilityRequest(value: unknown): ParsedWishVisibilityRequest | null {
  if (!isPlainObject(value)) return null;
  const allowed: readonly string[] = WISH_VISIBILITY_BODY_KEYS;
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || !keys.every((key) => allowed.includes(key))) return null;
  const { creationId, ownerToken, open } = value;
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) return null;
  if (!isDeviceOwnerToken(ownerToken)) return null;
  if (typeof open !== "boolean") return null;
  return { creationId, ownerToken, open };
}

/** The public-wish guard with the CURRENT rules; [] for null or a clean text. */
function guard(text: string | null): readonly ModerationReason[] {
  if (text === null) return [];
  const result = checkPublicWish(text);
  return result.ok ? [] : result.reasons;
}

/** POST /api/wish-visibility logic (MFW-62). Never logs; never puts a request value into a response. */
export async function handleWishVisibilitySwitch(request: Request, deps: WishVisibilitySwitchDeps): Promise<Response> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    return respond(HTTP_UNSUPPORTED_MEDIA_TYPE, { error: "unsupported_media_type" });
  }
  if (new URL(request.url).search !== "") return respond(HTTP_BAD_REQUEST, { error: "unexpected_query" });
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > WISH_VISIBILITY_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  const body = await readRequestTextWithLimit(request, WISH_VISIBILITY_REQUEST_MAX_BYTES);
  if (!body.ok) {
    return body.reason === "too_large" ? respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" }) : invalidBody();
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return invalidBody();
  }
  const parsed = parseWishVisibilityRequest(json);
  if (parsed === null) return invalidBody();

  let repository: CreationRepository;
  try {
    repository = deps.getRepository();
  } catch {
    return unavailable();
  }
  if (repository.backend === "memory" && deps.isProduction) return unavailable();

  try {
    // Keyring first: a key misconfiguration is a 503 for every request, never only for rows that match (no oracle).
    const reader = await deps.getWishReader(repository.backend);
    const cipher = await deps.getCipher(repository.backend);
    const presentedHash = await hashOwnerToken(parsed.ownerToken); // the raw token is not used after this line
    const state = await repository.readWishSwitchState(parsed.creationId);
    const isOwner = ownerTokenHashesMatch(presentedHash, state === null ? null : state.ownerTokenHash);
    if (!isOwner || state === null) return notFound();

    if (parsed.open) {
      // Owner decision 36: a wish hidden by reports or moderation is never opened again (checked before "already open").
      if (state.hidden) return respond(HTTP_CONFLICT, { error: "hidden" });
      if (state.publicWishText !== null) return respond(HTTP_OK, OPENED); // idempotent, nothing written
      if (state.privateWish === null) return notFound(); // nothing to open
      const decrypted = await reader.decrypt(state.privateWish, presentedHash, "wish");
      if (decrypted === null) return unavailable();
      const wishText = decrypted.trim();
      if (wishText === "") return unavailable();
      let name: string | null = null;
      if (state.privateDisplayName !== null) {
        const rawName = await reader.decrypt(state.privateDisplayName, presentedHash, "displayName");
        if (rawName === null) return unavailable();
        name = normalizeDisplayName(rawName);
      }
      // Invariant G: the current rules decide, whatever was checked at create time. Nothing is written when blocked.
      const reasons = [...guard(wishText), ...guard(name)];
      if (reasons.length > 0) return respond(HTTP_UNPROCESSABLE, toModerationBlockedBody(reasons));
      if (name !== null && !isStorableDisplayName(name)) return unavailable(); // e.g. the length limit was lowered; fail closed
      const outcome = await repository.openWish({
        creationId: parsed.creationId,
        expectedPrivateWish: state.privateWish.ciphertext,
        publicWishText: wishText,
        displayName: name,
      });
      return outcome === "switched" ? respond(HTTP_OK, OPENED) : conflict();
    }

    if (state.publicWishText === null) return respond(HTTP_OK, CLOSED); // already closed (also when hidden), nothing written
    const privateWish = await cipher.encrypt(state.publicWishText, presentedHash, "wish");
    const privateDisplayName =
      state.displayName === null ? null : await cipher.encrypt(state.displayName, presentedHash, "displayName");
    const outcome = await repository.closeWish({
      creationId: parsed.creationId,
      expectedPublicWishText: state.publicWishText,
      expectedDisplayName: state.displayName,
      privateWish,
      privateDisplayName,
    });
    return outcome === "switched" ? respond(HTTP_OK, CLOSED) : conflict();
  } catch {
    return unavailable();
  }
}

/** Route wiring; reads process.env only when called. */
export function getDefaultWishVisibilitySwitchDeps(): WishVisibilitySwitchDeps {
  return {
    getRepository: getCreationRepository,
    getWishReader: getPrivateWishReader,
    getCipher: getPrivateWishCipher,
    isProduction: isProductionDeployment(process.env),
  };
}
