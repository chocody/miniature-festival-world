import type { NewCreation, PublicCreation, ZoneQuery } from "./creationTypes";

export type CreationBackend = "memory" | "supabase";

export type CreationRepositoryErrorCode =
  | "invalid_input" // a NewCreation / ZoneQuery field failed validation (detail = field name)
  | "backend_misconfigured" // env / options wrong (detail = env var name or option name, never its value)
  | "backend_request_failed" // network error or non-2xx (detail = "network" | "status <n>")
  | "invalid_backend_response"; // 2xx but unusable body (detail = "json" | "list" | "insert" | "id")

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
   * Server write path only (MFW-45). Validates with validateNewCreation, then writes the public row and the private
   * ownership row atomically. Returns only the public part. Rejects with CreationRepositoryError.
   */
  insertCreation(input: NewCreation): Promise<PublicCreation>;
}
