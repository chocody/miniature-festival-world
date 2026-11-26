import { createStore } from "zustand/vanilla";
import { describe, expect, it, vi } from "vitest";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { INITIAL_WORLD_STATE, useWorldStore, type WorldState } from "@/store/useWorldStore";
import { createZonePagination, getZonePagination, loadZone } from "./zonePagination";

const EVENT = "loy_krathong";
const uuid = (zone: number, i: number) => `00000000-0000-4000-8000-${String(zone * 1000 + i).padStart(12, "0")}`;
const item = (zone: number, i: number) => ({
  id: uuid(zone, i),
  eventId: EVENT,
  zoneId: zone,
  appearance: { base: "banana_trunk_01" },
  coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.1, speedFactor: 0.008, lateralOffset: 0 },
  publicWishText: null,
  createdAt: "2026-11-24T12:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
});

interface Call {
  url: string;
  signal: AbortSignal | undefined;
}
/** Routed fetch fake: zones resolve immediately unless deferred. */
function makeFetch(opts: { zoneCount?: number | "fail"; sizes?: Record<number, number | "fail"> } = {}) {
  const calls: Call[] = [];
  const deferred = new Map<number, () => void>();
  const gates = new Set<number>();
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, signal: init?.signal ?? undefined });
    const u = new URL(url, "http://localhost");
    if (u.pathname === "/api/zones") {
      if (opts.zoneCount === "fail") return new Response("x", { status: 503 });
      return Response.json({ eventId: EVENT, zoneCount: opts.zoneCount ?? 1 });
    }
    const zone = Number(u.searchParams.get("zone"));
    if (gates.has(zone)) await new Promise<void>((resolve) => deferred.set(zone, resolve));
    const size = opts.sizes?.[zone] ?? 0;
    if (size === "fail") return new Response("x", { status: 503 });
    return Response.json({ eventId: EVENT, zoneId: zone, limit: 80, items: Array.from({ length: size }, (_, i) => item(zone, i + 1)) });
  });
  return {
    impl: impl as unknown as typeof fetch,
    calls,
    urls: () => calls.map((c) => c.url),
    gate: (zone: number) => void gates.add(zone),
    release: (zone: number) => {
      gates.delete(zone);
      deferred.get(zone)?.();
    },
  };
}
const fakeStore = () => createStore<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("zonePagination", () => {
  it("enter loads exactly one zone", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 3: 4 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    expect(await p.enterWorld(EVENT)).toBe("loaded");
    expect(f.urls()).toEqual(["/api/zones?event=loy_krathong", "/api/creations?event=loy_krathong&zone=3"]);
    const s = store.getState();
    expect(s).toMatchObject({ eventId: EVENT, currentZoneId: 3, zoneCount: 3, zoneStatus: "ready" });
    expect(s.zoneItems).toHaveLength(4);
  });

  it("FIRST policy starts at zone 1", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1 } });
    const store = fakeStore();
    await createZonePagination({ fetch: f.impl, store, initialZonePolicy: "FIRST" }).enterWorld(EVENT);
    expect(f.urls()).toEqual(["/api/zones?event=loy_krathong", "/api/creations?event=loy_krathong&zone=1"]);
    expect(store.getState().currentZoneId).toBe(1);
  });

  it("loadZone fetches only that zone (plus a directory refresh)", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 3: 1, 2: 2 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    f.calls.length = 0;
    expect(await p.loadZone(2)).toBe("loaded");
    expect(f.urls().sort()).toEqual(["/api/creations?event=loy_krathong&zone=2", "/api/zones?event=loy_krathong"]);
    expect(store.getState().zoneItems).toHaveLength(2);
  });

  it("switch releases the old zone first", async () => {
    const f = makeFetch({ zoneCount: 2, sizes: { 1: 1, 2: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    store.setState({ focusedCreationId: "x" });
    f.gate(1);
    const pending = p.loadZone(1);
    await flush();
    expect(store.getState()).toMatchObject({ currentZoneId: 1, zoneStatus: "loading", zoneItems: [], focusedCreationId: null });
    f.release(1);
    await pending;
  });

  it("switch aborts and ignores the previous zone", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 2, 2: 5, 3: 1 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    f.gate(2);
    const slow = p.loadZone(2);
    await flush();
    const slowCall = f.calls.find((c) => c.url.endsWith("zone=2"))!;
    const fast = p.loadZone(1);
    expect(slowCall.signal?.aborted).toBe(true);
    expect(await fast).toBe("loaded");
    f.release(2);
    expect(await slow).toBe("superseded");
    expect(store.getState().currentZoneId).toBe(1);
    expect(store.getState().zoneItems.every((i) => i.zoneId === 1)).toBe(true);
    expect(store.getState().zoneItems).toHaveLength(2);
  });

  it("store never holds more than 80", async () => {
    const f = makeFetch({ zoneCount: 1, sizes: { 1: 85 } });
    const store = fakeStore();
    await createZonePagination({ fetch: f.impl, store }).enterWorld(EVENT);
    expect(store.getState().zoneItems.length).toBeLessThanOrEqual(ZONE_ITEM_CAP);
    expect(store.getState().zoneItems).toHaveLength(80);
  });

  it("store only ever holds the visible zone's items", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 2, 2: 3, 3: 4 } });
    const store = fakeStore();
    const snapshots: WorldState[] = [];
    store.subscribe((s) => snapshots.push(s));
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    await p.loadZone(2);
    await p.loadZone(1);
    expect(snapshots.length).toBeGreaterThan(0);
    for (const s of snapshots) {
      expect(s.zoneItems.every((i) => i.zoneId === s.currentZoneId)).toBe(true);
    }
  });

  it("grows the zone count from the directory or from a non-empty zone beyond it", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 3: 1 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    expect(store.getState().zoneCount).toBe(3);

    const g = makeFetch({ zoneCount: 2, sizes: { 2: 1, 4: 1 } });
    const store2 = fakeStore();
    const p2 = createZonePagination({ fetch: g.impl, store: store2 });
    await p2.enterWorld(EVENT);
    // the directory now fails; a non-empty zone 4 still raises the count
    const h = makeFetch({ zoneCount: "fail", sizes: { 4: 1 } });
    const p3 = createZonePagination({ fetch: h.impl, store: store2 });
    await p3.loadZone(4);
    expect(store2.getState().zoneCount).toBe(4);
  });

  it("reports errors and retries", async () => {
    const dirFail = makeFetch({ zoneCount: "fail" });
    const store = fakeStore();
    const p = createZonePagination({ fetch: dirFail.impl, store });
    expect(await p.enterWorld(EVENT)).toBe("failed");
    expect(store.getState().zoneStatus).toBe("error");
    expect(await p.retry()).toBe("failed");

    const zoneFail = makeFetch({ zoneCount: 2, sizes: { 2: "fail" } });
    const store2 = fakeStore();
    const p2 = createZonePagination({ fetch: zoneFail.impl, store: store2 });
    expect(await p2.enterWorld(EVENT)).toBe("failed");
    expect(store2.getState()).toMatchObject({ zoneStatus: "error", currentZoneId: 2 });
    zoneFail.calls.length = 0;
    expect(await p2.retry()).toBe("failed");
    expect(zoneFail.urls().some((u) => u.endsWith("zone=2"))).toBe(true);
  });

  it("returns invalid without a request", async () => {
    const f = makeFetch({ zoneCount: 1 });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    expect(await p.loadZone(1)).toBe("invalid"); // before enter
    expect(await p.enterWorld("nope" as never)).toBe("invalid");
    expect(await p.retry()).toBe("invalid");
    await p.enterWorld(EVENT);
    f.calls.length = 0;
    expect(await p.loadZone(0)).toBe("invalid");
    expect(await p.loadZone(1.5)).toBe("invalid");
    expect(await p.retry()).toBe("invalid"); // not in error
    expect(f.calls).toHaveLength(0);
  });

  it("leaveWorld resets and ignores late responses", async () => {
    const f = makeFetch({ zoneCount: 2, sizes: { 2: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    f.gate(1);
    const pending = p.loadZone(1);
    await flush();
    p.leaveWorld();
    expect(store.getState()).toEqual(INITIAL_WORLD_STATE);
    f.release(1);
    expect(await pending).toBe("superseded");
    expect(store.getState()).toEqual(INITIAL_WORLD_STATE);
  });

  it("keeps private data out of the store", async () => {
    const f = makeFetch({ zoneCount: 1, sizes: { 1: 2 } });
    const store = fakeStore();
    await createZonePagination({ fetch: f.impl, store }).enterWorld(EVENT);
    const json = JSON.stringify(store.getState()).toLowerCase();
    for (const name of ["owner_token", "ownertoken", "private_wish", "privatewish"]) expect(json).not.toContain(name);
  });

  it("exposes one singleton and loadZone delegates to it", async () => {
    expect(getZonePagination()).toBe(getZonePagination());
    useWorldStore.setState({ ...INITIAL_WORLD_STATE });
    expect(await loadZone(1)).toBe("invalid");
  });
});

describe("zonePagination streaming along the endless river (MFW-58)", () => {
  const creations = (urls: string[]) => urls.filter((u) => u.startsWith("/api/creations")).map((u) => new URL(u, "http://x").searchParams.get("zone"));

  it("(a) enterWorld with N = 3 and radius 2 fetches zones 3, 2 and 1; all three are streamed", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    p.setStreamRadius(2);
    expect(await p.enterWorld(EVENT)).toBe("loaded");
    await flush();
    expect(creations(f.urls())).toEqual(["3", "2", "1"]);
    const s = store.getState();
    expect(s.stretchAnchor).toEqual({ stretchIndex: 0, zoneId: 3 });
    expect(Object.keys(s.streamedZoneItems).sort()).toEqual(["1", "2", "3"]);
    expect(s.streamedZoneItems[3]).toBe(s.zoneItems);
    expect(s.streamedZoneItems[2]).toHaveLength(2);
  });

  it("(b) setCurrentStretch(1) shows zone 1 from the cache: no new creations request, the focus is kept", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    store.setState({ focusedCreationId: uuid(3, 1) });
    f.calls.length = 0;
    p.setCurrentStretch(1);
    const s = store.getState();
    expect(s).toMatchObject({ currentStretchIndex: 1, currentZoneId: 1, zoneStatus: "ready", focusedCreationId: uuid(3, 1) });
    expect(s.zoneItems).toBe(s.streamedZoneItems[1]);
    await flush();
    expect(creations(f.urls())).toEqual([]);
    expect(f.urls()).toEqual(["/api/zones?event=loy_krathong"]); // one directory refresh per stretch change
    p.setCurrentStretch(1); // same stretch: nothing
    expect(f.urls()).toHaveLength(1);
  });

  it("(c) radius 0: moving drops the old zone and aborts its in-flight fetch", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    f.gate(1);
    p.setCurrentStretch(1); // zone 1, gated
    expect(store.getState()).toMatchObject({ currentZoneId: 1, zoneStatus: "loading" });
    expect(Object.keys(store.getState().streamedZoneItems)).toEqual([]);
    await flush();
    const zone1 = f.calls.find((c) => c.url.endsWith("zone=1"))!;
    p.setCurrentStretch(2); // zone 2 under the camera
    expect(zone1.signal?.aborted).toBe(true);
    await flush();
    await flush();
    expect(store.getState()).toMatchObject({ currentZoneId: 2, zoneStatus: "ready" });
    expect(Object.keys(store.getState().streamedZoneItems)).toEqual(["2"]);
    f.release(1);
    await flush();
    expect(Object.keys(store.getState().streamedZoneItems)).toEqual(["2"]);
  });

  it("(d) loadZone(2) at S = 1 re-anchors {1, 2}; S is unchanged; the items are dropped then re-fetched; the focus is cleared", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    p.setCurrentStretch(1);
    store.setState({ focusedCreationId: uuid(1, 1) });
    f.gate(2);
    const pending = p.loadZone(2);
    expect(store.getState()).toMatchObject({ currentStretchIndex: 1, currentZoneId: 2, zoneStatus: "loading", focusedCreationId: null });
    expect(store.getState().stretchAnchor).toEqual({ stretchIndex: 1, zoneId: 2 });
    expect(store.getState().zoneItems).toEqual([]);
    expect(store.getState().streamedZoneItems[2]).toBeUndefined();
    await flush();
    f.release(2);
    expect(await pending).toBe("loaded");
    expect(store.getState().zoneItems).toHaveLength(2);
    expect(store.getState().streamedZoneItems[2]).toBe(store.getState().zoneItems);
  });

  it("(e) the directory grows from 2 to 3 on a stretch change: the zone under the camera is kept", async () => {
    let count = 2;
    const f = makeFetch({ zoneCount: 2, sizes: { 1: 1, 2: 2, 3: 3 } });
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/zones")) return Response.json({ eventId: EVENT, zoneCount: count });
      return f.impl(input, init);
    }) as unknown as typeof fetch;
    const store = fakeStore();
    const p = createZonePagination({ fetch: impl, store });
    await p.enterWorld(EVENT); // zone 2 at stretch 0
    count = 3;
    p.setCurrentStretch(1); // with N = 2 → zone 1
    expect(store.getState().currentZoneId).toBe(1);
    await flush();
    await flush();
    const s = store.getState();
    expect(s.zoneCount).toBe(3);
    expect(s.currentZoneId).toBe(1);
    expect(s.stretchAnchor).toEqual({ stretchIndex: 1, zoneId: 1 });
  });

  it("(f) a neighbour failure keeps 'ready'; a current-zone failure → 'error'", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: "fail", 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    p.setStreamRadius(1);
    await p.enterWorld(EVENT); // S=0 zone 3; neighbours 2 (−1) and 1 (+1)
    await flush();
    expect(store.getState().zoneStatus).toBe("ready");
    expect(store.getState().streamedZoneItems[1]).toBeUndefined();
    p.setCurrentStretch(1); // zone 1 is under the camera now and still fails
    await flush();
    await flush();
    expect(store.getState()).toMatchObject({ currentZoneId: 1, zoneStatus: "error" });
  });

  it("(g) jumpBy uses the travel driver when one is registered, else pages; unregister clears only its own driver", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    await p.enterWorld(EVENT);
    p.jumpBy(1);
    expect(store.getState()).toMatchObject({ currentStretchIndex: 1, currentZoneId: 1 });
    p.jumpBy(-1);
    p.jumpBy(-1);
    expect(store.getState()).toMatchObject({ currentStretchIndex: -1, currentZoneId: 2 });
    const driver = vi.fn();
    const other = vi.fn();
    const off = p.registerTravelDriver(driver);
    p.jumpBy(1);
    expect(driver).toHaveBeenCalledWith(1);
    expect(store.getState().currentStretchIndex).toBe(-1);
    const offOther = p.registerTravelDriver(other);
    off(); // not the current driver any more: no effect
    p.jumpBy(-1);
    expect(other).toHaveBeenCalledWith(-1);
    offOther();
    p.jumpBy(1);
    expect(store.getState().currentStretchIndex).toBe(0);
  });

  it("(h) leaveWorld resets the new fields; enterWorld starts at stretch 0", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    p.setCurrentStretch(4);
    p.leaveWorld();
    expect(store.getState()).toEqual(INITIAL_WORLD_STATE);
    await flush();
    expect(store.getState()).toEqual(INITIAL_WORLD_STATE);
    store.setState({ currentStretchIndex: 9 });
    await p.enterWorld(EVENT);
    expect(store.getState().currentStretchIndex).toBe(0);
    expect(store.getState().stretchAnchor).toEqual({ stretchIndex: 0, zoneId: 3 });
  });

  it("(i) invariant C: a response item carrying owner_token, owner_token_hash or private_wish_text never reaches streamedZoneItems", async () => {
    const bad = (zone: number, i: number, extra: Record<string, unknown>) => ({ ...item(zone, i), ...extra });
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input), "http://localhost");
      if (u.pathname === "/api/zones") return Response.json({ eventId: EVENT, zoneCount: 3 });
      const zone = Number(u.searchParams.get("zone"));
      return Response.json({
        eventId: EVENT,
        zoneId: zone,
        limit: 80,
        items: [
          bad(zone, 1, { owner_token: "raw" }),
          bad(zone, 2, { owner_token_hash: "h" }),
          bad(zone, 3, { private_wish_text: "secret" }),
          item(zone, 4),
        ],
      });
    }) as unknown as typeof fetch;
    const store = fakeStore();
    const p = createZonePagination({ fetch: impl, store });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    const json = JSON.stringify(store.getState().streamedZoneItems).toLowerCase();
    expect(Object.keys(store.getState().streamedZoneItems)).toHaveLength(3);
    for (const name of ["owner_token", "owner_token_hash", "private_wish_text", "secret", "raw"]) expect(json).not.toContain(name);
  });

  it("never keeps more zones than the load window (at most 2r + 1)", async () => {
    const f = makeFetch({ zoneCount: 9, sizes: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 1])) });
    const store = fakeStore();
    const p = createZonePagination({ fetch: f.impl, store });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    for (let s = 1; s <= 12; s++) {
      p.setCurrentStretch(s);
      await flush();
      await flush();
      expect(Object.keys(store.getState().streamedZoneItems).length).toBeLessThanOrEqual(5);
    }
    expect(store.getState().zoneStatus).toBe("ready");
  });
});
