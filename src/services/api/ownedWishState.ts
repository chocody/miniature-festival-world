// MFW-63 (backlog 12.2): the owner switch state, read from PUBLIC data only (no token, no device storage), and the
// "shows at once" patch of the visible zone after a switch. Writes only the world store's zoneItems.
import type { FestivalEventId } from "@/config/events/types";
import { useWorldStore } from "@/store/useWorldStore";
import type { PublicCreation } from "./creationTypes";
import { fetchZoneItems, type ZoneItemsResult } from "./zoneClient";
import type { WorldStoreLike } from "./zonePagination";

export type OwnedWishState = "open" | "closed" | "unknown";
export interface OwnedWishZone {
  readonly eventId: FestivalEventId;
  readonly zoneId: number;
}
export type FetchZone = (eventId: FestivalEventId, zoneId: number) => Promise<ZoneItemsResult>;
export interface OwnedWishDeps {
  readonly store?: WorldStoreLike; // default useWorldStore
  readonly fetchZone?: FetchZone; // default (e, z) => fetchZoneItems(e, z)
}
export interface OwnedWishStateReader {
  /** Never throws. */
  read(creationId: string, zone: OwnedWishZone): Promise<OwnedWishState>;
}

const defaultFetchZone: FetchZone = (eventId, zoneId) => fetchZoneItems(eventId, zoneId);

function indexOfItem(items: readonly PublicCreation[], creationId: string): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === creationId) return i;
  }
  return -1;
}

/** Found → open iff it has a public wish. Not found → "closed": the public list omits hidden rows (nobody sees it). */
export function wishStateOf(items: readonly PublicCreation[], creationId: string): "open" | "closed" {
  const i = indexOfItem(items, creationId);
  if (i === -1) return "closed";
  return items[i].publicWishText !== null ? "open" : "closed";
}

export function createOwnedWishStateReader(deps: OwnedWishDeps = {}): OwnedWishStateReader {
  const store: WorldStoreLike = deps.store ?? useWorldStore;
  const fetchZone = deps.fetchZone ?? defaultFetchZone;
  // In-flight de-duplication only (no result cache): the entry is removed when the request settles.
  const inFlight = new Map<string, Promise<ZoneItemsResult>>();

  function fetchOnce(zone: OwnedWishZone): Promise<ZoneItemsResult> {
    const key = `${zone.eventId}:${zone.zoneId}`;
    const existing = inFlight.get(key);
    if (existing !== undefined) return existing;
    let request: Promise<ZoneItemsResult>;
    try {
      request = Promise.resolve(fetchZone(zone.eventId, zone.zoneId));
    } catch (error) {
      request = Promise.reject(error);
    }
    const settled = request.finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, settled);
    return settled;
  }

  return {
    async read(creationId, zone) {
      if (typeof creationId !== "string" || creationId === "") return "unknown";
      try {
        const s = store.getState();
        if (
          s.eventId === zone.eventId &&
          s.currentZoneId === zone.zoneId &&
          s.zoneStatus === "ready" &&
          indexOfItem(s.zoneItems, creationId) !== -1
        ) {
          return wishStateOf(s.zoneItems, creationId);
        }
        // Absence from an older snapshot is not trusted: the krathong saved this session may not be in it yet.
        const result = await fetchOnce(zone);
        return result.ok ? wishStateOf(result.items, creationId) : "unknown";
      } catch {
        return "unknown";
      }
    },
  };
}

let shared: OwnedWishStateReader | null = null;
/** Lazy singleton used by OwnerWishControls. */
export function getOwnedWishStateReader(): OwnedWishStateReader {
  shared ??= createOwnedWishStateReader();
  return shared;
}

/** Replaces ONLY the wish fields of one visible zone item. Returns true when the store changed. */
export function patchZoneItemWish(
  store: WorldStoreLike,
  creationId: string,
  wish: { readonly publicWishText: string | null; readonly displayName: string | null },
): boolean {
  const items = store.getState().zoneItems;
  const i = indexOfItem(items, creationId);
  if (i === -1) return false;
  const publicWishText = wish.publicWishText;
  const displayName = publicWishText === null ? null : wish.displayName; // never a name without an open wish
  const item = items[i];
  if (item.publicWishText === publicWishText && item.displayName === displayName) return false;
  const copy = items.slice();
  copy[i] = { ...item, publicWishText, displayName };
  store.setState({ zoneItems: Object.freeze(copy) });
  return true;
}

/** After a successful switch: make the visible zone show the new state at once. Never throws. */
export async function syncWorldAfterSwitch(creationId: string, open: boolean, deps: OwnedWishDeps = {}): Promise<void> {
  try {
    const store: WorldStoreLike = deps.store ?? useWorldStore;
    const fetchZone = deps.fetchZone ?? defaultFetchZone;
    const s = store.getState();
    const eventId = s.eventId;
    const zoneId = s.currentZoneId;
    if (eventId === null || zoneId === null || indexOfItem(s.zoneItems, creationId) === -1) return;
    if (!open) {
      patchZoneItemWish(store, creationId, { publicWishText: null, displayName: null });
      return;
    }
    const result = await fetchZone(eventId, zoneId);
    if (!result.ok) return;
    const now = store.getState();
    if (now.eventId !== eventId || now.currentZoneId !== zoneId) return;
    const i = indexOfItem(result.items, creationId);
    if (i === -1) return;
    const fresh = result.items[i];
    patchZoneItemWish(store, creationId, { publicWishText: fresh.publicWishText, displayName: fresh.displayName });
  } catch {
    /* no change */
  }
}
