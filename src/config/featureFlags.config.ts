import type { FestivalEventId } from "./events";

export type EventFeatureFlags = Readonly<Record<FestivalEventId, boolean>>;

/**
 * Which festivals are built and may become active (MFW-53). Loy Krathong and Christmas (MFW-88);
 * production still opens only what `ACTIVE_EVENT_OVERRIDE` or the date window allows.
 */
export const EVENT_FEATURE_FLAGS: EventFeatureFlags = Object.freeze({
  loy_krathong: true,
  christmas: true,
  new_year: false,
  chinese_new_year: false,
  valentines: false,
  songkran: false,
  mid_autumn: false,
  halloween: false,
});

/**
 * True only when `flags` has an own property `id` set to exactly `true`.
 * Unknown ids and inherited keys ("__proto__", "toString", ...) are never enabled.
 */
export function isEventEnabled(id: string, flags: EventFeatureFlags = EVENT_FEATURE_FLAGS): boolean {
  return (
    Object.prototype.hasOwnProperty.call(flags, id) &&
    (flags as Readonly<Record<string, unknown>>)[id] === true
  );
}
