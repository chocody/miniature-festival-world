import type { FestivalEventId } from "@/config/events/types";
import { CREATE_CREATION_MAX_ATTEMPTS, CREATE_CREATION_REQUEST_MAX_BYTES } from "@/config/creationWrite.config";
import { parseEventAppearance } from "@/core/customization/appearanceRegistry";
import { hashOwnerToken } from "@/services/auth";
import { toModerationBlockedBody } from "@/services/moderation";
import { isServerActiveEvent } from "./activeEvent";
import type { CreateCreationErrorBody, CreateCreationField, CreateCreationResponseBody } from "./createCreationTypes";
import { parseCreateCreationRequest } from "./createCreationRequest";
import { getCreationPlacementStrategy, type CreationPlacementStrategy, type PlacementSource } from "./creationPlacement";
import { getCreationRepository, isProductionDeployment } from "./creationRepositoryFactory";
import type { CreationBackend, CreationRepository } from "./creationRepository";
import { getPrivateWishCipher, type PrivateWishCipher } from "./privateWishCipher";
import { pickPublicCreation } from "./publicCreation";
import { computeCreationExpiresAt } from "./retention";
import { cloneJsonObject } from "./json";
import { evaluateDisplayName } from "./displayName";
import { evaluateWishDraft, toWishColumns } from "./wishPayload";

export interface CreateCreationDeps {
  readonly getRepository: () => CreationRepository; // may throw (misconfigured) -> 503
  readonly getCipher: (backend: CreationBackend) => Promise<PrivateWishCipher>;
  readonly isProduction: boolean;
  readonly now?: () => number; // default Date.now
  readonly getPlacementStrategy?: (eventId: FestivalEventId) => CreationPlacementStrategy | null;
  readonly isEventActive?: (eventId: FestivalEventId, nowMs: number) => boolean; // default isServerActiveEvent (MFW-53)
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
  const isActive = deps.isEventActive ?? isServerActiveEvent;

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
  if (!isActive(eventId, now()) || strategy === null || expiresAt === null || expiresAt.getTime() <= now()) {
    return respond(HTTP_CONFLICT, { error: "event_closed" });
  }
  if (!strategy.acceptsCoord(coord)) return invalidBody("coord");

  const parsedAppearance = parseEventAppearance(eventId, req.appearance);
  if (!parsedAppearance.ok) return invalidBody("appearance");
  const appearance = cloneJsonObject(parsedAppearance.appearance);
  if (appearance === null) return invalidBody("appearance");

  const evaluation = evaluateWishDraft({ text: req.wishText, visibility: req.wishVisibility });
  const nameEvaluation = evaluateDisplayName(req.displayName);
  if (!evaluation.ok && (evaluation.issues.includes("text_empty") || evaluation.issues.includes("text_too_long"))) {
    return invalidBody("wishText");
  }
  if (!nameEvaluation.ok && nameEvaluation.issue !== "moderation_blocked") return invalidBody("displayName");
  const blockedReasons = [
    ...(!evaluation.ok && evaluation.issues.includes("moderation_blocked") ? evaluation.moderationReasons : []),
    ...(!nameEvaluation.ok ? nameEvaluation.moderationReasons : []),
  ];
  if (blockedReasons.length > 0) return respond(HTTP_UNPROCESSABLE, toModerationBlockedBody(blockedReasons));
  if (!evaluation.ok) return invalidBody("wishVisibility"); // visibility_missing cannot happen after parsing; fail closed
  if (!nameEvaluation.ok) return invalidBody("displayName"); // unreachable; narrows the type
  const { publicWishText, privateWishPlaintext } = toWishColumns(evaluation.wish); // exactly one is non-null
  // Owner decision 29: the name follows the switch — public with a public wish, encrypted with a private one.
  const displayName = publicWishText === null ? null : nameEvaluation.name;
  const privateDisplayNamePlaintext = publicWishText === null ? nameEvaluation.name : null;

  let repository: CreationRepository;
  try {
    repository = deps.getRepository();
  } catch {
    return unavailable();
  }
  if (repository.backend === "memory" && deps.isProduction) return unavailable();

  try {
    const ownerTokenHash = await hashOwnerToken(req.ownerToken); // the raw token is not used after this line
    const cipher = privateWishPlaintext === null ? null : await deps.getCipher(repository.backend);
    const privateWish =
      cipher === null || privateWishPlaintext === null ? null : await cipher.encrypt(privateWishPlaintext, ownerTokenHash);
    const privateDisplayName =
      cipher === null || privateDisplayNamePlaintext === null
        ? null
        : await cipher.encrypt(privateDisplayNamePlaintext, ownerTokenHash, "displayName");
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
        displayName,
        privateDisplayName,
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
    isEventActive: isServerActiveEvent,
  };
}
