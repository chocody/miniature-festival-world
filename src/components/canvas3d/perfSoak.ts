import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { PERF_SOAK_LATERAL_OFFSETS } from "@/config/perfProbe.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { KrathongAppearance } from "@/core/customization";
import { diffRendererSamples, type RendererSample, type RendererSampleDelta } from "./perfProbe";
import type { RiverFlowItem } from "./RiverFlow";

/** Varied but deterministic: over any 6 consecutive k every krathong bucket is used; every rim socket holds a flower (worst case). */
export function perfSoakAppearance(k: number): KrathongAppearance {
  return Object.freeze({
    base: KRATHONG_BASE_IDS[k % KRATHONG_BASE_IDS.length],
    lotusFold: LEAF_FOLD_STYLE_IDS[k % LEAF_FOLD_STYLE_IDS.length],
    leafColor: LEAF_COLOR_PALETTE[k % LEAF_COLOR_PALETTE.length],
    flowers: Object.freeze(Array.from({ length: RIM_SOCKET_COUNT }, (_, s) => FLOWER_KINDS[(k + s) % FLOWER_KINDS.length])),
    candleColor: CANDLE_COLOR_PALETTE[k % CANDLE_COLOR_PALETTE.length],
  });
}

/** `zoneCount` synthetic zones of `itemsPerZone` items each. Diagnostic data held in memory only, never persisted or sent. */
export function buildPerfSoakZones(
  zoneCount: number,
  itemsPerZone: number,
  createdAtMs: number,
): readonly (readonly RiverFlowItem[])[] {
  if (!Number.isSafeInteger(zoneCount) || zoneCount < 1) throw new RangeError("zoneCount must be an integer >= 1");
  if (!Number.isSafeInteger(itemsPerZone) || itemsPerZone < 0 || itemsPerZone > ZONE_ITEM_CAP) {
    throw new RangeError("itemsPerZone must be an integer in [0, ZONE_ITEM_CAP]");
  }
  if (!Number.isFinite(createdAtMs)) throw new RangeError("createdAtMs must be finite");
  const rows = PERF_SOAK_LATERAL_OFFSETS.length;
  const columns = Math.ceil(itemsPerZone / rows);
  const zones: (readonly RiverFlowItem[])[] = [];
  for (let z = 0; z < zoneCount; z++) {
    const items: RiverFlowItem[] = [];
    for (let i = 0; i < itemsPerZone; i++) {
      const col = Math.floor(i / rows);
      items.push(
        Object.freeze({
          id: `perf-soak-${z}-${i}`,
          coord: Object.freeze({
            mode: "SPLINE_PATH" as const,
            laneId: LOY_KRATHONG_RIVER_LANE_ID,
            spawnProgress: (2 * col + 1) / (2 * columns),
            speedFactor: RIVER_DRIFT_SPEED_FACTOR,
            lateralOffset: PERF_SOAK_LATERAL_OFFSETS[i % rows],
          }),
          createdAtMs,
          appearance: perfSoakAppearance(z * itemsPerZone + i),
        }),
      );
    }
    zones.push(Object.freeze(items));
  }
  return Object.freeze(zones);
}

export interface PerfSoakResult {
  readonly switches: number;
  readonly before: RendererSample | null;
  readonly after: RendererSample | null;
  readonly delta: RendererSampleDelta | null;
}

export interface PerfSoakOptions {
  readonly zones: readonly (readonly RiverFlowItem[])[]; // length >= 1
  readonly switches: number; // >= 1 and a multiple of zones.length
  readonly dwellMs: number; // > 0
  readonly setItems: (items: readonly RiverFlowItem[] | null) => void; // null = give the river back to the store
  readonly sample: () => RendererSample | null;
  readonly schedule: (callback: () => void, delayMs: number) => () => void; // returns cancel
  readonly onProgress?: (completedSwitches: number, totalSwitches: number) => void;
  readonly onCancel?: () => void;
  readonly onDone: (result: PerfSoakResult) => void;
}

export interface PerfSoakRunner {
  start(): void;
  cancel(): void;
  isRunning(): boolean;
}

export function createPerfSoakRunner(options: PerfSoakOptions): PerfSoakRunner {
  const { zones, switches, dwellMs, setItems, sample, schedule, onProgress, onCancel, onDone } = options;
  if (zones.length < 1) throw new RangeError("zones must not be empty");
  if (!Number.isSafeInteger(switches) || switches < 1 || switches % zones.length !== 0) {
    throw new RangeError("switches must be a positive multiple of zones.length");
  }
  if (!Number.isFinite(dwellMs) || dwellMs <= 0) throw new RangeError("dwellMs must be > 0");
  const total = zones.length + switches;
  let running = false;
  let shown = 0;
  let cancelTimer: (() => void) | null = null;
  let before: RendererSample | null = null;

  function showNext() {
    setItems(zones[shown % zones.length]);
    shown += 1;
    cancelTimer = schedule(afterDwell, dwellMs);
  }

  function afterDwell() {
    cancelTimer = null;
    if (shown === zones.length) before = sample(); // end of the warm-up: every zone was shown once
    if (shown > zones.length) onProgress?.(shown - zones.length, switches);
    if (shown === total) {
      const after = sample();
      running = false;
      setItems(null);
      onDone({ switches, before, after, delta: before && after ? diffRendererSamples(before, after) : null });
      return;
    }
    showNext();
  }

  return {
    start() {
      if (running) return;
      running = true;
      shown = 0;
      before = null;
      showNext();
    },
    cancel() {
      if (!running) return;
      cancelTimer?.();
      cancelTimer = null;
      running = false;
      setItems(null);
      onCancel?.();
    },
    isRunning: () => running,
  };
}
