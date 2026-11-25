// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PINCH_ZOOM_MIN, RITUAL_CHIP_START_PERCENT } from "@/config/interaction.config";
import { LOY_KRATHONG_PIER_RELEASE_SPOT } from "@/config/events/loyKrathong.river.config";
import { locateOnLane, splineProgressToWorld } from "@/core/coordinates";
import { clampSpotToLane } from "@/core/world";
import { createRitualDropMapper, getLoyKrathongRitualSite } from "./ritualSite";

const site = getLoyKrathongRitualSite();
const mapper = createRitualDropMapper(site);
const SIZES = [
  { width: 320, height: 256 },
  { width: 704, height: 256 },
];
const FIELD = { width: 320, height: 256 };
const PERCENT_SCALE = 100;

describe("ritual site", () => {
  it("the ritual view centres the pier tip", () => {
    const p = mapper.toPercent(site.tip, FIELD, 1);
    expect(p.x).toBeCloseTo(50, 9);
    expect(p.y).toBeCloseTo(50, 9);
    const back = mapper.toDeckPlane({ x: 50, y: 50 }, FIELD, 1)!;
    expect(back.x).toBeCloseTo(site.tip.x, 9);
    expect(back.z).toBeCloseTo(site.tip.z, 9);
    expect(RITUAL_CHIP_START_PERCENT).toEqual({ x: 50, y: 50 });
  });

  it("round-trips screen, deck plane and lane location (invariant B)", () => {
    for (const size of SIZES) {
      for (const zoom of [1, PINCH_ZOOM_MIN]) {
        for (const progress of [0.36, 0.38, 0.4, 0.42, 0.44]) {
          for (const lateral of [-0.3, 0, 0.3]) {
            const w = splineProgressToWorld(site.lane, progress, lateral).position;
            const p = { x: w.x, y: site.tip.y, z: w.z };
            const percent = mapper.toPercent(p, size, zoom);
            const plane = mapper.toDeckPlane(percent, size, zoom)!;
            expect(plane.x).toBeCloseTo(p.x, 6);
            expect(plane.z).toBeCloseTo(p.z, 6);
            const drop = mapper.mapDrop(percent, size, zoom)!;
            const want = clampSpotToLane(
              { laneId: site.lane.laneId, ...locateOnLane(site.lane, { x: p.x, z: p.z }) },
              site.lane,
            );
            expect(drop.candidate.progress).toBeCloseTo(want.progress, 6);
            expect(drop.candidate.lateralOffset).toBeCloseTo(want.lateralOffset, 6);
          }
        }
      }
    }
  });

  it("classifies drops on water and on the banks", () => {
    const at = (dyPx: number) => ({ x: 50, y: 50 + (dyPx / FIELD.height) * PERCENT_SCALE });
    const up = mapper.mapDrop(at(-40), FIELD, 1)!;
    expect(up.onWater).toBe(true);
    expect(up.candidate.lateralOffset).toBeCloseTo(0.057, 2);
    expect(mapper.mapDrop(at(60), FIELD, 1)!.onWater).toBe(false);
    expect(mapper.mapDrop(at(-120), FIELD, 1)!.onWater).toBe(false);
  });

  it("returns null for an unusable size", () => {
    expect(mapper.toDeckPlane({ x: 50, y: 50 }, { width: 0, height: 0 }, 1)).toBeNull();
    expect(mapper.mapDrop({ x: 50, y: 50 }, { width: 0, height: 256 }, 1)).toBeNull();
  });

  it("faces the flow at the release spot", () => {
    expect(site.releaseYawRad).toBe(splineProgressToWorld(site.lane, LOY_KRATHONG_PIER_RELEASE_SPOT.progress, 0).yawRad);
  });
});
