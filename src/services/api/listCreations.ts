import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { CreationRepository } from "./creationRepository";
import type { ApiErrorBody, PublicCreation, PublicZoneResponse } from "./creationTypes";
import { pickPublicCreation } from "./publicCreation";
import { parseZoneQuery } from "./zoneQuery";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const respond = (status: number, body: PublicZoneResponse | ApiErrorBody): Response =>
  Response.json(body, { status, headers: NO_STORE });

/** GET /api/creations logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleListCreations(
  request: Request,
  getRepository: () => CreationRepository,
): Promise<Response> {
  const parsed = parseZoneQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return respond(HTTP_BAD_REQUEST, { error: "invalid_query", field: parsed.field });
  let items: readonly PublicCreation[];
  try {
    items = await getRepository().listPublicZone(parsed.query);
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  return respond(HTTP_OK, {
    eventId: parsed.query.eventId,
    zoneId: parsed.query.zoneId,
    limit: ZONE_ITEM_CAP,
    items: items.slice(0, ZONE_ITEM_CAP).map(pickPublicCreation),
  });
}
