import { describe, expect, it, vi } from "vitest";
import { INITIAL_WORLD_STATE, type WorldState } from "@/store/useWorldStore";
import type { PublicCreation } from "./creationTypes";
import {
  createOwnedWishStateReader,
  patchZoneItemWish,
  syncWorldAfterSwitch,
  wishStateOf,
  type FetchZone,
} from "./ownedWishState";
import type { ZoneItemsResult } from "./zoneClient";
import type { WorldStoreLike } from "./zonePagination";

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const ZONE = { eventId: "loy_krathong", zoneId: 2 } as const;

function item(i: number, wish: string | null = null, name: string | null = null): PublicCreation {
  return {
    id: uuid(i),
    eventId: "loy_krathong",
    zoneId: 2,
    appearance: {},
    coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.1, speedFactor: 0.01, lateralOffset: 0 },
    publicWishText: wish,
    createdAt: "2026-11-24T12:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    displayName: wish === null ? null : name,
  } as PublicCreation;
}

function makeStore(patch: Partial<WorldState> = {}) {
  let state: WorldState = { ...INITIAL_WORLD_STATE, ...patch };
  const writes: Partial<WorldState>[] = [];
  const store: WorldStoreLike = {
    getState: () => state,
    setState: (partial) => {
      writes.push(partial);
      state = { ...state, ...partial };
    },
  };
  return { store, writes };
}
const readyStore = (items: readonly PublicCreation[]) =>
  makeStore({ eventId: "loy_krathong", currentZoneId: 2, zoneStatus: "ready", zoneItems: Object.freeze([...items]) });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const ok = (items: readonly PublicCreation[]): ZoneItemsResult => ({ ok: true, items });

describe("wishStateOf", () => {
  it("open / closed / absent → closed", () => {
    const items = [item(1, "wish"), item(2)];
    expect(wishStateOf(items, uuid(1))).toBe("open");
    expect(wishStateOf(items, uuid(2))).toBe("closed");
    expect(wishStateOf(items, uuid(9))).toBe("closed");
  });
});

describe("owned wish state reader", () => {
  it("reads from a ready store that lists the item, without a request", async () => {
    const { store } = readyStore([item(1, "wish")]);
    const fetchZone = vi.fn<FetchZone>();
    const reader = createOwnedWishStateReader({ store, fetchZone });
    expect(await reader.read(uuid(1), ZONE)).toBe("open");
    expect(fetchZone).not.toHaveBeenCalled();
  });

  it("fetches when the store shows another zone or lacks the item", async () => {
    const other = makeStore({ eventId: "loy_krathong", currentZoneId: 1, zoneStatus: "ready", zoneItems: [item(1, "wish")] });
    const fetchZone = vi.fn<FetchZone>(async () => ok([item(1)]));
    expect(await createOwnedWishStateReader({ store: other.store, fetchZone }).read(uuid(1), ZONE)).toBe("closed");
    expect(fetchZone).toHaveBeenCalledTimes(1);
    expect(fetchZone).toHaveBeenCalledWith("loy_krathong", 2);

    const lacking = readyStore([item(5)]);
    const fetch2 = vi.fn<FetchZone>(async () => ok([item(1, "wish")]));
    expect(await createOwnedWishStateReader({ store: lacking.store, fetchZone: fetch2 }).read(uuid(1), ZONE)).toBe("open");
    expect(fetch2).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent reads of one zone and does not cache results", async () => {
    const { store } = makeStore();
    const d = deferred<ZoneItemsResult>();
    const fetchZone = vi.fn<FetchZone>(() => d.promise);
    const reader = createOwnedWishStateReader({ store, fetchZone });
    const a = reader.read(uuid(1), ZONE);
    const b = reader.read(uuid(2), ZONE);
    d.resolve(ok([item(1, "wish"), item(2)]));
    expect(await a).toBe("open");
    expect(await b).toBe("closed");
    expect(fetchZone).toHaveBeenCalledTimes(1);
    fetchZone.mockImplementation(async () => ok([item(1)]));
    expect(await reader.read(uuid(1), ZONE)).toBe("closed");
    expect(fetchZone).toHaveBeenCalledTimes(2);
  });

  it("failures and bad input → unknown", async () => {
    const { store } = makeStore();
    expect(
      await createOwnedWishStateReader({ store, fetchZone: async () => ({ ok: false, reason: "http" }) }).read(uuid(1), ZONE),
    ).toBe("unknown");
    expect(
      await createOwnedWishStateReader({ store, fetchZone: async () => Promise.reject(new Error("x")) }).read(uuid(1), ZONE),
    ).toBe("unknown");
    expect(
      await createOwnedWishStateReader({
        store,
        fetchZone: () => {
          throw new Error("sync");
        },
      }).read(uuid(1), ZONE),
    ).toBe("unknown");
    const fetchZone = vi.fn<FetchZone>();
    expect(await createOwnedWishStateReader({ store, fetchZone }).read("", ZONE)).toBe("unknown");
    expect(fetchZone).not.toHaveBeenCalled();
  });
});

describe("patchZoneItemWish", () => {
  it("replaces only that item; others keep their references and order; the array is frozen", () => {
    const items = [item(1, "a", "n"), item(2), item(3, "c")];
    const { store, writes } = readyStore(items);
    const before = store.getState().zoneItems;
    expect(patchZoneItemWish(store, uuid(2), { publicWishText: "open now", displayName: "Mali" })).toBe(true);
    const after = store.getState().zoneItems;
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
    expect(after.map((c) => c.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).toEqual({ ...before[1], publicWishText: "open now", displayName: "Mali" });
    expect(writes.every((w) => Object.keys(w).join() === "zoneItems")).toBe(true);
  });

  it("unknown id or equal values → false and no write", () => {
    const { store, writes } = readyStore([item(1, "a", "n")]);
    expect(patchZoneItemWish(store, uuid(9), { publicWishText: null, displayName: null })).toBe(false);
    expect(patchZoneItemWish(store, uuid(1), { publicWishText: "a", displayName: "n" })).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("a null wish forces a null name", () => {
    const { store } = readyStore([item(1, "a", "n")]);
    expect(patchZoneItemWish(store, uuid(1), { publicWishText: null, displayName: "n" })).toBe(true);
    expect(store.getState().zoneItems[0]).toMatchObject({ publicWishText: null, displayName: null });
  });

  it("MFW-58: also replaces the current zone's streamed entry with the same new frozen array; other zones keep theirs", () => {
    const items = Object.freeze([item(1), item(2)]);
    const other = Object.freeze([item(7)]);
    const { store } = makeStore({
      eventId: "loy_krathong",
      currentZoneId: 2,
      zoneStatus: "ready",
      zoneItems: items,
      streamedZoneItems: Object.freeze({ 2: items, 3: other }),
    });
    expect(patchZoneItemWish(store, uuid(2), { publicWishText: "open", displayName: "Mali" })).toBe(true);
    const s = store.getState();
    expect(s.streamedZoneItems[2]).toBe(s.zoneItems);
    expect(s.streamedZoneItems[3]).toBe(other);
    expect(Object.isFrozen(s.streamedZoneItems)).toBe(true);
    expect(s.zoneItems[1]).toMatchObject({ publicWishText: "open", displayName: "Mali" });
  });
});

describe("syncWorldAfterSwitch", () => {
  const noPrivateKeys = (store: WorldStoreLike) => {
    for (const c of store.getState().zoneItems) {
      for (const key of Object.keys(c)) expect(key).not.toMatch(/ownerToken|privateWish/i);
    }
  };

  it("close → patched to null/null without a request", async () => {
    const { store, writes } = readyStore([item(1, "a", "n")]);
    const fetchZone = vi.fn<FetchZone>();
    await syncWorldAfterSwitch(uuid(1), false, { store, fetchZone });
    expect(fetchZone).not.toHaveBeenCalled();
    expect(store.getState().zoneItems[0]).toMatchObject({ publicWishText: null, displayName: null });
    expect(writes.every((w) => Object.keys(w).join() === "zoneItems")).toBe(true);
    noPrivateKeys(store);
  });

  it("open → re-reads the visible zone and patches the fresh values", async () => {
    const { store, writes } = readyStore([item(1), item(2)]);
    const other = store.getState().zoneItems[1];
    const fetchZone = vi.fn<FetchZone>(async () => ok([item(1, "fresh", "Mali"), item(2, "changed")]));
    await syncWorldAfterSwitch(uuid(1), true, { store, fetchZone });
    expect(fetchZone).toHaveBeenCalledWith("loy_krathong", 2);
    expect(store.getState().zoneItems[0]).toMatchObject({ publicWishText: "fresh", displayName: "Mali" });
    expect(store.getState().zoneItems[1]).toBe(other);
    expect(writes.every((w) => Object.keys(w).join() === "zoneItems")).toBe(true);
    noPrivateKeys(store);
  });

  it("zone changed while fetching → no patch", async () => {
    const { store, writes } = readyStore([item(1)]);
    const d = deferred<ZoneItemsResult>();
    const pending = syncWorldAfterSwitch(uuid(1), true, { store, fetchZone: () => d.promise });
    store.setState({ currentZoneId: 3 });
    writes.length = 0;
    d.resolve(ok([item(1, "fresh")]));
    await pending;
    expect(writes).toHaveLength(0);
  });

  it("item not visible → nothing, no request; failures never throw or change anything", async () => {
    const { store, writes } = readyStore([item(5)]);
    const fetchZone = vi.fn<FetchZone>();
    await syncWorldAfterSwitch(uuid(1), true, { store, fetchZone });
    await syncWorldAfterSwitch(uuid(1), false, { store, fetchZone });
    expect(fetchZone).not.toHaveBeenCalled();
    const visible = readyStore([item(1)]);
    await expect(
      syncWorldAfterSwitch(uuid(1), true, { store: visible.store, fetchZone: async () => Promise.reject(new Error("x")) }),
    ).resolves.toBeUndefined();
    await syncWorldAfterSwitch(uuid(1), true, { store: visible.store, fetchZone: async () => ({ ok: false, reason: "network" }) });
    expect(visible.writes).toHaveLength(0);
    expect(writes).toHaveLength(0);
    const empty = makeStore();
    await expect(syncWorldAfterSwitch(uuid(1), true, { store: empty.store, fetchZone })).resolves.toBeUndefined();
  });
});
