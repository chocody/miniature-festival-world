import { create } from "zustand";
import type { FestivalEventId } from "@/config/events/types";
import type { StretchAnchor } from "@/core/world/riverStretches";
import type { PublicCreation } from "@/services/api/creationTypes";

export type ZoneLoadStatus = "idle" | "loading" | "ready" | "error";

/** Shared-world status (spec §3: โซนปัจจุบัน, จำนวนผู้เล่น, ระดับการเติบโตของโลก). Fed from public endpoints only (invariant C). */
export interface WorldState {
  currentZoneId: number | null; // visible zone
  participantCount: number | null; // spec §3 "จำนวนผู้เล่น"; not set by any card yet
  eventId: FestivalEventId | null; // world being shown; null outside SHARED_WORLD_EXPLORE
  zoneCount: number | null; // open zones = growth level (GET /api/zones)
  zoneStatus: ZoneLoadStatus;
  /** ONLY the visible zone's public items, ≤ ZONE_ITEM_CAP. All of them, even those above the tier render cap (Find My, collisions). */
  zoneItems: readonly PublicCreation[];
  /** Creation the camera follows (set by MFW-30 Find My); always rendered even above the tier cap. */
  focusedCreationId: string | null;
  /** Incremented by MFW-30 Find My on every focus request (selecting the same krathong again flies again). Monotonic per world session. */
  focusRequestId: number;
  /** MFW-58: stretch of the endless river the camera is in. Render-time only, never persisted. */
  currentStretchIndex: number;
  /** MFW-58: zone(s) = wrap(anchor.zoneId + s − anchor.stretchIndex) (riverStretches.ts). Null until a zone is chosen. Never persisted. */
  stretchAnchor: StretchAnchor | null;
  /**
   * MFW-58: public items of every streamed zone (the current one included; `zoneItems` is the same array as the current zone's
   * entry), ≤ ZONE_ITEM_CAP each, at most the zones of the load window. Public fields only (invariant C).
   */
  streamedZoneItems: Readonly<Record<number, readonly PublicCreation[]>>;
}

export const NO_ZONE_ITEMS: readonly PublicCreation[] = Object.freeze([]);
export const NO_STREAMED_ZONES: Readonly<Record<number, readonly PublicCreation[]>> = Object.freeze({});

export const INITIAL_WORLD_STATE: Readonly<WorldState> = Object.freeze({
  currentZoneId: null,
  participantCount: null,
  eventId: null,
  zoneCount: null,
  zoneStatus: "idle",
  zoneItems: NO_ZONE_ITEMS,
  focusedCreationId: null,
  focusRequestId: 0,
  currentStretchIndex: 0,
  stretchAnchor: null,
  streamedZoneItems: NO_STREAMED_ZONES,
});

export const useWorldStore = create<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
