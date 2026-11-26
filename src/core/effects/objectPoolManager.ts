import type { NudgeTargetKind } from "@/config/gimmicks.config";
import type { EffectKind, EffectPoolCaps } from "@/config/performance.config";
import { createObjectPool, type ObjectPool } from "./objectPool";

/*
 * Every pooled state below is render-time only: it is derived from the scene layout and the tap, and is NEVER persisted, sent or
 * stored (invariant A).
 */

/** Ripple centre in the world-view group's local x/z. Render-time only — NEVER persisted or sent (invariant A). */
export interface RippleState {
  x: number;
  z: number;
}
/** Index into the scene layout's lamps. */
export interface LampGlowState {
  lampIndex: number;
}
/** A tapped object that moves (MFW-60): kind + its stable layout index (villagers: villagerId). Render-time only. */
export interface NudgeState {
  kind: NudgeTargetKind;
  index: number;
}
/** Index into the scene layout's houses (its windows are houseWindows[houseIndex · windowsPerHouse + w]). Render-time only. */
export interface WindowGlowState {
  houseIndex: number;
}
/** Launch point in the world-view group's space + palette start. Render-time only — NEVER persisted or sent (invariant A). */
export interface FireworkState {
  x: number;
  y: number;
  z: number;
  paletteIndex: number;
}
/** Lamp head the sky lantern rises from, in the world-view group's space. Render-time only — NEVER persisted or sent (invariant A). */
export interface SkyLanternState {
  x: number;
  y: number;
  z: number;
}

export interface ObjectPoolManager {
  readonly ripple: ObjectPool<RippleState>;
  readonly glow: ObjectPool<LampGlowState>;
  readonly nudge: ObjectPool<NudgeState>;
  readonly windowGlow: ObjectPool<WindowGlowState>;
  readonly firework: ObjectPool<FireworkState>;
  readonly skyLantern: ObjectPool<SkyLanternState>;
  activeCount(kind: EffectKind): number;
  releaseAll(): void;
}

/** One pool per effect kind, sized from the tier caps (EFFECT_POOL_CAPS[tier]). */
export function createObjectPoolManager(caps: EffectPoolCaps): ObjectPoolManager {
  const ripple = createObjectPool<RippleState>(caps.ripple, () => ({ x: 0, z: 0 }));
  const glow = createObjectPool<LampGlowState>(caps.glow, () => ({ lampIndex: 0 }));
  const nudge = createObjectPool<NudgeState>(caps.nudge, () => ({ kind: "tree", index: 0 }));
  const windowGlow = createObjectPool<WindowGlowState>(caps.windowGlow, () => ({ houseIndex: 0 }));
  const firework = createObjectPool<FireworkState>(caps.firework, () => ({ x: 0, y: 0, z: 0, paletteIndex: 0 }));
  const skyLantern = createObjectPool<SkyLanternState>(caps.skyLantern, () => ({ x: 0, y: 0, z: 0 }));
  return {
    ripple,
    glow,
    nudge,
    windowGlow,
    firework,
    skyLantern,
    activeCount(kind) {
      switch (kind) {
        case "ripple":
          return ripple.activeCount;
        case "glow":
          return glow.activeCount;
        case "nudge":
          return nudge.activeCount;
        case "windowGlow":
          return windowGlow.activeCount;
        case "firework":
          return firework.activeCount;
        case "skyLantern":
          return skyLantern.activeCount;
      }
    },
    releaseAll() {
      ripple.releaseAll();
      glow.releaseAll();
      nudge.releaseAll();
      windowGlow.releaseAll();
      firework.releaseAll();
      skyLantern.releaseAll();
    },
  };
}
