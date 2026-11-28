import { describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.riverLane.config";
import { CHRISTMAS_TREE } from "@/config/events/christmas.tree.config";
import { buildReleaseCoord } from "@/core/ritual";
import { slotsOfBand } from "@/core/world/growingTree";
import { createLoyReleaseAdapter } from "./loyReleaseAdapter";
import type { ReleaseLandingContext } from "./releaseAdapter";

const SPOT = { laneId: 1, progress: 0.3, lateralOffset: 0.05 };
const SLOT = slotsOfBand(CHRISTMAS_TREE, 1)[0];
const mkCtx = (sceneTier: boolean) => {
  const now = vi.fn(() => 1);
  const readZone = vi.fn(() => ({ zoneItems: [], zone: null }));
  const ctx: ReleaseLandingContext = { sceneTier, now, readZone };
  return { ctx, now, readZone };
};

describe("loy release adapter", () => {
  it("LA1: accepts pier and drop only", () => {
    const a = createLoyReleaseAdapter();
    expect(a.acceptsOrigin({ kind: "pier" })).toBe(true);
    expect(a.acceptsOrigin({ kind: "drop", candidate: SPOT })).toBe(true);
    expect(a.acceptsOrigin({ kind: "hang", candidate: SLOT })).toBe(false);
  });

  it("LA2: default candidate is the pier spot", () => {
    expect(createLoyReleaseAdapter().defaultCandidate(mkCtx(false).ctx)).toBe(LOY_KRATHONG_PIER_RELEASE_SPOT);
  });

  it("LA3: no scene touches nothing; a failing loader falls back", async () => {
    const loader = vi.fn(async () => () => ({ landing: SPOT, collided: true }));
    const off = mkCtx(false);
    expect(await createLoyReleaseAdapter({ loadLandingResolver: loader }).resolveLanding(SPOT, off.ctx)).toEqual({
      landing: SPOT,
      collided: false,
    });
    expect(loader).not.toHaveBeenCalled();
    expect(off.now).not.toHaveBeenCalled();
    expect(off.readZone).not.toHaveBeenCalled();
    const bad = createLoyReleaseAdapter({
      loadLandingResolver: async () => {
        throw new Error("chunk");
      },
    });
    expect(await bad.resolveLanding(SPOT, mkCtx(true).ctx)).toEqual({ landing: SPOT, collided: false });
  });

  it("LA4: builds spline coords only", () => {
    const a = createLoyReleaseAdapter();
    expect(() => a.buildCoord(SLOT)).toThrow(RangeError);
    expect(a.buildCoord(SPOT)).toEqual(buildReleaseCoord(SPOT));
  });

  it("LA5: server move", () => {
    const a = createLoyReleaseAdapter();
    const c = buildReleaseCoord(SPOT);
    expect(a.didServerMove({ landing: SPOT, sent: c, final: { ...c }, finalZoneId: 1 })).toBe(false);
    expect(a.didServerMove({ landing: SPOT, sent: c, final: { ...SLOT }, finalZoneId: 1 })).toBe(true);
  });
});
