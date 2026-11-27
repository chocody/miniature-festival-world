import { createStore } from "zustand/vanilla";
import { describe, expect, it, vi } from "vitest";
import { linearStreamedZoneIds } from "@/core/world/riverStretches";
import { INITIAL_WORLD_STATE, type WorldState } from "@/store/useWorldStore";
import { createZonePagination, type ZonePaginationOptions } from "./zonePagination";

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
/** Routed fetch fake: zones resolve immediately unless deferred; `count` is mutable (directory refresh). */
function makeFetch(opts: { zoneCount?: number; sizes?: Record<number, number> } = {}) {
  const calls: Call[] = [];
  const deferred = new Map<number, () => void>();
  const gates = new Set<number>();
  const state = { count: opts.zoneCount ?? 1 };
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, signal: init?.signal ?? undefined });
    const u = new URL(url, "http://localhost");
    if (u.pathname === "/api/zones") return Response.json({ eventId: EVENT, zoneCount: state.count });
    const zone = Number(u.searchParams.get("zone"));
    if (gates.has(zone)) await new Promise<void>((resolve) => deferred.set(zone, resolve));
    const size = opts.sizes?.[zone] ?? 0;
    return Response.json({ eventId: EVENT, zoneId: zone, limit: 80, items: Array.from({ length: size }, (_, i) => item(zone, i + 1)) });
  });
  return {
    impl: impl as unknown as typeof fetch,
    calls,
    state,
    urls: () => calls.map((c) => c.url),
    gate: (zone: number) => void gates.add(zone),
    release: (zone: number) => {
      gates.delete(zone);
      deferred.get(zone)?.();
    },
  };
}
type F = ReturnType<typeof makeFetch>;
const fakeStore = () => createStore<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
const flush = () => new Promise((r) => setTimeout(r, 0));
const creations = (f: F) => f.urls().filter((u) => u.startsWith("/api/creations")).map((u) => new URL(u, "http://localhost").searchParams.get("zone"));
const keys = (s: WorldState) => Object.keys(s.streamedZoneItems).map(Number).sort((a, b) => a - b);
const sizes = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1]));
function setup(f: F, extra: ZonePaginationOptions = {}) {
  const store = fakeStore();
  const p = createZonePagination({ fetch: f.impl, store, topology: "linear", ...extra });
  return { store, p };
}
const ANCHOR = { stretchIndex: 1, zoneId: 1 };

describe("zonePagination linear topology (MFW-99)", () => {
  it("LP1 NEWEST starts at the last band and streams [b-R, b+R]", async () => {
    const f = makeFetch({ zoneCount: 5, sizes: sizes(5) });
    const { store, p } = setup(f);
    p.setStreamRadius(2);
    expect(await p.enterWorld(EVENT)).toBe("loaded");
    await flush();
    expect(creations(f)).toEqual(["5", "4", "3"]);
    expect(store.getState()).toMatchObject({ currentStretchIndex: 5, currentZoneId: 5, zoneCount: 5, zoneStatus: "ready" });
    expect(store.getState().stretchAnchor).toEqual(ANCHOR);
    expect(keys(store.getState())).toEqual([3, 4, 5]);
  });

  it("LP2 FIRST policy", async () => {
    const f = makeFetch({ zoneCount: 5, sizes: sizes(5) });
    const { store, p } = setup(f, { initialZonePolicy: "FIRST" });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    expect(creations(f)).toEqual(["1", "2", "3"]);
    expect(store.getState().currentStretchIndex).toBe(1);
    expect(keys(store.getState())).toEqual([1, 2, 3]);
  });

  it("LP3 far bands are dropped (invariant E)", async () => {
    const f = makeFetch({ zoneCount: 9, sizes: sizes(9) });
    const { store, p } = setup(f);
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    for (let b = 8; b >= 1; b--) {
      p.setCurrentStretch(b);
      await flush();
      await flush();
      const k = keys(store.getState());
      expect(k).toEqual([...linearStreamedZoneIds(b, 9, 2)].sort((x, y) => x - y));
      expect(k.length).toBeLessThanOrEqual(5);
      expect(store.getState().zoneStatus).toBe("ready");
      if (b === 5) expect(k).toEqual([3, 4, 5, 6, 7]);
      if (b === 1) expect(k).toEqual([1, 2, 3]);
    }
  });

  it("LP4 an in-flight band leaving the window is aborted", async () => {
    const f = makeFetch({ zoneCount: 9, sizes: sizes(9) });
    const { store, p } = setup(f, { initialZonePolicy: "FIRST" });
    p.setStreamRadius(1);
    await p.enterWorld(EVENT);
    await flush();
    f.gate(3);
    p.setCurrentStretch(2);
    await flush();
    const call = f.calls.filter((c) => c.url.endsWith("zone=3")).at(-1)!;
    p.setCurrentStretch(1);
    expect(call.signal?.aborted).toBe(true);
    f.release(3);
    await flush();
    await flush();
    expect(keys(store.getState())).toEqual([1, 2]);
  });

  it("LP5 jumpBy clamps at both ends", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: sizes(3) });
    const { store, p } = setup(f, { initialZonePolicy: "FIRST" });
    await p.enterWorld(EVENT);
    await flush();
    f.calls.length = 0;
    p.jumpBy(-1);
    expect(store.getState().currentStretchIndex).toBe(1);
    expect(f.calls).toHaveLength(0);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      p.jumpBy(1);
      await flush();
      await flush();
      expect(store.getState().currentZoneId).toBe(store.getState().currentStretchIndex);
      seen.push(store.getState().currentStretchIndex);
    }
    expect(seen).toEqual([2, 3, 3]);
    const driver = vi.fn();
    p.registerTravelDriver(driver);
    p.jumpBy(1);
    expect(driver).not.toHaveBeenCalled();
    p.jumpBy(-1);
    expect(driver).toHaveBeenCalledWith(-1);
    expect(store.getState().currentStretchIndex).toBe(3);
  });

  it("LP6 setCurrentStretch clamps", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: sizes(3) });
    const { store, p } = setup(f);
    await p.enterWorld(EVENT);
    await flush();
    expect(store.getState().currentStretchIndex).toBe(3);
    f.calls.length = 0;
    const before = store.getState();
    p.setCurrentStretch(7);
    expect(store.getState()).toBe(before);
    expect(f.calls).toHaveLength(0);
    p.setCurrentStretch(0);
    expect(store.getState()).toMatchObject({ currentStretchIndex: 1, currentZoneId: 1 });
    await flush();
    await flush();
    const at1 = store.getState();
    p.setCurrentStretch(-4);
    expect(store.getState()).toBe(at1);
    p.setCurrentStretch(2.5);
    expect(store.getState()).toBe(at1);
  });

  it("LP7 loadZone sets the band", async () => {
    const f = makeFetch({ zoneCount: 5, sizes: sizes(5) });
    const { store, p } = setup(f, { initialZonePolicy: "FIRST" });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    f.gate(4);
    const pending = p.loadZone(4);
    expect(store.getState()).toMatchObject({ currentStretchIndex: 4, currentZoneId: 4, zoneStatus: "loading" });
    expect(store.getState().stretchAnchor).toEqual(ANCHOR);
    await flush();
    f.release(4);
    expect(await pending).toBe("loaded");
    await flush();
    expect(keys(store.getState())).toEqual([2, 3, 4, 5]);
  });

  it("LP8 loadZone beyond the count keeps the band", async () => {
    const f = makeFetch({ zoneCount: 5, sizes: { 5: 1, 6: 1 } });
    const { store, p } = setup(f, { initialZonePolicy: "FIRST" });
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    expect(await p.loadZone(7)).toBe("loaded");
    await flush();
    expect(store.getState()).toMatchObject({ currentStretchIndex: 7, zoneCount: 5 });
    expect(keys(store.getState())).toEqual([5, 6, 7]);
    const before = store.getState();
    p.jumpBy(1);
    expect(store.getState()).toBe(before);
  });

  it("LP9 a refresh that raises the count keeps the band (stretch change)", async () => {
    const f = makeFetch({ zoneCount: 2, sizes: sizes(3) });
    const { store, p } = setup(f);
    await p.enterWorld(EVENT);
    await flush();
    expect(store.getState().currentStretchIndex).toBe(2);
    f.state.count = 3;
    p.setCurrentStretch(1);
    await flush();
    await flush();
    expect(store.getState()).toMatchObject({ zoneCount: 3, currentStretchIndex: 1, currentZoneId: 1 });
    expect(store.getState().stretchAnchor).toEqual(ANCHOR);
    p.jumpBy(1);
    await flush();
    await flush();
    p.jumpBy(1);
    await flush();
    await flush();
    expect(store.getState()).toMatchObject({ currentStretchIndex: 3, currentZoneId: 3 });
  });

  it("LP10 a refresh keeps the band (loadZone refresh, raised and lowered count)", async () => {
    const f = makeFetch({ zoneCount: 2, sizes: sizes(4) });
    const { store, p } = setup(f);
    p.setStreamRadius(2);
    await p.enterWorld(EVENT);
    await flush();
    expect(keys(store.getState())).toEqual([1, 2]);
    f.state.count = 4;
    expect(await p.loadZone(2)).toBe("loaded");
    await flush();
    expect(store.getState()).toMatchObject({ zoneCount: 4, currentStretchIndex: 2, currentZoneId: 2 });
    expect(keys(store.getState())).toEqual([1, 2, 3, 4]);

    const g = makeFetch({ zoneCount: 4, sizes: sizes(4) });
    const second = setup(g);
    second.p.setStreamRadius(2);
    await second.p.enterWorld(EVENT);
    await flush();
    expect(second.store.getState().currentStretchIndex).toBe(4);
    g.state.count = 2;
    second.p.setCurrentStretch(3);
    await flush();
    await flush();
    expect(second.store.getState()).toMatchObject({ zoneCount: 2, currentStretchIndex: 3, currentZoneId: 3 });
    expect(keys(second.store.getState())).toEqual([1, 2, 3]);
  });

  it("LP11 lifecycle", async () => {
    const f = makeFetch({ zoneCount: 3, sizes: sizes(3) });
    const { store, p } = setup(f);
    p.setCurrentStretch(3);
    p.jumpBy(1);
    expect(store.getState()).toEqual(INITIAL_WORLD_STATE);
    expect(f.calls).toHaveLength(0);
    await p.enterWorld(EVENT);
    await flush();
    p.leaveWorld();
    expect(store.getState()).toEqual(INITIAL_WORLD_STATE);
    await p.enterWorld(EVENT);
    await flush();
    expect(store.getState()).toMatchObject({ currentStretchIndex: 3, currentZoneId: 3 });
    expect(store.getState().stretchAnchor).toEqual(ANCHOR);
  });

  it("LP12 ring stays the default; unknown topology throws", async () => {
    async function run(extra: ZonePaginationOptions) {
      const f = makeFetch({ zoneCount: 3, sizes: { 1: 1, 2: 2, 3: 3 } });
      const store = fakeStore();
      const p = createZonePagination({ fetch: f.impl, store, ...extra });
      p.setStreamRadius(2);
      await p.enterWorld(EVENT);
      await flush();
      p.setCurrentStretch(1);
      p.jumpBy(1);
      p.jumpBy(1);
      await flush();
      await flush();
      return { state: store.getState(), urls: f.urls() };
    }
    const a = await run({});
    const b = await run({ topology: "ring" });
    expect(a.state).toEqual(b.state);
    expect(a.urls).toEqual(b.urls);
    expect(a.state).toMatchObject({ currentStretchIndex: 3, currentZoneId: 3 });
    expect(() => createZonePagination({ topology: "spiral" as never })).toThrow(RangeError);
  });
});
