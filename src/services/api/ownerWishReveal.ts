import { UUID_PATTERN } from "@/config/database.config";
import { OWNER_WISH_REVEAL_REQUEST_MAX_BYTES } from "@/config/ownerWish.config";
import { hashOwnerToken, isDeviceOwnerToken, type DeviceOwnerToken } from "@/services/auth";
import { ownerTokenHashesMatch } from "@/services/auth/ownerProof";
import type { CreationBackend, CreationRepository } from "./creationRepository";
import { getCreationRepository, isProductionDeployment } from "./creationRepositoryFactory";
import { isPlainObject } from "./json";
import { OWNER_WISH_REVEAL_BODY_KEYS, type OwnerWishRevealErrorBody, type OwnerWishRevealResponseBody } from "./ownerWishRevealTypes";
import { getPrivateWishReader, type PrivateWishReader } from "./privateWishCipher";
import { readRequestTextWithLimit } from "./requestBody";

export interface OwnerWishRevealDeps {
  readonly getRepository: () => CreationRepository; // may throw (misconfigured) → 503
  readonly getWishReader: (backend: CreationBackend) => Promise<PrivateWishReader>; // may reject (key env) → 503
  readonly isProduction: boolean;
}

export interface ParsedOwnerWishRevealRequest {
  readonly creationId: string;
  readonly ownerToken: DeviceOwnerToken;
}

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_STORE = { "Cache-Control": "no-store" } as const;
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;
const NOT_REVEALED: OwnerWishRevealResponseBody = Object.freeze({ wishText: null });

function respond(status: number, body: OwnerWishRevealResponseBody | OwnerWishRevealErrorBody): Response {
  return Response.json(body, { status, headers: NO_STORE });
}
const invalidBody = (): Response => respond(HTTP_BAD_REQUEST, { error: "invalid_body" });
const unavailable = (): Response => respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });

/** Exactly { creationId: lowercase uuid, ownerToken: DeviceOwnerToken } in any key order; anything else → null. Never echoes. */
export function parseOwnerWishRevealRequest(value: unknown): ParsedOwnerWishRevealRequest | null {
  if (!isPlainObject(value)) return null;
  const allowed: readonly string[] = OWNER_WISH_REVEAL_BODY_KEYS;
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || !keys.every((key) => allowed.includes(key))) return null;
  const { creationId, ownerToken } = value;
  if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) return null;
  if (!isDeviceOwnerToken(ownerToken)) return null;
  return { creationId, ownerToken };
}

/** POST /api/private-wish logic (backlog 7.2). Never logs; never puts a request value into a response. */
export async function handleOwnerWishReveal(request: Request, deps: OwnerWishRevealDeps): Promise<Response> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    return respond(HTTP_UNSUPPORTED_MEDIA_TYPE, { error: "unsupported_media_type" });
  }
  if (new URL(request.url).search !== "") return respond(HTTP_BAD_REQUEST, { error: "unexpected_query" });
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > OWNER_WISH_REVEAL_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  const body = await readRequestTextWithLimit(request, OWNER_WISH_REVEAL_REQUEST_MAX_BYTES);
  if (!body.ok) {
    return body.reason === "too_large" ? respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" }) : invalidBody();
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return invalidBody();
  }
  const parsed = parseOwnerWishRevealRequest(json);
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
    const presentedHash = await hashOwnerToken(parsed.ownerToken); // the raw token is not used after this line
    const record = await repository.readOwnership(parsed.creationId);
    const isOwner = ownerTokenHashesMatch(presentedHash, record === null ? null : record.ownerTokenHash);
    if (!isOwner || record === null || record.privateWish === null) return respond(HTTP_OK, NOT_REVEALED);
    const wishText = await reader.decrypt(record.privateWish, presentedHash);
    return respond(HTTP_OK, wishText === null || wishText === "" ? NOT_REVEALED : { wishText });
  } catch {
    return unavailable();
  }
}

/** Route wiring; reads process.env only when called. */
export function getDefaultOwnerWishRevealDeps(): OwnerWishRevealDeps {
  return {
    getRepository: getCreationRepository,
    getWishReader: getPrivateWishReader,
    isProduction: isProductionDeployment(process.env),
  };
}
