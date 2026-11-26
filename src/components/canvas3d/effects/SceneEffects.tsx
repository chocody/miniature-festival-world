"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { Vector3, type Camera } from "three";
import {
  FIREWORK_LOOK,
  FIREWORK_MIN_LAUNCH_INTERVAL_MS,
  LAMP_GLOW_LOOK,
  NUDGE_TARGET_KINDS,
  SCENE_TAP_REACTIONS,
  WINDOW_GLOW_LOOK,
  type NudgeTargetKind,
  type SceneGimmickKind,
  type SceneTargetKind,
} from "@/config/gimmicks.config";
import type { LightPresetId } from "@/config/look.config";
import type { EffectKind } from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import type { WorldVec3, WorldXZ } from "@/core/coordinates";
import type { EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import {
  chimneySmokeEmitMs,
  fallingLeavesEmitMs,
  releaseExpiredNudges,
  retriggerGlow,
  startNudge,
  writeSmokeDriftInto,
  type ObjectPoolManager,
  type SmokeDrift,
} from "@/core/effects";
import type { InstanceTransform } from "@/core/world";
import type { TreeLeafAnchor } from "./sceneEffectAnchors";
import {
  createChimneySmokeMesh,
  createFallingLeafMesh,
  writeChimneySmokeInstances,
  writeFallingLeafInstances,
  createEffectFrameScratch,
  createFireworkMesh,
  createLampGlowMesh,
  createRippleMesh,
  createSkyLanternMesh,
  createWindowGlowMesh,
  disposeEffectMesh,
  writeFireworkInstances,
  writeLampGlowInstances,
  writeRippleInstances,
  writeSkyLanternInstances,
  writeWindowGlowInstances,
} from "./effectMeshes";

/** Kinds recorded on the scene section's data-last-gimmick attribute (tests/e2e). */
export type { SceneGimmickKind } from "@/config/gimmicks.config";

/** The ONE effect clock (ms). Every nudge consumer reads it through NudgeSource.now. */
export const SCENE_EFFECT_CLOCK = (): number => Date.now();

const isNudgeKind = (kind: SceneTargetKind): kind is NudgeTargetKind =>
  (NUDGE_TARGET_KINDS as readonly SceneTargetKind[]).includes(kind);
const isFiniteXZ = (at: WorldXZ | null): at is WorldXZ => at !== null && Number.isFinite(at.x) && Number.isFinite(at.z);

/** Tap-time scratch of the smoke drift (one per SceneEffects; never per tap or per frame). */
interface DriftScratch {
  readonly ndc: Vector3;
  readonly drift: SmokeDrift;
}

/** View aspect of the scene camera (orthographic frustum width / height); 1 when unknown. */
function cameraAspect(camera: Camera): number {
  const c = camera as Camera & { left?: number; right?: number; top?: number; bottom?: number; aspect?: number };
  if (c.left !== undefined && c.right !== undefined && c.top !== undefined && c.bottom !== undefined && c.top !== c.bottom) {
    return (c.right - c.left) / (c.top - c.bottom);
  }
  return c.aspect !== undefined && c.aspect > 0 ? c.aspect : 1;
}

/**
 * The drift of a smoke from world origin (x, y, z): toward the middle of the screen as seen by `camera` (writeSmokeDriftInto); no camera
 * (tests) → TAP_SHAKE_WIND. Writes into scratch.drift; allocation-free.
 */
function smokeDriftFromCamera(camera: Camera | undefined, x: number, y: number, z: number, scratch: DriftScratch): SmokeDrift {
  if (camera === undefined || camera === null) return writeSmokeDriftInto(0, 0, 1, 0, 0, 0, 0, 0, scratch.drift);
  camera.updateMatrixWorld();
  const ndc = scratch.ndc.set(x, y, z).project(camera);
  const e = camera.matrixWorld.elements; // column 0 = +X (right), column 2 = +Z (back, toward the viewer)
  return writeSmokeDriftInto(ndc.x, ndc.y, cameraAspect(camera), e[0], e[2], e[8], e[9], e[10], scratch.drift);
}

export interface SceneEffectsHandle {
  /** Starts a ripple at a world-view-group-local point (non-finite → ignored). Recycles the oldest when the pool is full. */
  spawnRipple(at: WorldXZ): void;
  /**
   * Lights lamp `lampIndex` of stretch copy `stretchIndex` (MFW-58, default 0); a lit lamp (same index and stretch) is re-triggered
   * without dipping (WCAG). Non-integer or out-of-range → ignored (false).
   */
  lightLamp(lampIndex: number, stretchIndex?: number): boolean;
  /** Lights the windows of house `houseIndex` of stretch `stretchIndex` (re-tap: stays lit). Out of range → false. */
  lightHouse(houseIndex: number, stretchIndex?: number): boolean;
  /**
   * A firework from a land point in world-view space (MFW-58: already includes the stretch offset; null / non-finite → false).
   * Launches closer than FIREWORK_MIN_LAUNCH_INTERVAL_MS are ignored.
   */
  launchFirework(at: WorldXZ | null): boolean;
  /** A sky lantern rises from lamp `lampIndex`'s head in stretch `stretchIndex` (+ s·T). Out of range → false. */
  releaseSkyLantern(lampIndex: number, stretchIndex?: number): boolean;
  /**
   * MFW-72: a smoke puff rises from house `houseIndex`'s roof in stretch `stretchIndex` (+ s·T). False under reduced motion (no
   * particles), for an index out of range or a non-safe-integer stretch. A re-tap on the same (house, stretch) while it is still
   * emitting (age < chimneySmokeEmitMs) is absorbed (true, nothing new).
   */
  puffChimneySmoke(houseIndex: number, stretchIndex?: number): boolean;
  /** MFW-72: a few leaves fall from tree `treeIndex` of stretch `stretchIndex`; same rules (absorbed until fallingLeavesEmitMs). */
  dropLeaves(treeIndex: number, stretchIndex?: number): boolean;
  /**
   * Registry dispatch (SCENE_TAP_REACTIONS[kind].effects); returns the reaction's gimmick when at least one effect started, else null.
   * index = layout index (villagers: villagerId); at = the tap point (water, sky) in world-view space; stretchIndex = the stretch copy
   * that was tapped (MFW-58, default 0; a non-safe integer → no effect, null). Krathong taps never come here (markCue: no-op).
   */
  react(kind: SceneTargetKind, index: number, at: WorldXZ | null, stretchIndex?: number): SceneGimmickKind | null;
  activeCount(kind: EffectKind): number;
}

export interface SceneEffectsProps {
  readonly handleRef: Ref<SceneEffectsHandle>;
  /** Created once per tier caps by ToyNightScene (MFW-60: the nudge pool is shared with the foliage, rocks, pier and villagers). */
  readonly pools: ObjectPoolManager;
  readonly reducedMotion: boolean;
  readonly waterSurfaceY: number;
  readonly lamps: readonly InstanceTransform[];
  readonly lampHead: ScenePartSpec;
  readonly houseWindows: readonly InstanceTransform[];
  readonly windowsPerHouse: number;
  readonly windowPart: ScenePartSpec;
  /** Launch height of a firework (the village terrace, layout.bankTopY). */
  readonly fireworkBaseY: number;
  /** FIREWORK_SPARKS_PER_BURST[tier]. */
  readonly fireworkSparks: number;
  /** MFW-72: smoke / leaf colours per light preset (the effect program is unlit). */
  readonly lightPreset: LightPresetId;
  /** MFW-72: one smoke origin per house (its roof top, stretch-0 world-view space). */
  readonly houseSmokeOrigins: readonly WorldVec3[];
  /** MFW-72: CHIMNEY_SMOKE_PUFFS_PER_TAP[tier]. */
  readonly smokePuffs: number;
  /** MFW-72: the precomputed leaf paths per tree (stretch-0 world-view space). */
  readonly treeLeafAnchors: readonly TreeLeafAnchor[];
  /** MFW-72: FALLING_LEAVES_PER_TAP[tier]. */
  readonly leavesPerFall: number;
  /** Clock in ms; default SCENE_EFFECT_CLOCK. Injectable for tests. */
  readonly now?: () => number;
  /**
   * MFW-58: the endless-river stretch frame; lamp / window glows and sky lanterns of stretch s are drawn at + s·T. The pools stay one
   * set per canvas (invariant E: their caps bound every stretch together). Null / absent = every stretch draws at offset 0.
   */
  readonly frame?: EndlessRiverFrame | null;
}

/**
 * Pooled tap effects (invariant E): one InstancedMesh per kind, created per cap, disposed on unmount / cap change, invisible (no draw
 * call) while idle. The demand frameloop is kept alive only while an effect runs, plus one tail frame after a nudge ends.
 */
export function SceneEffects({
  handleRef,
  pools,
  reducedMotion,
  waterSurfaceY,
  lamps,
  lampHead,
  houseWindows,
  windowsPerHouse,
  windowPart,
  fireworkBaseY,
  fireworkSparks,
  lightPreset,
  houseSmokeOrigins,
  smokePuffs,
  treeLeafAnchors,
  leavesPerFall,
  now = SCENE_EFFECT_CLOCK,
  frame = null,
}: SceneEffectsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => (state as { camera?: Camera }).camera);
  const ripple = useMemo(() => createRippleMesh(pools.ripple.capacity), [pools.ripple.capacity]);
  const glow = useMemo(() => createLampGlowMesh(pools.glow.capacity, lampHead.geometry), [pools.glow.capacity, lampHead.geometry]);
  const windows = useMemo(
    () => createWindowGlowMesh(pools.windowGlow.capacity, windowsPerHouse, windowPart.geometry),
    [pools.windowGlow.capacity, windowsPerHouse, windowPart.geometry],
  );
  const fireworks = useMemo(
    () => createFireworkMesh(pools.firework.capacity, fireworkSparks),
    [pools.firework.capacity, fireworkSparks],
  );
  const lanterns = useMemo(() => createSkyLanternMesh(pools.skyLantern.capacity), [pools.skyLantern.capacity]);
  const smoke = useMemo(
    () => createChimneySmokeMesh(pools.chimneySmoke.capacity, smokePuffs),
    [pools.chimneySmoke.capacity, smokePuffs],
  );
  const leaves = useMemo(
    () => createFallingLeafMesh(pools.fallingLeaves.capacity, leavesPerFall),
    [pools.fallingLeaves.capacity, leavesPerFall],
  );
  const scratch = useRef(createEffectFrameScratch());
  const driftScratch = useRef<DriftScratch | null>(null);
  const lastLaunchMs = useRef(-Infinity);
  const launchCounter = useRef(0);
  useEffect(() => () => disposeEffectMesh(ripple), [ripple]);
  useEffect(() => () => disposeEffectMesh(glow), [glow]);
  useEffect(() => () => disposeEffectMesh(windows), [windows]);
  useEffect(() => () => disposeEffectMesh(fireworks), [fireworks]);
  useEffect(() => () => disposeEffectMesh(lanterns), [lanterns]);
  useEffect(() => () => disposeEffectMesh(smoke), [smoke]);
  useEffect(() => () => disposeEffectMesh(leaves), [leaves]);
  useEffect(() => () => pools.releaseAll(), [pools]);

  useImperativeHandle(handleRef, () => {
    const houseCount = windowsPerHouse > 0 ? Math.floor(houseWindows.length / windowsPerHouse) : 0;
    const validLamp = (i: number) => Number.isInteger(i) && i >= 0 && i < lamps.length;
    const spawnRipple = (at: WorldXZ | null): boolean => {
      if (!isFiniteXZ(at)) return false;
      const entry = pools.ripple.acquire(now());
      entry.state.x = at.x;
      entry.state.z = at.z;
      invalidate();
      return true;
    };
    const lightLamp = (lampIndex: number, stretchIndex: number = 0): boolean => {
      if (!validLamp(lampIndex) || !Number.isSafeInteger(stretchIndex)) return false;
      const t = now();
      for (let s = 0; s < pools.glow.capacity; s++) {
        const e = pools.glow.entryAt(s);
        if (e.active && e.state.lampIndex === lampIndex && e.state.stretchIndex === stretchIndex) {
          retriggerGlow(e, t, LAMP_GLOW_LOOK.attackMs);
          invalidate();
          return true;
        }
      }
      const entry = pools.glow.acquire(t);
      entry.state.lampIndex = lampIndex;
      entry.state.stretchIndex = stretchIndex;
      invalidate();
      return true;
    };
    const lightHouse = (houseIndex: number, stretchIndex: number = 0): boolean => {
      if (!Number.isInteger(houseIndex) || houseIndex < 0 || houseIndex >= houseCount) return false;
      if (!Number.isSafeInteger(stretchIndex)) return false;
      const t = now();
      for (let s = 0; s < pools.windowGlow.capacity; s++) {
        const e = pools.windowGlow.entryAt(s);
        if (e.active && e.state.houseIndex === houseIndex && e.state.stretchIndex === stretchIndex) {
          retriggerGlow(e, t, WINDOW_GLOW_LOOK.attackMs);
          invalidate();
          return true;
        }
      }
      const entry = pools.windowGlow.acquire(t);
      entry.state.houseIndex = houseIndex;
      entry.state.stretchIndex = stretchIndex;
      invalidate();
      return true;
    };
    const launchFirework = (at: WorldXZ | null): boolean => {
      if (!isFiniteXZ(at)) return false;
      const t = now();
      if (t - lastLaunchMs.current < FIREWORK_MIN_LAUNCH_INTERVAL_MS) return false; // WCAG "three flashes": ≤ 3 bursts per second
      lastLaunchMs.current = t;
      const e = pools.firework.acquire(t);
      e.state.x = at.x;
      e.state.y = fireworkBaseY;
      e.state.z = at.z;
      e.state.paletteIndex = launchCounter.current % FIREWORK_LOOK.palette.length;
      launchCounter.current += 1;
      invalidate();
      return true;
    };
    const releaseSkyLantern = (lampIndex: number, stretchIndex: number = 0): boolean => {
      if (!validLamp(lampIndex) || !Number.isSafeInteger(stretchIndex)) return false;
      const lamp = lamps[lampIndex];
      const e = pools.skyLantern.acquire(now());
      e.state.x = lamp.position.x + (frame === null ? 0 : stretchIndex * frame.periodX);
      e.state.y = lamp.position.y + lampHead.yOffset * lamp.scale;
      e.state.z = lamp.position.z + (frame === null ? 0 : stretchIndex * frame.periodZ);
      invalidate();
      return true;
    };
    const puffChimneySmoke = (houseIndex: number, stretchIndex: number = 0): boolean => {
      if (reducedMotion || !Number.isSafeInteger(stretchIndex)) return false;
      if (!Number.isInteger(houseIndex) || houseIndex < 0 || houseIndex >= houseSmokeOrigins.length) return false;
      const t = now();
      const emitMs = chimneySmokeEmitMs(smokePuffs);
      for (let s = 0; s < pools.chimneySmoke.capacity; s++) {
        const e = pools.chimneySmoke.entryAt(s);
        if (e.active && e.state.houseIndex === houseIndex && e.state.stretchIndex === stretchIndex && t - e.startedAtMs < emitMs) {
          return true; // still emitting: the re-tap is absorbed (no stacked identical paths)
        }
      }
      driftScratch.current ??= { ndc: new Vector3(), drift: { x: 0, z: 0 } };
      const o = houseSmokeOrigins[houseIndex];
      const ox = o.x + (frame === null ? 0 : stretchIndex * frame.periodX);
      const oz = o.z + (frame === null ? 0 : stretchIndex * frame.periodZ);
      const drift = smokeDriftFromCamera(camera, ox, o.y, oz, driftScratch.current);
      const entry = pools.chimneySmoke.acquire(t);
      entry.state.houseIndex = houseIndex;
      entry.state.stretchIndex = stretchIndex;
      entry.state.driftX = drift.x;
      entry.state.driftZ = drift.z;
      invalidate();
      return true;
    };
    const dropLeaves = (treeIndex: number, stretchIndex: number = 0): boolean => {
      if (reducedMotion || !Number.isSafeInteger(stretchIndex)) return false;
      if (!Number.isInteger(treeIndex) || treeIndex < 0 || treeIndex >= treeLeafAnchors.length) return false;
      const t = now();
      const emitMs = fallingLeavesEmitMs(leavesPerFall);
      for (let s = 0; s < pools.fallingLeaves.capacity; s++) {
        const e = pools.fallingLeaves.entryAt(s);
        if (e.active && e.state.treeIndex === treeIndex && e.state.stretchIndex === stretchIndex && t - e.startedAtMs < emitMs) {
          return true; // leaves still in the air: the re-tap is absorbed
        }
      }
      const entry = pools.fallingLeaves.acquire(t);
      entry.state.treeIndex = treeIndex;
      entry.state.stretchIndex = stretchIndex;
      invalidate();
      return true;
    };
    return {
      spawnRipple(at) {
        spawnRipple(at);
      },
      lightLamp,
      lightHouse,
      launchFirework,
      releaseSkyLantern,
      puffChimneySmoke,
      dropLeaves,
      react(kind, index, at, stretchIndex = 0) {
        if (!Number.isSafeInteger(stretchIndex)) return null;
        const reaction = SCENE_TAP_REACTIONS[kind];
        let started = false;
        for (const effect of reaction.effects) {
          switch (effect) {
            case "ripple":
              started = spawnRipple(at) || started;
              break;
            case "lampGlow":
              started = lightLamp(index, stretchIndex) || started;
              break;
            case "skyLantern":
              started = releaseSkyLantern(index, stretchIndex) || started;
              break;
            case "windowGlow":
              started = lightHouse(index, stretchIndex) || started;
              break;
            case "nudge":
              if (isNudgeKind(kind) && Number.isInteger(index) && index >= 0) {
                startNudge(pools.nudge, kind, index, now(), stretchIndex);
                invalidate();
                started = true;
              }
              break;
            case "firework":
              started = launchFirework(at) || started;
              break;
            case "chimneySmoke":
              started = puffChimneySmoke(index, stretchIndex) || started;
              break;
            case "fallingLeaves":
              started = dropLeaves(index, stretchIndex) || started;
              break;
            case "markCue":
              break; // krathong taps are served by RiverFlow / OwnKrathong and the inspect popup
          }
        }
        return started ? reaction.gimmick : null;
      },
      activeCount: (kind) => pools.activeCount(kind),
    };
  }, [
    pools,
    lamps,
    lampHead.yOffset,
    houseWindows,
    windowsPerHouse,
    fireworkBaseY,
    now,
    invalidate,
    frame,
    reducedMotion,
    houseSmokeOrigins,
    smokePuffs,
    treeLeafAnchors,
    leavesPerFall,
    camera,
  ]);

  useFrame(() => {
    const t = now();
    const s = scratch.current;
    const a = writeRippleInstances(ripple, pools.ripple, t, reducedMotion, waterSurfaceY, s);
    const b = writeLampGlowInstances(glow, pools.glow, lamps, lampHead, t, reducedMotion, s, frame);
    const c = writeWindowGlowInstances(windows, pools.windowGlow, houseWindows, windowsPerHouse, windowPart, t, reducedMotion, s, frame);
    const d = writeFireworkInstances(fireworks, pools.firework, t, reducedMotion, s);
    const e = writeSkyLanternInstances(lanterns, pools.skyLantern, t, reducedMotion, s);
    const g = writeChimneySmokeInstances(smoke, pools.chimneySmoke, houseSmokeOrigins, t, reducedMotion, lightPreset, s, frame);
    const h = writeFallingLeafInstances(leaves, pools.fallingLeaves, treeLeafAnchors, t, reducedMotion, lightPreset, s, frame);
    const released = releaseExpiredNudges(pools.nudge, t, reducedMotion);
    // Keep the demand loop alive only while an effect runs, plus one tail frame after a nudge ends (consumers write the rest pose).
    if (a + b + c + d + e + g + h + pools.nudge.activeCount > 0 || released > 0) invalidate();
  });

  return (
    <>
      <primitive object={ripple.mesh} dispose={null} />
      <primitive object={glow.mesh} dispose={null} />
      <primitive object={windows.mesh} dispose={null} />
      <primitive object={fireworks.mesh} dispose={null} />
      <primitive object={lanterns.mesh} dispose={null} />
      <primitive object={smoke.mesh} dispose={null} />
      <primitive object={leaves.mesh} dispose={null} />
    </>
  );
}
