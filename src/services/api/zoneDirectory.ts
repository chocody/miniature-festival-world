import type { FestivalEventId } from "@/config/events/types";
import { zoneCountFromHighestZoneId } from "@/core/world/zoneManager";
import { ZONE_API_QUERY_PARAMS } from "./apiPaths";
import type { CreationRepository } from "./creationRepository";
import type { ApiErrorBody, ZoneDirectoryResponse } from "./creationTypes";
import { isFestivalEventId } from "./creationValidation";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const respond = (status: number, body: ZoneDirectoryResponse | ApiErrorBody): Response =>
  Response.json(body, { status, headers: NO_STORE });

export type ZoneDirectoryQueryResult =
  | { readonly ok: true; readonly eventId: FestivalEventId }
  | { readonly ok: false; readonly field: "event" };

export function parseZoneDirectoryQuery(params: URLSearchParams): ZoneDirectoryQueryResult {
  const events = params.getAll(ZONE_API_QUERY_PARAMS.event);
  const eventId = events[0];
  if (events.length !== 1 || !isFestivalEventId(eventId)) return { ok: false, field: "event" };
  return { ok: true, eventId };
}

/** GET /api/zones logic. `getRepository` may throw (misconfigured env) → 503. Never logs. */
export async function handleZoneDirectory(
  request: Request,
  getRepository: () => CreationRepository,
): Promise<Response> {
  const parsed = parseZoneDirectoryQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return respond(HTTP_BAD_REQUEST, { error: "invalid_query", field: "event" });
  let zoneCount: number;
  try {
    zoneCount = zoneCountFromHighestZoneId(await getRepository().highestVisibleZoneId(parsed.eventId));
  } catch {
    return respond(HTTP_SERVICE_UNAVAILABLE, { error: "unavailable" });
  }
  return respond(HTTP_OK, { eventId: parsed.eventId, zoneCount });
}
