/** One pre-allocated pool slot. `state` is mutated in place by the caller; nothing is allocated after creation. */
export interface PooledEntry<T> {
  readonly slot: number;
  readonly state: T;
  active: boolean;
  startedAtMs: number;
}

export interface ObjectPool<T> {
  readonly capacity: number;
  /** Number of active entries (0..capacity). */
  readonly activeCount: number;
  /** Entry at slot 0..capacity-1 (active or not). Out of range → RangeError. Use it for allocation-free iteration. */
  entryAt(slot: number): PooledEntry<T>;
  /** A free entry, or, when every entry is active, the OLDEST one (smallest startedAtMs; tie → lowest slot), recycled. Never null. */
  acquire(nowMs: number): PooledEntry<T>;
  /** Marks the entry inactive. Releasing an inactive entry or one of another pool is a no-op. */
  release(entry: PooledEntry<T>): void;
  releaseAll(): void;
}

/** capacity must be a positive integer (else RangeError). createState(slot) runs exactly `capacity` times, here, never later. */
export function createObjectPool<T>(capacity: number, createState: (slot: number) => T): ObjectPool<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("ObjectPool capacity must be a positive integer");
  }
  const entries: PooledEntry<T>[] = Array.from({ length: capacity }, (_, slot) => ({
    slot,
    state: createState(slot),
    active: false,
    startedAtMs: 0,
  }));
  let active = 0;

  return {
    capacity,
    get activeCount() {
      return active;
    },
    entryAt(slot) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= capacity) throw new RangeError("ObjectPool slot out of range");
      return entries[slot];
    },
    acquire(nowMs) {
      let chosen: PooledEntry<T> | null = null;
      for (let i = 0; i < capacity; i++) {
        if (!entries[i].active) {
          chosen = entries[i];
          break;
        }
      }
      if (chosen === null) {
        chosen = entries[0];
        for (let i = 1; i < capacity; i++) {
          if (entries[i].startedAtMs < chosen.startedAtMs) chosen = entries[i];
        }
      }
      if (!chosen.active) active++;
      chosen.active = true;
      chosen.startedAtMs = Number.isFinite(nowMs) ? nowMs : 0;
      return chosen;
    },
    release(entry) {
      if (entries[entry.slot] !== entry || !entry.active) return;
      entry.active = false;
      active--;
    },
    releaseAll() {
      for (let i = 0; i < capacity; i++) entries[i].active = false;
      active = 0;
    },
  };
}
