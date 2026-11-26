// @vitest-environment node
import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import {
  createRiverLaneSet,
  currentProgress,
  splineCoordToWorld,
  type SplinePathCoord,
} from "@/core/coordinates";
import { bobbingPhaseFromId, createBobbingOut, writeBobbingAt } from "./bobbing";
import {
  RIVER_ITEM_EULER_ORDER,
  applyRiverItemTransform,
  createRiverFrameScratch,
  getRiverItemPositionAt,
  prepareRiverItems,
  type RiverRenderSource,
  type RiverTransformTarget,
} from "./riverFlow";
import { getLoyKrathongRiverLanes } from "./riverLanes";

const T0 = 1_700_000_000_000;
const DAY_MS = 24 * 3600 * 1000;
const lanes = getLoyKrathongRiverLanes();
const baseCoord: SplinePathCoord = {
  mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.25, speedFactor: RIVER_DRIFT_SPEED_FACTOR, lateralOffset: 0.2,
};
const item = (id: string, over: Record<string, unknown> = {}, createdAtMs = T0): RiverRenderSource =>
  ({ id, coord: { ...baseCoord, ...over } as SplinePathCoord, createdAtMs });

describe("lane set", () => {
  it("is a singleton with lane id 1", () => {
    expect(getLoyKrathongRiverLanes()).toBe(getLoyKrathongRiverLanes());
    expect(lanes.lanes.map((l) => l.laneId)).toEqual([1]);
  });
});

describe("determinism (AC3)", () => {
  it("is identical across independently built lane sets", () => {
    const a = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES);
    const b = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES);
    for (const spawnProgress of [0, 0.5, 0.99]) {
      for (const lateralOffset of [-0.5, 0, 0.5]) {
        for (const dt of [0, 1000, 30 * DAY_MS]) {
          const it1 = item("x", { spawnProgress, lateralOffset });
          const p = getRiverItemPositionAt(it1, a, T0 + dt)!;
          const q = getRiverItemPositionAt(it1, b, T0 + dt)!;
          expect(Object.is(p.progress, q.progress)).toBe(true);
          expect(Object.is(p.world.x, q.world.x)).toBe(true);
          expect(Object.is(p.world.y, q.world.y)).toBe(true);
          expect(Object.is(p.world.z, q.world.z)).toBe(true);
          expect(Object.is(p.yawRad, q.yawRad)).toBe(true);
        }
      }
    }
  });

  it("depends only on coord and time", () => {
    const it1 = item("x");
    const p = getRiverItemPositionAt(it1, lanes, T0 + 40_000)!;
    expect(p.progress).toBe(currentProgress(baseCoord, T0, T0 + 40_000));
    expect(p.world).toEqual(splineCoordToWorld(baseCoord, lanes.get(1)!, T0, T0 + 40_000).position);
  });

  it("moves downstream slowly", () => {
    const p0 = getRiverItemPositionAt(item("x"), lanes, T0)!;
    const p1 = getRiverItemPositionAt(item("x"), lanes, T0 + 1000)!;
    expect(p1.progress - p0.progress).toBeCloseTo(RIVER_DRIFT_SPEED_FACTOR, 12);
    const dx = p1.world.x - p0.world.x;
    const dz = p1.world.z - p0.world.z;
    expect(dx * Math.sin(p0.yawRad) + dz * Math.cos(p0.yawRad)).toBeGreaterThan(0);
  });
});

describe("Find My query (AC4)", () => {
  it("handles creation, wrap, future and invalid items", () => {
    expect(getRiverItemPositionAt(item("x"), lanes, T0)!.progress).toBe(0.25);
    expect(getRiverItemPositionAt(item("x", { spawnProgress: 0.9 }), lanes, T0 + 25_000)!.progress).toBeCloseTo(0.1, 12);
    expect(getRiverItemPositionAt(item("x"), lanes, T0 - 5000)!.progress).toBe(0.25);
    expect(getRiverItemPositionAt(item("x", { laneId: 99 }), lanes, T0)).toBeNull();
    expect(getRiverItemPositionAt(item("x", { position: 1 }), lanes, T0)).toBeNull();
    expect(getRiverItemPositionAt(item("x", {}, NaN), lanes, T0)).toBeNull();
    expect(Object.keys(getRiverItemPositionAt(item("x"), lanes, T0)!).sort()).toEqual(
      ["laneId", "progress", "world", "yawRad"],
    );
  });
});

describe("prepareRiverItems", () => {
  it("keeps valid items in order and drops invalid ones", () => {
    const items = [
      item("a"),
      item(""),
      item("a", { spawnProgress: 0.5 }),
      item("b", { x: 1 }),
      { id: "c", coord: { mode: "CYLINDRICAL_SURFACE", tierId: 1, angleDeg: 0, heightRatio: 0 } as never, createdAtMs: T0 },
      item("d", { lateralOffset: 0.7 }),
      item("e", { laneId: 99 }),
      item("f", {}, NaN),
      item("g", { speedFactor: 0.02 }),
    ];
    const prepared = prepareRiverItems(items, lanes);
    expect(prepared.map((p) => p.id)).toEqual(["a", "g"]);
    expect(prepared[0].coord).toEqual(items[0].coord);
    expect(prepared[0].coord).not.toBe(items[0].coord);
    expect(prepared[0].coord.spawnProgress).toBe(0.25);
    expect(prepared[0].bobPhaseRad).toBe(bobbingPhaseFromId("a"));
    expect(prepared[0].lane).toBe(lanes.get(1));
    expect(prepared[0].source).toBe(items[0]);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared[0])).toBe(true);
    expect(prepareRiverItems([], lanes)).toEqual([]);
  });
});

describe("applyRiverItemTransform", () => {
  const [prepared] = prepareRiverItems([item("a")], lanes);
  const record = () => {
    const calls = { pos: [] as number[], rot: [] as unknown[] };
    const target: RiverTransformTarget = {
      position: { set: (x, y, z) => void (calls.pos = [x, y, z]) },
      rotation: { set: (x, y, z, o) => void (calls.rot = [x, y, z, o]) },
    };
    return { calls, target };
  };

  it("keeps drifting under reduced motion and writes the Find My position", () => {
    const s = createRiverFrameScratch();
    const r = record();
    applyRiverItemTransform(r.target, prepared, T0, true, s);
    const at0 = [...r.calls.pos];
    const w0 = getRiverItemPositionAt(item("a"), lanes, T0)!;
    expect(at0).toEqual([w0.world.x, w0.world.y, w0.world.z]);
    expect(r.calls.rot).toEqual([0, w0.yawRad, 0, "YXZ"]);
    applyRiverItemTransform(r.target, prepared, T0 + 1000, true, s);
    const w1 = getRiverItemPositionAt(item("a"), lanes, T0 + 1000)!;
    expect(r.calls.pos).toEqual([w1.world.x, w1.world.y, w1.world.z]);
    expect(r.calls.pos[0]).not.toBe(at0[0]);
  });

  it("adds bobbing without moving x/z", () => {
    const s = createRiverFrameScratch();
    const still = record();
    const moving = record();
    const now = T0 + 777;
    applyRiverItemTransform(still.target, prepared, now, true, s);
    applyRiverItemTransform(moving.target, prepared, now, false, s);
    const bob = writeBobbingAt(now, prepared.bobPhaseRad, false, createBobbingOut());
    expect(moving.calls.pos[0]).toBe(still.calls.pos[0]);
    expect(moving.calls.pos[2]).toBe(still.calls.pos[2]);
    expect(moving.calls.pos[1]).toBe(still.calls.pos[1] + bob.offsetY);
    expect(moving.calls.rot[0]).toBe(bob.pitchRad);
    expect(moving.calls.rot[2]).toBe(bob.rollRad);
  });

  it("writes a real Object3D with YXZ order and keeps no state", () => {
    const s = createRiverFrameScratch();
    const o = new Object3D();
    applyRiverItemTransform(o, prepared, T0 + 10, false, s);
    const first = [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z];
    expect(o.rotation.order).toBe(RIVER_ITEM_EULER_ORDER);
    applyRiverItemTransform(o, prepared, T0 + 90_000, false, s);
    applyRiverItemTransform(o, prepared, T0 + 10, false, s);
    expect([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z]).toEqual(first);
  });
});
