import type { FestivalEventId } from "@/config/events/types";
import { FESTIVAL_EVENT_IDS } from "@/config/events/types";
import { WORLD_INITIAL_ZONE_POLICY, ZONE_ID_MIN, type InitialZonePolicy } from "@/config/world.config";
import { isClientZoneId, pickInitialZoneId } from "@/core/world/zoneManager";
import { INITIAL_WORLD_STATE, NO_ZONE_ITEMS, useWorldStore, type WorldState } from "@/store/useWorldStore";
import { fetchZoneDirectory, fetchZoneItems } from "./zoneClient";

export type ZoneLoadOutcome = "loaded" | "failed" | "superseded" | "invalid";

export interface WorldStoreLike {
  getState(): WorldState;
  setState(partial: Partial<WorldState>): void;
}

export interface ZonePaginationOptions {
  readonly fetch?: typeof fetch;
  readonly store?: WorldStoreLike; // default useWorldStore
  readonly initialZonePolicy?: InitialZonePolicy; // default WORLD_INITIAL_ZONE_POLICY
}

export interface ZonePagination {
  enterWorld(eventId: FestivalEventId): Promise<ZoneLoadOutcome>;
  /** Make `zoneId` the visible zone: drop the old items, load only this zone (spec §6.7 "await loadZone(zoneId)"). */
  loadZone(zoneId: number): Promise<ZoneLoadOutcome>;
  retry(): Promise<ZoneLoadOutcome>;
  leaveWorld(): void;
}

export function createZonePagination(options: ZonePaginationOptions = {}): ZonePagination {
  const store: WorldStoreLike = options.store ?? useWorldStore;
  const policy = options.initialZonePolicy ?? WORLD_INITIAL_ZONE_POLICY;
  const fetchImpl = options.fetch;
  let generation = 0;
  let controller: AbortController | null = null;

  function begin(): { gen: number; signal: AbortSignal } {
    controller?.abort();
    const next = new AbortController();
    controller = next;
    generation += 1;
    return { gen: generation, signal: next.signal };
  }

  async function loadZoneInternal(zoneId: number, refreshDirectory: boolean): Promise<ZoneLoadOutcome> {
    const { eventId } = store.getState();
    if (eventId === null || !isClientZoneId(zoneId)) return "invalid";
    const { gen, signal } = begin();
    // Release the old zone first (invariant E): the previous items are dropped before the new request resolves.
    store.setState({ currentZoneId: zoneId, zoneStatus: "loading", zoneItems: NO_ZONE_ITEMS, focusedCreationId: null });
    const fetchOptions = { fetch: fetchImpl, signal };
    const [zone, dir] = await Promise.all([
      fetchZoneItems(eventId, zoneId, fetchOptions),
      refreshDirectory ? fetchZoneDirectory(eventId, fetchOptions) : Promise.resolve(null),
    ]);
    if (gen !== generation) return "superseded";
    if (!zone.ok) {
      store.setState({ zoneStatus: "error" });
      return "failed";
    }
    const knownCount = dir !== null && dir.ok ? dir.zoneCount : (store.getState().zoneCount ?? ZONE_ID_MIN);
    const zoneCount = Math.max(knownCount, zone.items.length > 0 ? zoneId : ZONE_ID_MIN);
    store.setState({ zoneItems: zone.items, zoneStatus: "ready", zoneCount });
    return "loaded";
  }

  async function enterWorld(eventId: FestivalEventId): Promise<ZoneLoadOutcome> {
    if (!(FESTIVAL_EVENT_IDS as readonly string[]).includes(eventId)) return "invalid";
    const { gen, signal } = begin();
    store.setState({
      eventId,
      zoneCount: null,
      currentZoneId: null,
      zoneStatus: "loading",
      zoneItems: NO_ZONE_ITEMS,
      focusedCreationId: null,
    });
    const dir = await fetchZoneDirectory(eventId, { fetch: fetchImpl, signal });
    if (gen !== generation) return "superseded";
    if (!dir.ok) {
      store.setState({ zoneStatus: "error" });
      return "failed";
    }
    store.setState({ zoneCount: dir.zoneCount });
    return loadZoneInternal(pickInitialZoneId(dir.zoneCount, policy), false);
  }

  return {
    enterWorld,
    loadZone: (zoneId) => loadZoneInternal(zoneId, true),
    async retry() {
      const { zoneStatus, eventId, currentZoneId } = store.getState();
      if (zoneStatus !== "error" || eventId === null) return "invalid";
      return currentZoneId === null ? enterWorld(eventId) : loadZoneInternal(currentZoneId, true);
    },
    leaveWorld() {
      controller?.abort();
      controller = null;
      generation += 1;
      store.setState({ ...INITIAL_WORLD_STATE });
    },
  };
}

let singleton: ZonePagination | null = null;

/** App singleton (useWorldStore + global fetch), created on first call. */
export function getZonePagination(): ZonePagination {
  singleton ??= createZonePagination();
  return singleton;
}

export function loadZone(zoneId: number): Promise<ZoneLoadOutcome> {
  return getZonePagination().loadZone(zoneId);
}
