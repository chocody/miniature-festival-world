import { describe, expect, it, vi } from "vitest";
import { PERF_SOAK_LATERAL_OFFSETS } from "@/config/perfProbe.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { parsePersistableCoord } from "@/core/coordinates";
import { KRATHONG_INSTANCE_BUCKET_COUNT, parseKrathongAppearance } from "@/core/customization";
import { planKrathongInstances } from "@/components/models/loyKrathong/riverKrathongBatch";
import { readRendererSample, type RendererSample } from "./perfProbe";
import { buildPerfSoakZones, createPerfSoakRunner, perfSoakAppearance } from "./perfSoak";
import type { RiverFlowItem } from "./RiverFlow";

const T = 1_700_000_000_000;

describe("buildPerfSoakZones", () => {
  it("builds valid, unique, in-range items that exercise every bucket", () => {
    const zones = buildPerfSoakZones(2, ZONE_ITEM_CAP, T);
    expect(zones).toHaveLength(2);
    const ids = new Set<string>();
    for (const zone of zones) {
      expect(zone).toHaveLength(ZONE_ITEM_CAP);
      for (const item of zone) {
        ids.add(item.id);
        expect(parsePersistableCoord(item.coord).ok).toBe(true);
        expect(parseKrathongAppearance(item.appearance).ok).toBe(true);
        expect(PERF_SOAK_LATERAL_OFFSETS).toContain(item.coord.lateralOffset);
        expect(item.coord.spawnProgress).toBeGreaterThan(0);
        expect(item.coord.spawnProgress).toBeLessThan(1);
      }
      const plan = planKrathongInstances(zone.map((i) => i.appearance));
      expect(plan.bucketCounts).toHaveLength(KRATHONG_INSTANCE_BUCKET_COUNT);
      for (const c of plan.bucketCounts) expect(c).toBeGreaterThan(0);
    }
    expect(ids.size).toBe(2 * ZONE_ITEM_CAP);
  });

  it("is deterministic per k and frozen", () => {
    expect(perfSoakAppearance(7)).toEqual(perfSoakAppearance(7));
    expect(Object.isFrozen(perfSoakAppearance(7).flowers)).toBe(true);
  });

  it("rejects bad arguments", () => {
    expect(() => buildPerfSoakZones(0, 5, T)).toThrow(RangeError);
    expect(() => buildPerfSoakZones(1, ZONE_ITEM_CAP + 1, T)).toThrow(RangeError);
    expect(() => buildPerfSoakZones(1, 5, Number.NaN)).toThrow(RangeError);
  });
});

function harness(switches = 4) {
  const zoneA: readonly RiverFlowItem[] = buildPerfSoakZones(1, 1, T)[0];
  const zoneB: readonly RiverFlowItem[] = buildPerfSoakZones(2, 1, T)[1];
  const queue: { cb: () => void; cancelled: boolean }[] = [];
  const setItems = vi.fn();
  const mk = (calls: number): RendererSample =>
    readRendererSample({ info: { memory: { geometries: 4, textures: 0 }, render: { calls, triangles: 1, frame: calls }, programs: [{}] } }, 0, null)!;
  let n = 0;
  const sample = vi.fn(() => mk(10 + 0 * n++));
  const onDone = vi.fn();
  const onProgress = vi.fn();
  const onCancel = vi.fn();
  const runner = createPerfSoakRunner({
    zones: [zoneA, zoneB],
    switches,
    dwellMs: 10,
    setItems,
    sample,
    schedule: (cb) => {
      const entry = { cb, cancelled: false };
      queue.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    onProgress,
    onCancel,
    onDone,
  });
  const runNext = () => {
    const e = queue.shift();
    if (e && !e.cancelled) e.cb();
  };
  return { zoneA, zoneB, queue, setItems, sample, onDone, onProgress, onCancel, runner, runNext };
}

describe("createPerfSoakRunner", () => {
  it("alternates zones, samples before/after and reports progress", () => {
    const h = harness();
    h.runner.start();
    expect(h.runner.isRunning()).toBe(true);
    while (h.queue.length > 0) h.runNext();
    expect(h.setItems.mock.calls.map((c) => c[0])).toEqual([h.zoneA, h.zoneB, h.zoneA, h.zoneB, h.zoneA, h.zoneB, null]);
    expect(h.sample).toHaveBeenCalledTimes(2);
    expect(h.onProgress.mock.calls).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    const result = h.onDone.mock.calls[0][0];
    expect(result.switches).toBe(4);
    expect(result.delta.geometries).toBe(0);
    expect(h.runner.isRunning()).toBe(false);
  });

  it("cancel stops the run without onDone; start while running does nothing", () => {
    const h = harness();
    h.runner.start();
    h.runner.start();
    expect(h.setItems).toHaveBeenCalledTimes(1);
    h.runNext();
    h.runner.cancel();
    expect(h.setItems).toHaveBeenLastCalledWith(null);
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    while (h.queue.length > 0) h.runNext();
    expect(h.onDone).not.toHaveBeenCalled();
    expect(h.runner.isRunning()).toBe(false);
  });

  it("rejects a switch count that is not a multiple of the zone count", () => {
    expect(() => harness(3)).toThrow(RangeError);
  });
});
