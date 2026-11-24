import type { SplinePathCoord } from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";

const MS_PER_SECOND = 1000; // open question 6: speedFactor is progress per second, createdAt is epoch ms

/** Stable empty pin list (memo-friendly default). */
export const NO_PINNED_RIVER_IDS: readonly string[] = Object.freeze([]);

/**
 * Time-invariant "phase" of a river item: where it would have been at epoch 0, wrap01(spawn − createdAt[s] × speed).
 * All krathongs drift at RIVER_DRIFT_SPEED_FACTOR (owner decision 25), so phase order = order along the lane at ANY moment,
 * and it never changes while they drift. Pure, + − × ÷ % only (bit-identical across clients).
 */
export function riverPhaseOf(coord: SplinePathCoord, createdAtMs: number): number {
  return wrap01(coord.spawnProgress - (createdAtMs / MS_PER_SECOND) * coord.speedFactor);
}

/**
 * Which river items to RENDER when the tier cap is below the zone size (MFW-24 perf review). Deterministic and time-invariant:
 * 1) pinned ids present in `items` (e.g. the Find My target) first, in `items` order, up to `cap`;
 * 2) the remaining slots are spread evenly along the lane: sort the rest by (phase asc, id asc), take indices ⌊i·n/m⌋.
 * Returns `items` itself (same reference) when items.length <= cap; otherwise a frozen subset in the original `items` order.
 * Hidden items stay in the store, so Find My can still locate them (getRiverItemPositionAt) and pin them.
 */
export function selectVisibleRiverItems<
  T extends { readonly id: string; readonly coord: SplinePathCoord; readonly createdAtMs: number },
>(items: readonly T[], cap: number, pinnedIds: readonly string[] = NO_PINNED_RIVER_IDS): readonly T[] {
  if (!Number.isSafeInteger(cap) || cap <= 0) return Object.freeze([]) as readonly T[];
  if (items.length <= cap) return items;
  const pinned = new Set(pinnedIds);
  const chosen = new Set<string>();
  for (const it of items) if (chosen.size < cap && pinned.has(it.id)) chosen.add(it.id);
  const rest = items
    .filter((it) => !chosen.has(it.id))
    .map((it) => ({ id: it.id, phase: riverPhaseOf(it.coord, it.createdAtMs) }));
  rest.sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const m = cap - chosen.size;
  const n = rest.length;
  for (let i = 0; i < m; i++) chosen.add(rest[Math.floor((i * n) / m)].id);
  return Object.freeze(items.filter((it) => chosen.has(it.id)));
}
