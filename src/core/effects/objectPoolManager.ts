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
/** Index into the scene layout's lamps, in stretch `stretchIndex` of the endless river (MFW-58; drawn at + s·T). Render-time only. */
export interface LampGlowState {
  lampIndex: number;
  stretchIndex: number;
}
/**
 * A tapped object that moves (MFW-60): kind + its stable layout index (villagers: villagerId) + the stretch copy it belongs to
 * (MFW-58: each stretch's readers filter by it). Render-time only.
 */
export interface NudgeState {
  kind: NudgeTargetKind;
  index: number;
  stretchIndex: number;
}
/**
 * Index into the scene layout's houses (its windows are houseWindows[houseIndex · windowsPerHouse + w]), in stretch `stretchIndex`
 * (MFW-58; drawn at + s·T). Render-time only.
 */
export interface WindowGlowState {
  houseIndex: number;
  stretchIndex: number;
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

/**
 * Index into the scene layout's houses whose roof puffs smoke (MFW-72), in stretch `stretchIndex` (drawn at + s·T). Render-time only —
 * NEVER persisted or sent (invariant A).
 */
export interface ChimneySmokeState {
  houseIndex: number;
  stretchIndex: number;
  /** Horizontal drift chosen at tap time (writeSmokeDriftInto: toward the middle of the screen). */
  driftX: number;
  driftZ: number;
}
/**
 * Index into the scene layout's trees whose leaves fall (MFW-72), in stretch `stretchIndex` (drawn at + s·T). Render-time only —
 * NEVER persisted or sent (invariant A).
 */
export interface FallingLeavesState {
  treeIndex: number;
  stretchIndex: number;
}

export interface ObjectPoolManager {
  readonly ripple: ObjectPool<RippleState>;
  readonly glow: ObjectPool<LampGlowState>;
  readonly nudge: ObjectPool<NudgeState>;
  readonly windowGlow: ObjectPool<WindowGlowState>;
  readonly firework: ObjectPool<FireworkState>;
  readonly skyLantern: ObjectPool<SkyLanternState>;
  readonly chimneySmoke: ObjectPool<ChimneySmokeState>;
  readonly fallingLeaves: ObjectPool<FallingLeavesState>;
  activeCount(kind: EffectKind): number;
  releaseAll(): void;
}

/** One pool per effect kind, sized from the tier caps (EFFECT_POOL_CAPS[tier]). */
export function createObjectPoolManager(caps: EffectPoolCaps): ObjectPoolManager {
  const ripple = createObjectPool<RippleState>(caps.ripple, () => ({ x: 0, z: 0 }));
  const glow = createObjectPool<LampGlowState>(caps.glow, () => ({ lampIndex: 0, stretchIndex: 0 }));
  const nudge = createObjectPool<NudgeState>(caps.nudge, () => ({ kind: "tree", index: 0, stretchIndex: 0 }));
  const windowGlow = createObjectPool<WindowGlowState>(caps.windowGlow, () => ({ houseIndex: 0, stretchIndex: 0 }));
  const firework = createObjectPool<FireworkState>(caps.firework, () => ({ x: 0, y: 0, z: 0, paletteIndex: 0 }));
  const skyLantern = createObjectPool<SkyLanternState>(caps.skyLantern, () => ({ x: 0, y: 0, z: 0 }));
  const chimneySmoke = createObjectPool<ChimneySmokeState>(caps.chimneySmoke, () => ({ houseIndex: 0, stretchIndex: 0, driftX: 1, driftZ: 0 }));
  const fallingLeaves = createObjectPool<FallingLeavesState>(caps.fallingLeaves, () => ({ treeIndex: 0, stretchIndex: 0 }));
  return {
    ripple,
    glow,
    nudge,
    windowGlow,
    firework,
    skyLantern,
    chimneySmoke,
    fallingLeaves,
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
        case "chimneySmoke":
          return chimneySmoke.activeCount;
        case "fallingLeaves":
          return fallingLeaves.activeCount;
      }
    },
    releaseAll() {
      ripple.releaseAll();
      glow.releaseAll();
      nudge.releaseAll();
      windowGlow.releaseAll();
      firework.releaseAll();
      skyLantern.releaseAll();
      chimneySmoke.releaseAll();
      fallingLeaves.releaseAll();
    },
  };
}
