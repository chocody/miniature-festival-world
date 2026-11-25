import type { FestivalEventId } from "@/config/events/types";
import { isClientZoneId } from "@/core/world/zoneManager";
import { useWorldStore, type WorldState } from "@/store/useWorldStore";
import { getZonePagination, type WorldStoreLike, type ZoneLoadOutcome } from "./zonePagination";

export type FindMyOutcome = "focused" | "not_found" | "failed" | "superseded" | "invalid";

/** What Find My needs from a device-list entry (structurally a MyCreationEntry). */
export interface FindMyTarget {
  readonly id: string;
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}
export interface FindMyCreationOptions {
  readonly store?: WorldStoreLike; // default useWorldStore
  readonly loadZone?: (zoneId: number) => Promise<ZoneLoadOutcome>; // default looked up at call time
}
export interface FindMyCreation {
  /** Spec section 6.7: load the krathong's zone if needed, then make it the focused creation (the scene flies and highlights). */
  find(target: FindMyTarget): Promise<FindMyOutcome>;
}

export function createFindMyCreation(options: FindMyCreationOptions = {}): FindMyCreation {
  const store: WorldStoreLike = options.store ?? useWorldStore;
  const loadZone = options.loadZone ?? ((zoneId: number) => getZonePagination().loadZone(zoneId));
  let generation = 0;

  return {
    async find(target) {
      const gen = ++generation;
      const s0 = store.getState();
      if (
        s0.eventId === null ||
        s0.eventId !== target.eventId ||
        !isClientZoneId(target.zoneId) ||
        typeof target.id !== "string" ||
        target.id === ""
      ) {
        return "invalid";
      }
      const isShown = (s: WorldState) =>
        s.currentZoneId === target.zoneId && s.zoneStatus === "ready" && s.zoneItems.some((i) => i.id === target.id);

      if (!isShown(s0)) {
        const outcome = await loadZone(target.zoneId);
        if (gen !== generation) return "superseded";
        if (outcome === "superseded") return "superseded";
        if (outcome === "invalid") return "invalid";
        if (outcome === "failed") return "failed";
        const s1 = store.getState();
        if (s1.eventId !== target.eventId || s1.currentZoneId !== target.zoneId) return "superseded";
        if (!isShown(s1)) return "not_found";
      }
      store.setState({ focusedCreationId: target.id, focusRequestId: store.getState().focusRequestId + 1 });
      return "focused";
    },
  };
}

let singleton: FindMyCreation | null = null;

/** App singleton (created on first call). */
export function getFindMyCreation(): FindMyCreation {
  singleton ??= createFindMyCreation();
  return singleton;
}
