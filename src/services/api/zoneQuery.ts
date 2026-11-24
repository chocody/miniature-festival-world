import type { ZoneQuery, ZoneQueryField } from "./creationTypes";
import { isFestivalEventId, isZoneId } from "./creationValidation";

export type ZoneQueryParseResult =
  | { readonly ok: true; readonly query: ZoneQuery }
  | { readonly ok: false; readonly field: ZoneQueryField };

/** Query parameter names of GET /api/creations. */
export const ZONE_QUERY_PARAMS = Object.freeze({ event: "event", zone: "zone" } as const);

/** Canonical non-negative decimal integer, no sign, no leading zeros (range is checked by isZoneId). */
const ZONE_PARAM_PATTERN = /^(0|[1-9][0-9]*)$/;

export function parseZoneQuery(params: URLSearchParams): ZoneQueryParseResult {
  const events = params.getAll(ZONE_QUERY_PARAMS.event);
  const eventId = events[0];
  if (events.length !== 1 || !isFestivalEventId(eventId)) return { ok: false, field: "event" };
  const zones = params.getAll(ZONE_QUERY_PARAMS.zone);
  const zoneParam = zones[0];
  if (zones.length !== 1 || zoneParam === undefined || !ZONE_PARAM_PATTERN.test(zoneParam)) {
    return { ok: false, field: "zone" };
  }
  const zoneId = Number(zoneParam);
  if (!isZoneId(zoneId)) return { ok: false, field: "zone" };
  return { ok: true, query: { eventId, zoneId } };
}
