"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import type { Camera } from "three";
import {
  FIREWORK_LOOK,
  FIREWORK_MIN_LAUNCH_INTERVAL_MS,
  NUDGE_TARGET_KINDS,
  SCENE_TAP_REACTIONS,
  SKY_LANTERN_LOOK,
  SKY_LAUNCH_GIMMICKS,
  SKY_LAUNCH_SEED_GLOBAL_NAME,
  SKY_LAUNCH_SPLIT,
  WINDOW_GLOW_LOOK,
  type NudgeTargetKind,
  type SceneGimmickKind,
  type SceneTargetKind,
} from "@/config/gimmicks.config";
import { RIVER_FOLIAGE_PARTS } from "@/config/events/loyKrathong.river.config";
import type { LightPresetId } from "@/config/look.config";
import type { EffectKind } from "@/config/performance.config";
import type { MatteMaterialSpec, ScenePartSpec } from "@/config/scene.config";
import type { WorldVec3, WorldXZ } from "@/core/coordinates";
import type { EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import {
  chimneySmokeEmitMs,
  createSeededRandom,
  fallingLeavesEmitMs,
  pickSkyLaunch,
  resolveSkyLaunchSeed,
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
  createLampGroundLightMesh,
  createRippleMesh,
  createSkyLanternMesh,
  createWindowGlowMesh,
  disposeEffectMesh,
  disposeLampGroundLightMesh,
  writeFireworkInstances,
  writeLampLightInstances,
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

/**
 * MFW-75 (caller override of the spec's D3): the sky launch generator is seeded once per SceneEffects mount from a non-deterministic
 * source (Math.random), so every visit is a real surprise; tests set window[SKY_LAUNCH_SEED_GLOBAL_NAME] (the e2e scene probe) or pass
 * `skyLaunchRandom` to make the picks deterministic.
 */
function createDefaultSkyLaunchRandom(): () => number {
  const override =
    typeof window === "undefined" ? undefined : (window as unknown as Record<string, unknown>)[SKY_LAUNCH_SEED_GLOBAL_NAME];
  return createSeededRandom(resolveSkyLaunchSeed(override, Math.random));
}

/**
 * The drift of a smoke (MFW-84): the camera's horizontal right axis, signed downwind (writeSmokeDriftInto), so the smoke moves only
 * sideways on screen while it rises; no camera (tests) → TAP_SHAKE_WIND. Writes into `out`; allocation-free.
 */
function smokeDriftFromCamera(camera: Camera | undefined, out: SmokeDrift): SmokeDrift {
  if (camera === undefined || camera === null) return writeSmokeDriftInto(0, 0, out);
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements; // column 0 = +X (camera right) in world space
  return writeSmokeDriftInto(e[0], e[2], out);
}

export interface SceneEffectsHandle {
  /** Starts a ripple at a world-view-group-local point (non-finite → ignored). Recycles the oldest when the pool is full. */
  spawnRipple(at: WorldXZ): void;
  /**
   * Switches lamp `lampIndex` of stretch copy `stretchIndex` on (MFW-58, default 0). MFW-75: a lit lamp stays lit; a re-tap of a lit
   * lamp (same index and stretch) changes nothing (true). A full glow pool recycles the oldest lit lamp, which goes dark.
   * Non-integer or out-of-range → ignored (false).
   */
  lightLamp(lampIndex: number, stretchIndex?: number): boolean;
  /** Lights the windows of house `houseIndex` of stretch `stretchIndex` (re-tap: stays lit). Out of range → false. */
  lightHouse(houseIndex: number, stretchIndex?: number): boolean;
  /**
   * A firework from a land point in world-view space (MFW-58: already includes the stretch offset; null / non-finite → false).
   * Launches closer than FIREWORK_MIN_LAUNCH_INTERVAL_MS are ignored.
   */
  launchFirework(at: WorldXZ | null): boolean;
  /**
   * MFW-75: a sky lantern rises from a land point in world-view space (already includes the stretch offset), sitting on the terrace
   * (fireworkBaseY + half its height). Null / non-finite → false. No lantern ever rises from a lamp.
   */
  releaseSkyLantern(at: WorldXZ | null): boolean;
  /**
   * MFW-75: the empty-ground tap. Draws one value from the seeded generator and launches a firework or a sky lantern
   * (pickSkyLaunch with SKY_LAUNCH_SPLIT); returns its gimmick (SKY_LAUNCH_GIMMICKS) or null when nothing started. A non-finite `at`
   * returns null without drawing; a rate-limited firework (WCAG) spends the draw and returns null (no fallback to a lantern).
   */
  launchFromSky(at: WorldXZ | null): SceneGimmickKind | null;
  /**
   * MFW-72 / MFW-84: a faint smoke rises from house `houseIndex`'s chimney in stretch `stretchIndex` (+ s·T). False under reduced motion (no
   * particles), for an index out of range or a non-safe-integer stretch. A re-tap on the same (house, stretch) while it is still
   * emitting (age < chimneySmokeEmitMs) is absorbed (true, nothing new).
   */
  puffChimneySmoke(houseIndex: number, stretchIndex?: number): boolean;
  /**
   * MFW-72 / MFW-84: a few small crown-coloured leaves fall from tree `treeIndex` of stretch `stretchIndex`; same rules (absorbed until
   * fallingLeavesEmitMs).
   */
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
  /** MFW-72: smoke colours per light preset (the effect program is unlit). The leaves are lit (MFW-84). */
  readonly lightPreset: LightPresetId;
  /** MFW-72 / MFW-84: one smoke origin per house (above its chimney top, stretch-0 world-view space). */
  readonly houseSmokeOrigins: readonly WorldVec3[];
  /** MFW-72: CHIMNEY_SMOKE_PUFFS_PER_TAP[tier]. */
  readonly smokePuffs: number;
  /** MFW-72: the precomputed leaf paths per tree (stretch-0 world-view space). */
  readonly treeLeafAnchors: readonly TreeLeafAnchor[];
  /** MFW-72: FALLING_LEAVES_PER_TAP[tier]. */
  readonly leavesPerFall: number;
  /**
   * MFW-84: the tree crown's material spec, so a falling leaf has the crown's colour under the same lights. Default
   * RIVER_FOLIAGE_PARTS.FULL.leafClump.material (FULL and LIGHT share the object).
   */
  readonly leafMaterial?: MatteMaterialSpec;
  /** MFW-75: BLOB_SHADOW_TIER_GEOMETRY[tier], the fan of the lamp ground light. */
  readonly lampGroundFan: Readonly<{ segments: number; rings: number }>;
  /** MFW-75: the sky launch generator ([0, 1) values). Default: one seeded generator per mount (createDefaultSkyLaunchRandom). Tests inject. */
  readonly skyLaunchRandom?: () => number;
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
  leafMaterial = RIVER_FOLIAGE_PARTS.FULL.leafClump.material,
  lampGroundFan,
  skyLaunchRandom,
  now = SCENE_EFFECT_CLOCK,
  frame = null,
}: SceneEffectsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => (state as { camera?: Camera }).camera);
  const ripple = useMemo(() => createRippleMesh(pools.ripple.capacity), [pools.ripple.capacity]);
  const glow = useMemo(() => createLampGlowMesh(pools.glow.capacity, lampHead.geometry), [pools.glow.capacity, lampHead.geometry]);
  const { segments: fanSegments, rings: fanRings } = lampGroundFan; // keyed on the numbers, not the object identity
  const lampGround = useMemo(
    () => createLampGroundLightMesh(pools.glow.capacity, { segments: fanSegments, rings: fanRings }),
    [pools.glow.capacity, fanSegments, fanRings],
  );
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
    () => createFallingLeafMesh(pools.fallingLeaves.capacity, leavesPerFall, leafMaterial),
    [pools.fallingLeaves.capacity, leavesPerFall, leafMaterial],
  );
  const scratch = useRef(createEffectFrameScratch());
  const driftScratch = useRef<SmokeDrift | null>(null);
  const lastLaunchMs = useRef(-Infinity);
  const launchCounter = useRef(0);
  const defaultSkyRandom = useRef<(() => number) | null>(null);
  useEffect(() => () => disposeEffectMesh(ripple), [ripple]);
  useEffect(() => () => disposeEffectMesh(glow), [glow]);
  useEffect(() => () => disposeLampGroundLightMesh(lampGround), [lampGround]);
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
      for (let s = 0; s < pools.glow.capacity; s++) {
        const e = pools.glow.entryAt(s);
        if (e.active && e.state.lampIndex === lampIndex && e.state.stretchIndex === stretchIndex) return true; // already lit: stays lit
      }
      const entry = pools.glow.acquire(now()); // a full pool recycles the oldest lit lamp (it goes dark)
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
    const releaseSkyLantern = (at: WorldXZ | null): boolean => {
      if (!isFiniteXZ(at)) return false;
      const e = pools.skyLantern.acquire(now());
      e.state.x = at.x;
      e.state.y = fireworkBaseY + SKY_LANTERN_LOOK.geometry.height / 2; // sits on the terrace
      e.state.z = at.z;
      invalidate();
      return true;
    };
    const launchFromSky = (at: WorldXZ | null): SceneGimmickKind | null => {
      if (!isFiniteXZ(at)) return null; // no draw for a tap without a land point
      let random = skyLaunchRandom;
      if (random === undefined) random = defaultSkyRandom.current ??= createDefaultSkyLaunchRandom();
      const kind = pickSkyLaunch(random(), SKY_LAUNCH_SPLIT.fireworkShare);
      const started = kind === "firework" ? launchFirework(at) : releaseSkyLantern(at);
      return started ? SKY_LAUNCH_GIMMICKS[kind] : null;
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
      driftScratch.current ??= { x: 0, z: 0 }; // once per mount
      const drift = smokeDriftFromCamera(camera, driftScratch.current);
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
      launchFromSky,
      puffChimneySmoke,
      dropLeaves,
      react(kind, index, at, stretchIndex = 0) {
        if (!Number.isSafeInteger(stretchIndex)) return null;
        const reaction = SCENE_TAP_REACTIONS[kind];
        let started = false;
        let launched: SceneGimmickKind | null = null;
        for (const effect of reaction.effects) {
          switch (effect) {
            case "ripple":
              started = spawnRipple(at) || started;
              break;
            case "lampGlow":
              started = lightLamp(index, stretchIndex) || started;
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
            case "skyLaunch":
              launched = launchFromSky(at);
              started = launched !== null || started;
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
        return started ? (launched ?? reaction.gimmick) : null;
      },
      activeCount: (kind) => pools.activeCount(kind),
    };
  }, [
    pools,
    lamps,
    houseWindows,
    windowsPerHouse,
    fireworkBaseY,
    now,
    invalidate,
    reducedMotion,
    houseSmokeOrigins,
    smokePuffs,
    treeLeafAnchors,
    leavesPerFall,
    camera,
    skyLaunchRandom,
  ]);

  useFrame(() => {
    const t = now();
    const s = scratch.current;
    const a = writeRippleInstances(ripple, pools.ripple, t, reducedMotion, waterSurfaceY, s);
    const b = writeLampLightInstances(glow, lampGround, pools.glow, lamps, lampHead, t, reducedMotion, s, frame); // ramping lamps only
    const c = writeWindowGlowInstances(windows, pools.windowGlow, houseWindows, windowsPerHouse, windowPart, t, reducedMotion, s, frame);
    const d = writeFireworkInstances(fireworks, pools.firework, t, reducedMotion, s);
    const e = writeSkyLanternInstances(lanterns, pools.skyLantern, t, reducedMotion, s);
    const g = writeChimneySmokeInstances(smoke, pools.chimneySmoke, houseSmokeOrigins, t, reducedMotion, lightPreset, s, frame);
    const h = writeFallingLeafInstances(leaves, pools.fallingLeaves, treeLeafAnchors, t, reducedMotion, s, frame);
    const released = releaseExpiredNudges(pools.nudge, t, reducedMotion);
    // Keep the demand loop alive only while an effect runs, plus one tail frame after a nudge ends (consumers write the rest pose).
    if (a + b + c + d + e + g + h + pools.nudge.activeCount > 0 || released > 0) invalidate();
  });

  return (
    <>
      <primitive object={ripple.mesh} dispose={null} />
      <primitive object={glow.mesh} dispose={null} />
      <primitive object={lampGround} dispose={null} />
      <primitive object={windows.mesh} dispose={null} />
      <primitive object={fireworks.mesh} dispose={null} />
      <primitive object={lanterns.mesh} dispose={null} />
      <primitive object={smoke.mesh} dispose={null} />
      <primitive object={leaves.mesh} dispose={null} />
    </>
  );
}
