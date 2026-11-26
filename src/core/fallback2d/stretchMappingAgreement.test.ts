// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import type { SplinePathCoord } from "@/core/coordinates/SplinePathCoord";
import { getLoyKrathongEndlessRiverFrame } from "@/core/world/endlessRiver";
import { buildRiverStretchSlots, zoneIdForStretch, type StretchAnchor } from "@/core/world/riverStretches";
import { createZonePagination } from "@/services/api/zonePagination";
import { INITIAL_WORLD_STATE, type WorldState } from "@/store/useWorldStore";
import { createCanvasPointOut } from "./riverTopDown";
import { createFlatCanvasScratch, flatCoordToCanvasInto } from "./flatRiverFrame";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";

/*
 * MFW-58 AC3 (invariant B): the 2D fallback reads the same data through the same stretch mapping as the 3D scene. Three-free
 * imports only (this file must not import three, like the rest of src/core/fallback2d).
 */

const EVENT = "loy_krathong";
const uuid = (zone: number) => `00000000-0000-4000-8000-${String(zone).padStart(12, "0")}`;
const COORDS: Record<number, SplinePathCoord> = {
  1: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.15, speedFactor: 0.004, lateralOffset: -0.2 },
  2: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.55, speedFactor: 0.006, lateralOffset: 0.3 },
  3: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.9, speedFactor: 0.002, lateralOffset: 0 },
};
const CREATED_AT = "2026-11-24T12:00:00.000Z";

function fakeFetch(zoneCount: number) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input), "http://localhost");
    if (u.pathname === "/api/zones") return Response.json({ eventId: EVENT, zoneCount });
    const zone = Number(u.searchParams.get("zone"));
    return Response.json({
      eventId: EVENT,
      zoneId: zone,
      limit: 80,
      items: [
        {
          id: uuid(zone),
          eventId: EVENT,
          zoneId: zone,
          appearance: { base: "banana_trunk_01" },
          coord: COORDS[zone],
          publicWishText: null,
          createdAt: CREATED_AT,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      ],
    });
  }) as unknown as typeof fetch;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("2D paging and 3D slots share the stretch mapping (MFW-58, AC3)", () => {
  const frame = getLoyKrathongEndlessRiverFrame();

  it.each([
    [1, { stretchIndex: 0, zoneId: 1 }],
    [3, { stretchIndex: 0, zoneId: 3 }],
    [3, { stretchIndex: 2, zoneId: 1 }],
  ] as const)("N = %i, anchor %o: for s ∈ −4..4 the 3D slot of s and a 2D page to s show zoneIdForStretch(s)", async (n, anchor) => {
    for (let s = -4; s <= 4; s++) {
      const want = zoneIdForStretch(s, anchor as StretchAnchor, n);
      const slot = buildRiverStretchSlots(frame, s, anchor as StretchAnchor, n)[0];
      expect(slot.stretchIndex).toBe(s);
      expect(slot.zoneId).toBe(want);
      // Neighbour slots agree with the mapping too.
      for (const other of buildRiverStretchSlots(frame, s, anchor as StretchAnchor, n)) {
        expect(other.zoneId).toBe(zoneIdForStretch(other.stretchIndex, anchor as StretchAnchor, n));
      }
    }
    // 2D: a pagination with radius 0 (the FALLBACK_2D load window) paged with jumpBy and no travel driver.
    const store = createStore<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
    const p = createZonePagination({ fetch: fakeFetch(n), store });
    await p.enterWorld(EVENT);
    // Put the anchor where the case wants it: page to its stretch, then load its zone there.
    while (store.getState().currentStretchIndex < anchor.stretchIndex) p.jumpBy(1);
    await p.loadZone(anchor.zoneId);
    expect(store.getState().stretchAnchor).toEqual(anchor);
    while (store.getState().currentStretchIndex > -4) p.jumpBy(-1);
    for (let s = -4; s <= 4; s++) {
      if (s > -4) p.jumpBy(1);
      await flush();
      const state = store.getState();
      expect(state.currentStretchIndex).toBe(s);
      expect(state.currentZoneId).toBe(zoneIdForStretch(s, anchor as StretchAnchor, n));
      expect(state.zoneStatus).toBe("ready");
      expect(state.zoneItems.map((i) => i.zoneId)).toEqual([state.currentZoneId]);
    }
  });

  it("2D draws stretch-local: the canvas point of an item of the paged zone equals today's single-stretch point", async () => {
    const river = getLoyKrathongFlatRiver();
    const lane = river.lanes.get(1)!;
    const store = createStore<WorldState>()(() => ({ ...INITIAL_WORLD_STATE }));
    const p = createZonePagination({ fetch: fakeFetch(3), store });
    await p.enterWorld(EVENT); // zone 3 at stretch 0
    const now = Date.parse(CREATED_AT) + 42_000;
    const scratch = createFlatCanvasScratch();
    for (const step of [1, 1, 1, 1, -1]) {
      p.jumpBy(step as 1 | -1);
      await flush();
      const item = store.getState().zoneItems[0];
      const parsed = parsePersistableCoord(item.coord);
      expect(parsed.ok).toBe(true);
      const coord = (parsed as { ok: true; coord: SplinePathCoord }).coord;
      const paged = flatCoordToCanvasInto(coord, lane, Date.parse(item.createdAt), now, river.projection, createCanvasPointOut(), scratch);
      const single = flatCoordToCanvasInto(COORDS[item.zoneId], lane, Date.parse(CREATED_AT), now, river.projection, createCanvasPointOut(), scratch);
      expect(paged).toEqual(single); // no stretch offset ever reaches the canvas
    }
  });
});
