import type { FestivalEventId } from "@/config/events/types";
import { FESTIVAL_EVENT_IDS } from "@/config/events/types";
import { WORLD_INITIAL_ZONE_POLICY, ZONE_ID_MIN, type InitialZonePolicy } from "@/config/world.config";
import {
  LINEAR_ZONE_ANCHOR,
  ZONE_TOPOLOGIES,
  clampLinearZone,
  linearStreamedZoneIds,
  linearZoneCount,
  streamedZoneIds,
  zoneIdForStretch,
  type ZoneTopology,
} from "@/core/world/riverStretches";
import { isClientZoneId, pickInitialZoneId } from "@/core/world/zoneManager";
import { INITIAL_WORLD_STATE, NO_STREAMED_ZONES, NO_ZONE_ITEMS, useWorldStore, type WorldState } from "@/store/useWorldStore";
import type { PublicCreation } from "./creationTypes";
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
  /** MFW-99: default "ring" (Loy endless river). "linear": tree bands, band = zone id, no wrap. */
  readonly topology?: ZoneTopology;
}

export type TravelDirection = -1 | 1;

export interface ZonePagination {
  enterWorld(eventId: FestivalEventId): Promise<ZoneLoadOutcome>;
  /**
   * Make `zoneId` the visible zone: drop the old items, load this zone (spec §6.7 "await loadZone(zoneId)"). MFW-58: the CURRENT
   * stretch now shows it (the zone↔stretch anchor moves to the camera), so Find My and release always stay local.
   * MFW-99 "linear": the band becomes `zoneId` (identity anchor, no wrap).
   */
  loadZone(zoneId: number): Promise<ZoneLoadOutcome>;
  retry(): Promise<ZoneLoadOutcome>;
  leaveWorld(): void;
  /** MFW-58: the camera is now in stretch `stretchIndex`. Never clears focusedCreationId. MFW-99 "linear": clamps into [1, zoneCount]; a no-op before a zone is chosen. */
  setCurrentStretch(stretchIndex: number): void;
  /** MFW-58: one stretch up- or downstream: the registered travel driver (3D camera flight) if any, else setCurrentStretch(S ± 1), e.g. while the scene chunk loads. MFW-99 "linear": a no-op past either end (the driver is not called). */
  jumpBy(delta: TravelDirection): void;
  /** MFW-58: the 3D scene drives jumps by flying the camera. The returned unregister clears it only if it is still the same driver. */
  registerTravelDriver(driver: (delta: TravelDirection) => void): () => void;
  /** MFW-58: stretches on each side whose zones stay loaded (ZONE_STREAM_LOAD_RADIUS while the scene is mounted, else 0). Safe integer ≥ 0, else ignored. */
  setStreamRadius(radius: number): void;
}

type StreamedZones = Readonly<Record<number, readonly PublicCreation[]>>;

function withoutZone(map: StreamedZones, zoneId: number): StreamedZones {
  if (!(zoneId in map)) return map;
  const next: Record<number, readonly PublicCreation[]> = { ...map };
  delete next[zoneId];
  return Object.freeze(next);
}

function withZone(map: StreamedZones, zoneId: number, items: readonly PublicCreation[]): StreamedZones {
  return Object.freeze({ ...map, [zoneId]: items });
}

export function createZonePagination(options: ZonePaginationOptions = {}): ZonePagination {
  const store: WorldStoreLike = options.store ?? useWorldStore;
  const policy = options.initialZonePolicy ?? WORLD_INITIAL_ZONE_POLICY;
  const topology: ZoneTopology = options.topology ?? "ring";
  if (!(ZONE_TOPOLOGIES as readonly string[]).includes(topology)) throw new RangeError("unknown zone topology");
  const linear = topology === "linear";
  const fetchImpl = options.fetch;
  let generation = 0;
  let controller: AbortController | null = null;
  /** MFW-58: zone of the running loadZone fetch (it counts as in flight for the stream), or null. */
  let mainZoneInFlight: number | null = null;
  /** MFW-58: one fetch per streamed zone that is not the loadZone fetch. */
  const streams = new Map<number, AbortController>();
  let streamRadius = 0;
  let travelDriver: ((delta: TravelDirection) => void) | null = null;
  let directoryController: AbortController | null = null;

  function abortStreams(): void {
    for (const c of streams.values()) c.abort();
    streams.clear();
    directoryController?.abort();
    directoryController = null;
  }

  function begin(): { gen: number; signal: AbortSignal } {
    controller?.abort();
    const next = new AbortController();
    controller = next;
    generation += 1;
    return { gen: generation, signal: next.signal };
  }

  function wantedZoneIds(s: WorldState): readonly number[] {
    if (s.stretchAnchor === null) return [];
    if (linear) return linearStreamedZoneIds(s.currentStretchIndex, s.zoneCount, streamRadius);
    return streamedZoneIds(s.currentStretchIndex, s.stretchAnchor, s.zoneCount, streamRadius);
  }

  function isStreamed(s: WorldState, zoneId: number): boolean {
    return s.stretchAnchor !== null && wantedZoneIds(s).includes(zoneId);
  }

  /** Writes a fetched zone: its streamed entry, and zoneItems + "ready" when it is the zone under the camera. */
  function writeZone(s: WorldState, zoneId: number, items: readonly PublicCreation[]): void {
    const next: Partial<WorldState> = { streamedZoneItems: withZone(s.streamedZoneItems, zoneId, items) };
    if (s.currentZoneId === zoneId) {
      next.zoneItems = items;
      next.zoneStatus = "ready";
    }
    store.setState(next);
  }

  /** Keeps exactly the zones of stretches S−r..S+r: drops (and aborts) the others, fetches the missing ones. */
  function syncStream(): void {
    const s = store.getState();
    const eventId = s.eventId;
    if (eventId === null || s.stretchAnchor === null) return;
    const wanted = wantedZoneIds(s);
    let streamed = s.streamedZoneItems;
    for (const key of Object.keys(streamed)) {
      const zoneId = Number(key);
      if (!wanted.includes(zoneId)) streamed = withoutZone(streamed, zoneId); // invariant E: far zones are dropped
    }
    if (streamed !== s.streamedZoneItems) store.setState({ streamedZoneItems: streamed });
    for (const [zoneId, c] of streams) {
      if (!wanted.includes(zoneId)) {
        c.abort();
        streams.delete(zoneId);
      }
    }
    for (const zoneId of wanted) {
      if (zoneId in streamed || streams.has(zoneId) || mainZoneInFlight === zoneId) continue;
      const c = new AbortController();
      streams.set(zoneId, c);
      void fetchZoneItems(eventId, zoneId, { fetch: fetchImpl, signal: c.signal }).then((zone) => {
        if (streams.get(zoneId) !== c) return; // aborted or replaced
        streams.delete(zoneId);
        const now = store.getState();
        if (now.eventId !== eventId || !isStreamed(now, zoneId)) return;
        if (!zone.ok) {
          if (now.currentZoneId === zoneId) store.setState({ zoneStatus: "error" }); // a neighbour failure is retried by the next sync
          return;
        }
        writeZone(now, zoneId, zone.items);
      });
    }
  }

  async function loadZoneInternal(zoneId: number, refreshDirectory: boolean): Promise<ZoneLoadOutcome> {
    const { eventId, currentStretchIndex, streamedZoneItems } = store.getState();
    const stretch = linear ? zoneId : currentStretchIndex;
    if (eventId === null || !isClientZoneId(zoneId)) return "invalid";
    const { gen, signal } = begin();
    streams.get(zoneId)?.abort(); // the zone is fetched fresh below
    streams.delete(zoneId);
    mainZoneInFlight = zoneId;
    // Release the old zone first (invariant E): the previous items are dropped before the new request resolves.
    store.setState({
      ...(linear ? { currentStretchIndex: zoneId } : {}),
      stretchAnchor: linear ? LINEAR_ZONE_ANCHOR : Object.freeze({ stretchIndex: stretch, zoneId }),
      currentZoneId: zoneId,
      zoneStatus: "loading",
      zoneItems: NO_ZONE_ITEMS,
      focusedCreationId: null,
      streamedZoneItems: withoutZone(streamedZoneItems, zoneId),
    });
    const fetchOptions = { fetch: fetchImpl, signal };
    const [zone, dir] = await Promise.all([
      fetchZoneItems(eventId, zoneId, fetchOptions),
      refreshDirectory ? fetchZoneDirectory(eventId, fetchOptions) : Promise.resolve(null),
    ]);
    if (gen !== generation) return "superseded";
    mainZoneInFlight = null;
    const s = store.getState();
    if (s.currentStretchIndex !== stretch) {
      // The camera moved on before the reply: keep the items while the zone is still streamed; the caller's request is stale.
      if (zone.ok && isStreamed(s, zoneId)) writeZone(s, zoneId, zone.items);
      syncStream();
      return "superseded";
    }
    if (!zone.ok) {
      store.setState({ zoneStatus: "error" });
      return "failed";
    }
    const knownCount = dir !== null && dir.ok ? dir.zoneCount : (s.zoneCount ?? ZONE_ID_MIN);
    const zoneCount = Math.max(knownCount, zone.items.length > 0 ? zoneId : ZONE_ID_MIN);
    store.setState({
      zoneItems: zone.items,
      zoneStatus: "ready",
      zoneCount,
      streamedZoneItems: withZone(s.streamedZoneItems, zoneId, zone.items),
    });
    syncStream();
    return "loaded";
  }

  async function enterWorld(eventId: FestivalEventId): Promise<ZoneLoadOutcome> {
    if (!(FESTIVAL_EVENT_IDS as readonly string[]).includes(eventId)) return "invalid";
    const { gen, signal } = begin();
    abortStreams();
    mainZoneInFlight = null;
    store.setState({
      eventId,
      zoneCount: null,
      currentZoneId: null,
      zoneStatus: "loading",
      zoneItems: NO_ZONE_ITEMS,
      focusedCreationId: null,
      currentStretchIndex: 0,
      stretchAnchor: null,
      streamedZoneItems: NO_STREAMED_ZONES,
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

  /** One directory refresh per stretch change (a newer change supersedes it). A changed count re-anchors at the camera. */
  function refreshDirectoryAfterStretchChange(eventId: FestivalEventId): void {
    directoryController?.abort();
    const c = new AbortController();
    directoryController = c;
    void fetchZoneDirectory(eventId, { fetch: fetchImpl, signal: c.signal }).then((dir) => {
      if (directoryController !== c) return;
      directoryController = null;
      const s = store.getState();
      if (!dir.ok || s.eventId !== eventId || s.currentZoneId === null || dir.zoneCount === s.zoneCount) return;
      if (linear) {
        store.setState({ zoneCount: dir.zoneCount }); // the band and its identity anchor never move
        syncStream();
        return;
      }
      // The zone under the camera never changes: the anchor moves to the current stretch with the new count.
      store.setState({
        zoneCount: dir.zoneCount,
        stretchAnchor: Object.freeze({ stretchIndex: s.currentStretchIndex, zoneId: s.currentZoneId }),
      });
      syncStream();
    });
  }

  function setCurrentStretch(requested: number): void {
    if (!Number.isSafeInteger(requested)) return;
    const s = store.getState();
    if (linear && (s.eventId === null || s.stretchAnchor === null)) return;
    const stretchIndex = linear ? clampLinearZone(requested, linearZoneCount(s.zoneCount, s.currentStretchIndex)) : requested;
    if (stretchIndex === s.currentStretchIndex) return;
    if (s.eventId === null || s.stretchAnchor === null) {
      store.setState({ currentStretchIndex: stretchIndex });
      return;
    }
    const zoneId = linear ? stretchIndex : (zoneIdForStretch(stretchIndex, s.stretchAnchor, s.zoneCount) as number);
    const cached = s.streamedZoneItems[zoneId];
    store.setState({
      currentStretchIndex: stretchIndex,
      currentZoneId: zoneId,
      zoneItems: cached ?? NO_ZONE_ITEMS,
      zoneStatus: cached !== undefined ? "ready" : "loading",
    });
    refreshDirectoryAfterStretchChange(s.eventId);
    syncStream();
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
      abortStreams();
      mainZoneInFlight = null;
      generation += 1;
      store.setState({ ...INITIAL_WORLD_STATE });
    },
    setCurrentStretch,
    jumpBy(delta) {
      if (delta !== -1 && delta !== 1) return;
      if (linear) {
        const s = store.getState();
        if (s.eventId === null || s.stretchAnchor === null) return;
        const target = s.currentStretchIndex + delta;
        if (target < ZONE_ID_MIN || target > linearZoneCount(s.zoneCount, s.currentStretchIndex)) return;
      }
      if (travelDriver !== null) {
        travelDriver(delta);
        return;
      }
      setCurrentStretch(store.getState().currentStretchIndex + delta);
    },
    registerTravelDriver(driver) {
      travelDriver = driver;
      return () => {
        if (travelDriver === driver) travelDriver = null;
      };
    },
    setStreamRadius(radius) {
      if (!Number.isSafeInteger(radius) || radius < 0) return;
      streamRadius = radius;
      syncStream();
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
