// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { currentProgress, type SplinePathCoord } from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";
import { riverPhaseOf, selectVisibleRiverItems } from "./riverVisibility";

const T0 = 1_700_000_000_000;
interface Item {
  readonly id: string;
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number;
}
const item = (id: string, spawnProgress: number, createdAtMs = T0): Item => ({
  id,
  coord: {
    mode: "SPLINE_PATH",
    laneId: LOY_KRATHONG_RIVER_LANE_ID,
    spawnProgress,
    speedFactor: RIVER_DRIFT_SPEED_FACTOR,
    lateralOffset: 0,
  },
  createdAtMs,
});
const many = (n: number): Item[] => Array.from({ length: n }, (_, k) => item(`id-${String(k).padStart(3, "0")}`, k / n));
const ids = (xs: readonly Item[]) => xs.map((x) => x.id);

describe("selectVisibleRiverItems", () => {
  it("returns the same array when it fits; empty for a bad cap", () => {
    const items = many(5);
    expect(selectVisibleRiverItems(items, 5)).toBe(items);
    expect(selectVisibleRiverItems(items, 80)).toBe(items);
    for (const cap of [0, -1, 1.5, Number.NaN]) expect(selectVisibleRiverItems(items, cap)).toEqual([]);
  });
  it("caps, keeps input order, frozen", () => {
    const items = many(80);
    const out = selectVisibleRiverItems(items, 24);
    expect(out).toHaveLength(24);
    const order = ids(out).map((id) => ids(items).indexOf(id));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(Object.isFrozen(out)).toBe(true);
  });
  it("is deterministic", () => {
    const items = many(80);
    expect(ids(selectVisibleRiverItems(items, 24))).toEqual(ids(selectVisibleRiverItems(items, 24)));
    const shuffled = [...items].reverse();
    expect(new Set(ids(selectVisibleRiverItems(shuffled, 24)))).toEqual(new Set(ids(selectVisibleRiverItems(items, 24))));
  });
  it("is time-invariant (owner decision 25)", () => {
    const a = item("a", 0.1, T0);
    const b = item("b", 0.4, T0 + 10_000);
    const diffAt = (now: number) => wrap01(currentProgress(b.coord, b.createdAtMs, now) - currentProgress(a.coord, a.createdAtMs, now));
    const expected = wrap01(riverPhaseOf(b.coord, b.createdAtMs) - riverPhaseOf(a.coord, a.createdAtMs));
    expect(Math.abs(diffAt(T0 + 20_000) - diffAt(T0 + 3_600_000))).toBeLessThan(1e-9);
    expect(Math.abs(diffAt(T0 + 20_000) - expected)).toBeLessThan(1e-9);
  });
  it("spreads evenly along the lane", () => {
    const items = many(80);
    const out = selectVisibleRiverItems(items, 24);
    const phases = out.map((i) => riverPhaseOf(i.coord, i.createdAtMs)).sort((x, y) => x - y);
    const limit = Math.ceil(80 / 24) / 80 + 1e-9;
    for (let i = 0; i < phases.length; i++) {
      const next = i + 1 < phases.length ? phases[i + 1] : phases[0] + 1;
      expect(next - phases[i]).toBeLessThanOrEqual(limit);
    }
  });
  it("always shows pinned ids", () => {
    const items = many(80);
    const base = new Set(ids(selectVisibleRiverItems(items, 24)));
    const hidden = items.find((i) => !base.has(i.id))!;
    const out = selectVisibleRiverItems(items, 24, [hidden.id, "unknown"]);
    expect(ids(out)).toContain(hidden.id);
    expect(out).toHaveLength(24);
    const pins = items.slice(0, 30).map((i) => i.id);
    const many30 = selectVisibleRiverItems(items, 24, [...pins].reverse());
    expect(ids(many30)).toEqual(pins.slice(0, 24));
  });
  it("orders ties by id", () => {
    const items = [item("b", 0.5), item("a", 0.5), item("c", 0.5)];
    expect(ids(selectVisibleRiverItems(items, 1))).toEqual(["a"]);
    expect(ids(selectVisibleRiverItems([...items].reverse(), 1))).toEqual(["a"]);
  });
});
