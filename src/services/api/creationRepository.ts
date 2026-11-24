import type { FestivalEventId } from "@/config/events/types";
import type { NewCreation, PublicCreation, ZoneQuery } from "./creationTypes";

export type CreationBackend = "memory" | "supabase";

export type CreationRepositoryErrorCode =
  | "invalid_input" // a NewCreation / ZoneQuery field failed validation (detail = field name)
  | "backend_misconfigured" // env / options wrong (detail = env var name or option name, never its value)
  | "backend_request_failed" // network error or non-2xx (detail = "network" | "status <n>")
  | "invalid_backend_response"; // 2xx but unusable body (detail = "json" | "list" | "insert" | "id" | "report" | "zone")

/** counted = report_count was incremented; ignored = unknown, private-only, expired or already hidden/flagged creation. */
export type ReportOutcome = "counted" | "ignored";

export class CreationRepositoryError extends Error {
  readonly code: CreationRepositoryErrorCode;
  readonly detail: string | undefined;
  constructor(code: CreationRepositoryErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "CreationRepositoryError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Storage of creations, split into public and private parts (spec §5). Implementations: in-memory (no env) and
 * Supabase (env set). Later cards ADD methods here (MFW-13 report, MFW-31 ownership proof, MFW-45 zone occupancy).
 */
export interface CreationRepository {
  readonly backend: CreationBackend;
  /**
   * Visible creations of one zone: moderation_status 'approved', report_count < AUTO_HIDE_REPORT_THRESHOLD,
   * expires_at > now; ordered by createdAt then id ascending; at most ZONE_ITEM_CAP. Returns PublicCreation only.
   */
  listPublicZone(query: ZoneQuery): Promise<readonly PublicCreation[]>;
  /**
   * Highest zone id that has at least one VISIBLE creation of `eventId` (same filter as listPublicZone), or null.
   * Rejects with CreationRepositoryError("invalid_input", "eventId") for an unknown event.
   */
  highestVisibleZoneId(eventId: FestivalEventId): Promise<number | null>;
  /**
   * Server write path only (MFW-45). Validates with validateNewCreation, then writes the public row and the private
   * ownership row atomically. Returns only the public part. Rejects with CreationRepositoryError.
   */
  insertCreation(input: NewCreation): Promise<PublicCreation>;
  /**
   * Report a public wish (backlog 2.3). Atomically: if the creation exists, has public_wish_text, is not expired, is
   * 'approved' and report_count < AUTO_HIDE_REPORT_THRESHOLD, then report_count += 1, and when it reaches the threshold
   * moderation_status = AUTO_HIDE_MODERATION_STATUS. Rejects invalid_input "creationId" for a non-uuid. Never needs a token.
   */
  reportCreation(creationId: string): Promise<ReportOutcome>;
}
