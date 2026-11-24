import type { FestivalEventId } from "@/config/events/types";
import { FESTIVAL_ENDS_AT, MS_PER_DAY, RETENTION_DAYS_AFTER_FESTIVAL_END } from "@/config/retention.config";

/** expires_at for a creation of `eventId` (owner decision 10): festival end + 30 days. null = no end date configured. */
export function computeCreationExpiresAt(eventId: FestivalEventId): Date | null {
  const endsAt = FESTIVAL_ENDS_AT[eventId];
  if (endsAt === undefined) return null;
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs)) return null;
  return new Date(endMs + RETENTION_DAYS_AFTER_FESTIVAL_END * MS_PER_DAY);
}
