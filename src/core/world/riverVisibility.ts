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
 * 1) base pick: spread evenly along the lane over ALL items, sorted by (phase asc, id asc), indices floor(i*n/cap). Pins never move it;
 * 2) each pinned id present in `items` (e.g. the Find My target) that is not in the base replaces the NEAREST unpinned base pick
 *    (circular distance in phase order, tie goes to the lower index). Pinning k ids changes at most k unpinned picks (MFW-30).
 * Returns `items` itself (same reference) when items.length <= cap; otherwise a frozen subset in the original `items` order.
 * Hidden items stay in the store, so Find My can still locate them (getRiverItemPositionAt) and pin them.
 */
export function selectVisibleRiverItems<
  T extends { readonly id: string; readonly coord: SplinePathCoord; readonly createdAtMs: number },
>(items: readonly T[], cap: number, pinnedIds: readonly string[] = NO_PINNED_RIVER_IDS): readonly T[] {
  if (!Number.isSafeInteger(cap) || cap <= 0) return Object.freeze([]) as readonly T[];
  if (items.length <= cap) return items;
  const sorted = items
    .map((it) => ({ id: it.id, phase: riverPhaseOf(it.coord, it.createdAtMs) }))
    .sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = sorted.length;
  const chosen = new Set<number>(); // indices into `sorted`
  for (let i = 0; i < cap; i++) chosen.add(Math.floor((i * n) / cap));
  const pinned = new Set(pinnedIds);
  const indexOf = new Map(sorted.map((s, k) => [s.id, k] as const));
  const pins: number[] = [];
  for (const it of items) {
    if (pins.length >= cap) break;
    if (!pinned.has(it.id)) continue;
    const k = indexOf.get(it.id);
    if (k !== undefined && !pins.includes(k)) pins.push(k);
  }
  const pinSet = new Set(pins);
  for (const p of pins) {
    if (chosen.has(p)) continue;
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of chosen) {
      if (pinSet.has(c)) continue;
      const d = Math.abs(c - p);
      const dist = Math.min(d, n - d);
      if (dist < bestDist || (dist === bestDist && c < best)) {
        best = c;
        bestDist = dist;
      }
    }
    chosen.delete(best); // always found: unpinned picks >= pins still missing (|pins| <= cap)
    chosen.add(p);
  }
  const ids = new Set([...chosen].map((k) => sorted[k].id));
  return Object.freeze(items.filter((it) => ids.has(it.id)));
}
