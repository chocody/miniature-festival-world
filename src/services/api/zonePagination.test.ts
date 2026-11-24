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
