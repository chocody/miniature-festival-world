import type { FestivalEventId } from "@/config/events/types";
import { isEventEnabled } from "@/config/featureFlags.config";
import { CREATE_CREATION_MAX_ATTEMPTS, CREATE_CREATION_REQUEST_MAX_BYTES } from "@/config/creationWrite.config";
import { parseEventAppearance } from "@/core/customization/appearanceRegistry";
import { hashOwnerToken } from "@/services/auth";
import { toModerationBlockedBody } from "@/services/moderation";
import type { CreateCreationErrorBody, CreateCreationField, CreateCreationResponseBody } from "./createCreationTypes";
import { parseCreateCreationRequest } from "./createCreationRequest";
import { getCreationPlacementStrategy, type CreationPlacementStrategy, type PlacementSource } from "./creationPlacement";
import { getCreationRepository, isProductionDeployment } from "./creationRepositoryFactory";
import type { CreationBackend, CreationRepository } from "./creationRepository";
import { getPrivateWishCipher, type PrivateWishCipher } from "./privateWishCipher";
import { pickPublicCreation } from "./publicCreation";
import { computeCreationExpiresAt } from "./retention";
import { cloneJsonObject } from "./json";
import { evaluateWishDraft, toWishColumns } from "./wishPayload";

export interface CreateCreationDeps {
  readonly getRepository: () => CreationRepository; // may throw (misconfigured) -> 503
  readonly getCipher: (backend: CreationBackend) => Promise<PrivateWishCipher>;
  readonly isProduction: boolean;
  readonly now?: () => number; // default Date.now
  readonly getPlacementStrategy?: (eventId: FestivalEventId) => CreationPlacementStrategy | null;
}

const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;
const NO_STORE = { "Cache-Control": "no-store" };
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;

function respond(status: number, body: CreateCreationResponseBody | CreateCreationErrorBody): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function invalidBody(field: CreateCreationField): Response {
  return respond(HTTP_BAD_REQUEST, { error: "invalid_body", field });
}

function unavailable(): Response {
  return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
}

/** POST /api/creations logic (backlog 2.4). Never logs; never puts a request value into a response. */
export async function handleCreateCreation(request: Request, deps: CreateCreationDeps): Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const placementFor = deps.getPlacementStrategy ?? getCreationPlacementStrategy;

  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    return respond(HTTP_UNSUPPORTED_MEDIA_TYPE, { error: "unsupported_media_type" });
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > CREATE_CREATION_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return invalidBody("body");
  }
  if (new TextEncoder().encode(raw).byteLength > CREATE_CREATION_REQUEST_MAX_BYTES) {
    return respond(HTTP_PAYLOAD_TOO_LARGE, { error: "payload_too_large" });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalidBody("body");
  }

  const parsed = parseCreateCreationRequest(json);
  if (!parsed.ok) return invalidBody(parsed.field);
  const req = parsed.request;
  const { eventId, coord } = req;

  const strategy = placementFor(eventId);
  const expiresAt = computeCreationExpiresAt(eventId);
  if (!isEventEnabled(eventId) || strategy === null || expiresAt === null || expiresAt.getTime() <= now()) {
    return respond(HTTP_CONFLICT, { error: "event_closed" });
  }
  if (!strategy.acceptsCoord(coord)) return invalidBody("coord");

  const parsedAppearance = parseEventAppearance(eventId, req.appearance);
  if (!parsedAppearance.ok) return invalidBody("appearance");
  const appearance = cloneJsonObject(parsedAppearance.appearance);
  if (appearance === null) return invalidBody("appearance");

  const evaluation = evaluateWishDraft({ text: req.wishText, visibility: req.wishVisibility });
  if (!evaluation.ok) {
    if (evaluation.issues.includes("text_empty") || evaluation.issues.includes("text_too_long")) {
      return invalidBody("wishText");
    }
    if (evaluation.issues.includes("moderation_blocked")) {
      return respond(HTTP_UNPROCESSABLE, toModerationBlockedBody(evaluation.moderationReasons));
    }
    return invalidBody("wishVisibility"); // visibility_missing cannot happen after parsing; fail closed
  }
  const { publicWishText, privateWishPlaintext } = toWishColumns(evaluation.wish); // exactly one is non-null

  let repository: CreationRepository;
  try {
    repository = deps.getRepository();
  } catch {
    return unavailable();
  }
  if (repository.backend === "memory" && deps.isProduction) return unavailable();

  try {
    const ownerTokenHash = await hashOwnerToken(req.ownerToken); // the raw token is not used after this line
    const privateWish =
      privateWishPlaintext === null
        ? null
        : await (await deps.getCipher(repository.backend)).encrypt(privateWishPlaintext, ownerTokenHash);
    const source: PlacementSource = {
      zoneItemCounts: () => repository.zoneItemCounts(eventId),
      listZoneOccupants: (zoneId) => repository.listZoneOccupants({ eventId, zoneId }),
    };
    for (let attempt = 1; attempt <= CREATE_CREATION_MAX_ATTEMPTS; attempt += 1) {
      const createdAtMs = now(); // fresh server time per attempt, never the client clock
      const placement = await strategy.place(coord, createdAtMs, source);
      const result = await repository.insertCreationGuarded({
        eventId,
        zoneId: placement.zoneId,
        appearance,
        coord: placement.coord,
        publicWishText,
        expiresAt,
        ownerTokenHash,
        privateWish,
        createdAt: new Date(createdAtMs),
        expectedOccupantIds: placement.expectedOccupantIds,
      });
      if (result.status === "inserted") return respond(HTTP_CREATED, { creation: pickPublicCreation(result.creation) });
    }
  } catch {
    return unavailable();
  }
  return unavailable(); // every attempt saw zone_changed
}

/** Route wiring; reads process.env only when called. */
export function getDefaultCreateCreationDeps(): CreateCreationDeps {
  return {
    getRepository: getCreationRepository,
    getCipher: getPrivateWishCipher,
    isProduction: isProductionDeployment(process.env),
    now: () => Date.now(),
    getPlacementStrategy: getCreationPlacementStrategy,
  };
}
