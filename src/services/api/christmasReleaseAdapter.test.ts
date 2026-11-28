import { describe, expect, it, vi } from "vitest";
import { CHRISTMAS_TREE, TREE_MAX_BANDS } from "@/config/events/christmas.tree.config";
import { ORNAMENT_DEFAULT_DESIGN } from "@/config/ornamentDesigns.config";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { nearestFreeSlot, slotsOfBand, snapToSlot, tierCountForBands } from "@/core/world/growingTree";
import { createChristmasReleaseAdapter } from "./christmasReleaseAdapter";
import type { BuilderAppearanceState, ReleaseLandingContext, ReleaseZoneView } from "./releaseAdapter";
import type { PublicCreation } from "./creationTypes";

const slot = (b: number, i: number) => slotsOfBand(CHRISTMAS_TREE, b)[i];
const adapter = createChristmasReleaseAdapter();
const SPOT = { laneId: 1, progress: 0.3, lateralOffset: 0.05 };
const item = (coord: PublicCreation["coord"]) => ({ coord }) as PublicCreation;
const ctxFor = (view: ReleaseZoneView, sceneTier = true) => {
  const now = vi.fn(() => 1);
  const ctx: ReleaseLandingContext = { sceneTier, now, readZone: () => view };
  return { ctx, now };
};
const z = (zoneId: number, items: PublicCreation[] = []): ReleaseZoneView => ({
  zoneItems: items,
  zone: { eventId: "christmas", zoneId },
});
const builder = (o: Partial<BuilderAppearanceState>): BuilderAppearanceState => ({
  appearance: null,
  ornamentAppearance: null,
  starAppearance: null,
  ...o,
});

describe("christmas release adapter", () => {
  it("CA1: accepts pier and hang only", () => {
    expect(adapter.acceptsOrigin({ kind: "pier" })).toBe(true);
    expect(adapter.acceptsOrigin({ kind: "hang", candidate: slot(1, 0) })).toBe(true);
    expect(adapter.acceptsOrigin({ kind: "drop", candidate: SPOT })).toBe(false);
  });

  it("CA2: default candidate is the first slot of band 1", () => {
    expect(adapter.defaultCandidate(ctxFor(z(1)).ctx)).toEqual(slot(1, 0));
  });

  it("CA3: buildCoord is a fresh 4-key cylindrical coord", () => {
    const c = adapter.buildCoord(slot(2, 3));
    expect(Object.keys(c)).toEqual(["mode", "tierId", "angleDeg", "heightRatio"]);
    expect(c).toEqual(slot(2, 3));
    expect(c).not.toBe(slot(2, 3));
    expect(Object.isFrozen(c)).toBe(false);
    expect(parsePersistableCoord(c).ok).toBe(true);
    expect(() => adapter.buildCoord(SPOT)).toThrow(RangeError);
    expect(() =>
      adapter.buildCoord({ ...slot(1, 0), tierId: tierCountForBands(CHRISTMAS_TREE, TREE_MAX_BANDS) }),
    ).toThrow(RangeError);
  });

  it("CA4: resolveLanding pre-checks the current band", async () => {
    const taken = item(slot(1, 0));
    const expected = nearestFreeSlot(CHRISTMAS_TREE, slot(1, 0), [slot(1, 0)], 1);
    const a = ctxFor(z(1));
    expect(await adapter.resolveLanding(slot(1, 0), a.ctx)).toEqual({ landing: slot(1, 0), collided: false });
    expect(a.now).not.toHaveBeenCalled();
    const b = await adapter.resolveLanding(slot(1, 0), ctxFor(z(1, [taken])).ctx);
    expect(b.landing).toEqual(expected);
    expect(b.collided).toBe(true);
    expect(await adapter.resolveLanding(slot(1, 0), ctxFor(z(2, [taken])).ctx)).toEqual({
      landing: slot(1, 0),
      collided: false,
    });
    const off = { ...slot(1, 0), angleDeg: slot(1, 0).angleDeg + 1 };
    const d = await adapter.resolveLanding(off, ctxFor(z(1)).ctx);
    expect(d.landing).toEqual(snapToSlot(CHRISTMAS_TREE, off));
    expect(d.landing).toEqual(slot(1, 0));
    expect(d.collided).toBe(false);
    const full = slotsOfBand(CHRISTMAS_TREE, 1).map((s) => item(s));
    expect(await adapter.resolveLanding(slot(1, 0), ctxFor(z(1, full)).ctx)).toEqual({
      landing: slot(1, 0),
      collided: false,
    });
    const f = await adapter.resolveLanding(slot(1, 0), ctxFor(z(1, [taken]), false).ctx);
    expect(f.landing).toEqual(expected);
    expect(f.collided).toBe(true);
  });

  it("CA5: didServerMove is the slot or band changing", () => {
    const m = (sent: ReturnType<typeof slot>, final: Parameters<typeof adapter.didServerMove>[0]["final"], finalZoneId: number) =>
      adapter.didServerMove({ landing: sent, sent, final, finalZoneId });
    expect(m(slot(1, 0), slot(1, 0), 1)).toBe(false);
    expect(m(slot(1, 0), slot(1, 1), 1)).toBe(true);
    expect(m(slot(1, 0), slot(2, 0), 2)).toBe(true);
    expect(m(slot(1, 0), slot(1, 0), 2)).toBe(true);
    expect(m({ ...slot(1, 0), angleDeg: slot(1, 0).angleDeg + 0.5 }, slot(1, 0), 1)).toBe(false);
    expect(m(slot(1, 0), { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.1, speedFactor: 0.008, lateralOffset: 0 }, 1)).toBe(true);
  });

  it("CA6: serializeAppearance is a fresh {design}", () => {
    expect(adapter.serializeAppearance(builder({}))).toEqual({ design: ORNAMENT_DEFAULT_DESIGN });
    const input = { design: "star_01" } as never;
    const out = adapter.serializeAppearance(builder({ ornamentAppearance: input }));
    expect(out).toEqual({ design: "star_01" });
    expect(out).not.toBe(input);
    expect(() => adapter.serializeAppearance(builder({ ornamentAppearance: { design: "nope" } as never }))).toThrow();
  });
});
