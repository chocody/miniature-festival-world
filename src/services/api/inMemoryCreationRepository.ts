import { UUID_PATTERN } from "@/config/database.config";
import type { FestivalEventId } from "@/config/events/types";
import {
  AUTO_HIDE_MODERATION_STATUS,
  AUTO_HIDE_REPORT_THRESHOLD,
  DEFAULT_MODERATION_STATUS,
  MODERATION_STATUSES,
  type ModerationStatus,
} from "@/config/moderation.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import type { OwnerTokenHash } from "@/services/auth";
import { CreationRepositoryError, type CreationRepository, type ReportOutcome } from "./creationRepository";
import type { AppearanceJson, EncryptedPrivateWish, NewCreation, PublicCreation, ZoneQuery } from "./creationTypes";
import { isFestivalEventId, isZoneId, validateNewCreation } from "./creationValidation";

export interface InMemoryCreationRepositoryOptions {
  /** Epoch ms clock; default Date.now. */
  readonly now?: () => number;
  /** Id generator; default () => globalThis.crypto.randomUUID(). */
  readonly newId?: () => string;
}

export interface CreationModerationPatch {
  readonly moderationStatus?: ModerationStatus;
  readonly reportCount?: number; // integer >= 0
}

export interface CreationModerationState {
  readonly reportCount: number;
  readonly moderationStatus: ModerationStatus;
}

export interface InMemoryCreationRepository extends CreationRepository {
  readonly backend: "memory";
  /** Mirrors a private-table update (used by tests now, by MFW-13's in-memory report path later). false = unknown id. */
  setModeration(id: string, patch: CreationModerationPatch): boolean;
  /** Test/inspection helper (server only): a copy of the private moderation fields, or null for an unknown id. */
  getModerationState(id: string): CreationModerationState | null;
}

interface StoredPublicRow {
  id: string;
  eventId: FestivalEventId;
  zoneId: number;
  appearance: AppearanceJson;
  coord: PersistableCoord;
  publicWishText: string | null;
  createdAtMs: number;
  expiresAtMs: number;
}

interface StoredPrivateRow {
  creationId: string;
  ownerTokenHash: OwnerTokenHash;
  privateWish: EncryptedPrivateWish | null;
  reportCount: number;
  moderationStatus: ModerationStatus;
}

function toPublic(row: StoredPublicRow): PublicCreation {
  return {
    id: row.id,
    eventId: row.eventId,
    zoneId: row.zoneId,
    appearance: structuredClone(row.appearance),
    coord: structuredClone(row.coord),
    publicWishText: row.publicWishText,
    createdAt: new Date(row.createdAtMs).toISOString(),
    expiresAt: new Date(row.expiresAtMs).toISOString(),
  };
}

export function createInMemoryCreationRepository(
  options: InMemoryCreationRepositoryOptions = {},
): InMemoryCreationRepository {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  // Two separate maps, like the two tables.
  const publicRows = new Map<string, StoredPublicRow>();
  const privateRows = new Map<string, StoredPrivateRow>();

  /** Public-read visibility: not expired, approved and below the auto-hide report threshold. */
  function isVisible(row: StoredPublicRow, nowMs: number): boolean {
    if (row.expiresAtMs <= nowMs) return false;
    const p = privateRows.get(row.id);
    return p !== undefined && p.moderationStatus === "approved" && p.reportCount < AUTO_HIDE_REPORT_THRESHOLD;
  }

  return {
    backend: "memory",

    async insertCreation(input: NewCreation): Promise<PublicCreation> {
      const nowMs = now();
      const v = validateNewCreation(input, nowMs);
      const id = newId();
      if (!UUID_PATTERN.test(id) || publicRows.has(id)) {
        throw new CreationRepositoryError("invalid_backend_response", "id");
      }
      const publicRow: StoredPublicRow = {
        id,
        eventId: v.eventId,
        zoneId: v.zoneId,
        appearance: v.appearance,
        coord: v.coord,
        publicWishText: v.publicWishText,
        createdAtMs: nowMs,
        expiresAtMs: v.expiresAt.getTime(),
      };
      publicRows.set(id, publicRow);
      privateRows.set(id, {
        creationId: id,
        ownerTokenHash: v.ownerTokenHash,
        privateWish: v.privateWish,
        reportCount: 0,
        moderationStatus: DEFAULT_MODERATION_STATUS,
      });
      return toPublic(publicRow);
    },

    async listPublicZone(query: ZoneQuery): Promise<readonly PublicCreation[]> {
      if (!isFestivalEventId(query.eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
      if (!isZoneId(query.zoneId)) throw new CreationRepositoryError("invalid_input", "zoneId");
      const nowMs = now();
      return [...publicRows.values()]
        .filter((r) => r.eventId === query.eventId && r.zoneId === query.zoneId && isVisible(r, nowMs))
        .sort((a, b) => a.createdAtMs - b.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, ZONE_ITEM_CAP)
        .map(toPublic);
    },

    async highestVisibleZoneId(eventId: FestivalEventId): Promise<number | null> {
      if (!isFestivalEventId(eventId)) throw new CreationRepositoryError("invalid_input", "eventId");
      const nowMs = now();
      let highest: number | null = null;
      for (const row of publicRows.values()) {
        if (row.eventId !== eventId || !isVisible(row, nowMs)) continue;
        if (highest === null || row.zoneId > highest) highest = row.zoneId;
      }
      return highest;
    },

    setModeration(id: string, patch: CreationModerationPatch): boolean {
      if (
        patch.moderationStatus !== undefined &&
        !(MODERATION_STATUSES as readonly string[]).includes(patch.moderationStatus)
      ) {
        throw new CreationRepositoryError("invalid_input", "moderationStatus");
      }
      if (
        patch.reportCount !== undefined &&
        !(Number.isInteger(patch.reportCount) && patch.reportCount >= 0)
      ) {
        throw new CreationRepositoryError("invalid_input", "reportCount");
      }
      const row = privateRows.get(id);
      if (row === undefined) return false;
      if (patch.moderationStatus !== undefined) row.moderationStatus = patch.moderationStatus;
      if (patch.reportCount !== undefined) row.reportCount = patch.reportCount;
      return true;
    },

    async reportCreation(creationId: string): Promise<ReportOutcome> {
      if (typeof creationId !== "string" || !UUID_PATTERN.test(creationId)) {
        throw new CreationRepositoryError("invalid_input", "creationId");
      }
      const nowMs = now();
      const pub = publicRows.get(creationId);
      const priv = privateRows.get(creationId);
      if (pub === undefined || priv === undefined) return "ignored";
      if (pub.publicWishText === null || pub.expiresAtMs <= nowMs) return "ignored";
      if (priv.moderationStatus !== DEFAULT_MODERATION_STATUS || priv.reportCount >= AUTO_HIDE_REPORT_THRESHOLD) {
        return "ignored";
      }
      const reportCount = priv.reportCount + 1;
      priv.reportCount = reportCount;
      if (reportCount >= AUTO_HIDE_REPORT_THRESHOLD) priv.moderationStatus = AUTO_HIDE_MODERATION_STATUS;
      return "counted";
    },

    getModerationState(id: string): CreationModerationState | null {
      const priv = privateRows.get(id);
      return priv === undefined ? null : { reportCount: priv.reportCount, moderationStatus: priv.moderationStatus };
    },
  };
}
