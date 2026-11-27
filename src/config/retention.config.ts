import type { FestivalEventId } from "./events/types";

/** expires_at = festival end + this many days; then public and private rows are deleted (owner, 2026-11-23, open question 10). */
export const RETENTION_DAYS_AFTER_FESTIVAL_END = 30;
export const MS_PER_DAY = 86_400_000;
/**
 * Instant each festival ends (exclusive), ISO-8601 with offset. Loy Krathong 2026 = 24 Nov (docs/spec/01-roadmap.md);
 * "end" = end of that day in Thailand (UTC+7). PLACEHOLDER interpretation (spec silent): see Open question 1.
 * Christmas 2026 = the end of its date window 20–26 Dec (christmas.config.ts; plan L16 card 16.11).
 * Events without an entry have no retention date yet → computeCreationExpiresAt returns null (2.4 must refuse to create).
 */
export const FESTIVAL_ENDS_AT: Readonly<Partial<Record<FestivalEventId, string>>> = Object.freeze({
  loy_krathong: "2026-11-25T00:00:00+07:00",
  christmas: "2026-12-27T00:00:00+07:00",
});
