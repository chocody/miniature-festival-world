import type { EffectKind, EffectPoolCaps } from "@/config/performance.config";
import { createObjectPool, type ObjectPool } from "./objectPool";

/** Ripple centre in the world-view group's local x/z. Render-time only — NEVER persisted or sent (invariant A). */
export interface RippleState {
  x: number;
  z: number;
}
/** Index into the scene layout's lamps. */
export interface LampGlowState {
  lampIndex: number;
}

export interface ObjectPoolManager {
  readonly ripple: ObjectPool<RippleState>;
  readonly glow: ObjectPool<LampGlowState>;
  activeCount(kind: EffectKind): number;
  releaseAll(): void;
}

/** One pool per effect kind, sized from the tier caps (EFFECT_POOL_CAPS[tier]). */
export function createObjectPoolManager(caps: EffectPoolCaps): ObjectPoolManager {
  const ripple = createObjectPool<RippleState>(caps.ripple, () => ({ x: 0, z: 0 }));
  const glow = createObjectPool<LampGlowState>(caps.glow, () => ({ lampIndex: 0 }));
  return {
    ripple,
    glow,
    activeCount(kind) {
      switch (kind) {
        case "ripple":
          return ripple.activeCount;
        case "glow":
          return glow.activeCount;
      }
    },
    releaseAll() {
      ripple.releaseAll();
      glow.releaseAll();
    },
  };
}
