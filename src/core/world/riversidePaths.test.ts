// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LOY_KRATHONG_RIVER_CHANNEL,
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVERSIDE_PATHS,
  RIVER_BANK_PROFILE,
} from "@/config/events/loyKrathong.river.config";
import { createSplinePoseOut, splineProgressToWorld } from "@/core/coordinates";
import { bankSurfaceY } from "./bankProfile";
import { createRiverChannel, riverFrameAt } from "./riverEnvironment";
import { assertRiversidePath, riversidePathPoseInto, type RiversidePathDefinition } from "./riversidePaths";

const STRAIGHT = createRiverChannel({
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ],
  width: 4,
});
const PRODUCT = createRiverChannel(LOY_KRATHONG_RIVER_CHANNEL);
const BANK_WIDTH = LOY_KRATHONG_RIVER_ENVIRONMENT.bankWidth;
const PATH: RiversidePathDefinition = { pathId: 1, side: 1, setback: 1, halfWidth: 0.2, fromProgress: 0.1, toProgress: 0.9 };

describe("assertRiversidePath", () => {
  it("accepts the product paths", () => {
    for (const p of LOY_KRATHONG_RIVERSIDE_PATHS) expect(() => assertRiversidePath(p, BANK_WIDTH)).not.toThrow();
  });
  it("rejects each bad field", () => {
    const bad: Partial<RiversidePathDefinition>[] = [
      { pathId: 0 },
      { pathId: 1.5 },
      { side: 0 as 1 },
      { halfWidth: 0 },
      { setback: 0.2 }, // setback − halfWidth = 0: touches the water edge
      { setback: 4.9 }, // setback + halfWidth ≥ bankWidth
      { fromProgress: -0.1 },
      { toProgress: 1.1 },
      { fromProgress: 0.5, toProgress: 0.5 },
      { setback: Number.NaN },
      { halfWidth: Number.POSITIVE_INFINITY },
    ];
    for (const b of bad) expect(() => assertRiversidePath({ ...PATH, ...b }, BANK_WIDTH), JSON.stringify(b)).toThrow(RangeError);
  });
});

describe("riversidePathPoseInto", () => {
  it("straight channel: lateral distance W/2 + setback on the path's side, y on the bank, yaw downstream", () => {
    const out = createSplinePoseOut();
    riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 0.5, 0, out);
    expect(out.x).toBeCloseTo(10, 6);
    expect(out.z).toBeCloseTo(2 + 1, 6); // +right is +z on this channel
    expect(out.y).toBeCloseTo(bankSurfaceY(RIVER_BANK_PROFILE, PATH.setback), 9);
    expect(Math.sin(out.yawRad)).toBeCloseTo(1, 6); // flow +x
    riversidePathPoseInto(STRAIGHT, { ...PATH, side: -1 }, RIVER_BANK_PROFILE, 0.5, 0, out);
    expect(out.z).toBeCloseTo(-3, 6);
  });

  it("across ±1 reaches the strip edges", () => {
    const out = createSplinePoseOut();
    riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 0.5, 1, out);
    expect(out.z).toBeCloseTo(3 + PATH.halfWidth, 6);
    riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 0.5, -1, out);
    expect(out.z).toBeCloseTo(3 - PATH.halfWidth, 6);
  });

  it("clamps progress to [from, to] and across to [−1, 1]", () => {
    const a = riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 0, 5, createSplinePoseOut());
    const b = riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, PATH.fromProgress, 1, createSplinePoseOut());
    expect(a).toEqual(b);
    const c = riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 1, -7, createSplinePoseOut());
    const d = riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, PATH.toProgress, -1, createSplinePoseOut());
    expect(c).toEqual(d);
  });

  it("product channel: matches the channel frame at the path offset", () => {
    for (const path of LOY_KRATHONG_RIVERSIDE_PATHS) {
      for (const p of [0.2, 0.4, 0.6]) {
        const out = riversidePathPoseInto(PRODUCT, path, RIVER_BANK_PROFILE, p, 0, createSplinePoseOut());
        const { centerline: c, right } = riverFrameAt(PRODUCT, p);
        const d = path.side * (PRODUCT.width / 2 + path.setback);
        expect(out.x).toBeCloseTo(c.x + right.x * d, 6);
        expect(out.z).toBeCloseTo(c.z + right.z * d, 6);
        expect(out.yawRad).toBeCloseTo(splineProgressToWorld(PRODUCT, p, 0).yawRad, 9);
        expect(out.y).toBeCloseTo(bankSurfaceY(RIVER_BANK_PROFILE, path.setback), 9);
      }
    }
  });

  it("returns the same out object and rejects non-finite input", () => {
    const out = createSplinePoseOut();
    expect(riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 0.5, 0, out)).toBe(out);
    expect(() => riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, Number.NaN, 0, out)).toThrow(RangeError);
    expect(() => riversidePathPoseInto(STRAIGHT, PATH, RIVER_BANK_PROFILE, 0.5, Number.NaN, out)).toThrow(RangeError);
  });
});
