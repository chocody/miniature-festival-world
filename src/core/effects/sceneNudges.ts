import {
  REDUCED_MOTION_TAP_CUE,
  TAP_BOUNCE_LOOKS,
  TAP_SHAKE_LOOKS,
  VILLAGER_TAP_HOP,
  type NudgeTargetKind,
} from "@/config/gimmicks.config";
import type { ObjectPool, PooledEntry } from "./objectPool";
import type { NudgeState } from "./objectPoolManager";

/**
 * MFW-60: the shared "nudge" pool. A tapped tree, bush, reed, rock, pier or villager gets one entry; the owner of each mesh
 * (foliage, PropNudges, villagers) reads the pool on its own frames and writes its own instances. Render-time only.
 */
export interface NudgeSource {
  readonly pool: ObjectPool<NudgeState>;
  /** The one effect clock (SceneEffects' SCENE_EFFECT_CLOCK), ms. */
  readonly now: () => number;
  /** MFW-58: the stretch copy whose meshes read this source (each stretch slot passes its own); default 0. */
  readonly stretchIndex?: number;
}

/** First ACTIVE entry with this kind, index and stretch (slot order), or null. Allocation-free, scans pool.capacity. */
export function findNudgeEntry(
  pool: ObjectPool<NudgeState>,
  kind: NudgeTargetKind,
  index: number,
  stretchIndex: number = 0,
): PooledEntry<NudgeState> | null {
  if (pool.activeCount === 0) return null;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (e.active && e.state.kind === kind && e.state.index === index && e.state.stretchIndex === stretchIndex) return e;
  }
  return null;
}

/**
 * Duration of a nudge: reduced motion → REDUCED_MOTION_TAP_CUE.holdMs; shake → TAP_SHAKE_LOOKS[kind].durationMs;
 * bounce → TAP_BOUNCE_LOOKS[kind].durationMs; hop → VILLAGER_TAP_HOP.durationMs.
 */
export function nudgeDurationMs(kind: NudgeTargetKind, reducedMotion: boolean): number {
  if (reducedMotion) return REDUCED_MOTION_TAP_CUE.holdMs;
  switch (kind) {
    case "tree":
    case "bush":
    case "reed":
      return TAP_SHAKE_LOOKS[kind].durationMs;
    case "rock":
    case "pier":
      return TAP_BOUNCE_LOOKS[kind].durationMs;
    case "villager":
      return VILLAGER_TAP_HOP.durationMs;
  }
}

/** Releases every active entry with nowMs − startedAtMs ≥ nudgeDurationMs(kind, reducedMotion); returns how many. Allocation-free. */
export function releaseExpiredNudges(pool: ObjectPool<NudgeState>, nowMs: number, reducedMotion: boolean): number {
  if (pool.activeCount === 0) return 0;
  let released = 0;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    if (nowMs - e.startedAtMs >= nudgeDurationMs(e.state.kind, reducedMotion)) {
      pool.release(e);
      released++;
    }
  }
  return released;
}

/**
 * Re-tapping an object that is already nudged (same kind, index and stretch) restarts its entry (startedAtMs = nowMs); otherwise
 * acquire(nowMs) (oldest recycled). The pool is one per canvas: its cap bounds the nudges of every stretch together (invariant E).
 */
export function startNudge(
  pool: ObjectPool<NudgeState>,
  kind: NudgeTargetKind,
  index: number,
  nowMs: number,
  stretchIndex: number = 0,
): void {
  const existing = findNudgeEntry(pool, kind, index, stretchIndex);
  if (existing !== null) {
    existing.startedAtMs = nowMs;
    return;
  }
  const e = pool.acquire(nowMs);
  e.state.kind = kind;
  e.state.index = index;
  e.state.stretchIndex = stretchIndex;
}

/**
 * Glow re-trigger that never dips (WCAG 2.3.1): an active entry gets startedAtMs = nowMs − min(nowMs − startedAtMs, attackMs), so a
 * glow already past its attack stays at the hold level and one still in its attack keeps rising from where it is.
 */
export function retriggerGlow(entry: PooledEntry<unknown>, nowMs: number, attackMs: number): void {
  const age = nowMs - entry.startedAtMs;
  const kept = Number.isFinite(age) && age > 0 ? Math.min(age, attackMs) : 0;
  entry.startedAtMs = nowMs - kept;
}
