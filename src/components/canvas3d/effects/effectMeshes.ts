import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Quaternion,
  RingGeometry,
  Vector3,
} from "three";
import {
  CHIMNEY_SMOKE_LOOK,
  FALLING_LEAF_LOOK,
  FIREWORK_LOOK,
  FIREWORK_SPARK_GEOMETRY,
  LAMP_GLOW_LOOK,
  NO_BOUNCE,
  RIPPLE_LOOK,
  SKY_LANTERN_LOOK,
  TAP_SHAKE_WIND,
  WINDOW_GLOW_LOOK,
} from "@/config/gimmicks.config";
import { LIGHT_PRESET_IDS, type LightPresetId } from "@/config/look.config";
import type { PartGeometrySpec, ScenePartSpec } from "@/config/scene.config";
import type { WorldVec3 } from "@/core/coordinates";
import { buildLeafShellMeshData } from "@/core/customization/krathongMeshData";
import {
  chimneySmokeDurationMs,
  createFallingLeafFrame,
  createSmokePuffFrame,
  fallingLeavesDurationMs,
  writeFallingLeafAt,
  writeSmokePuffAt,
  type ChimneySmokeState,
  type FallingLeafFrame,
  type FallingLeavesState,
  type SmokePuffFrame,
  createLampGlowFrame,
  createLanternFrame,
  createRippleFrame,
  createShellFrame,
  createSparkFrame,
  fireworkDirectionsInto,
  fireworkDurationMs,
  writeFireworkShellAt,
  writeFireworkSparkAt,
  writeLampGlowFrameAt,
  writeRippleFrameAt,
  writeSkyLanternAt,
  type FireworkState,
  type LampGlowFrame,
  type LampGlowState,
  type LanternFrame,
  type ObjectPool,
  type RippleFrame,
  type RippleState,
  type ShellFrame,
  type SkyLanternState,
  type SparkFrame,
  type WindowGlowState,
} from "@/core/effects";
import { stretchOffsetInto, type EndlessRiverFrame, type MutableXZ } from "@/core/coordinates/endlessRiverFrame";
import type { InstanceTransform } from "@/core/world";
import { createPartGeometry } from "../geometry";
import { composeInstanceMatrix } from "../instancing";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";
import { TREE_LEAF_PATH_STRIDE, type TreeLeafAnchor } from "./sceneEffectAnchors";

/** One pooled effect kind = one InstancedMesh sized to the pool cap + its colour at intensity 1. */
export interface EffectMesh {
  readonly mesh: InstancedMesh;
  readonly baseColor: Color;
  readonly capacity: number;
}

/** Per-layer scratch so the frame writers allocate nothing. */
export interface EffectFrameScratch {
  readonly matrix: Matrix4;
  readonly scaleMatrix: Matrix4;
  readonly color: Color;
  readonly ripple: RippleFrame;
  readonly glow: LampGlowFrame;
  readonly shell: ShellFrame;
  readonly spark: SparkFrame;
  readonly lantern: LanternFrame;
  readonly smoke: SmokePuffFrame; // MFW-72
  readonly leaf: FallingLeafFrame;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly euler: Euler;
  readonly scale: Vector3;
}

export function createEffectFrameScratch(): EffectFrameScratch {
  return {
    matrix: new Matrix4(),
    scaleMatrix: new Matrix4(),
    color: new Color(),
    ripple: createRippleFrame(),
    glow: createLampGlowFrame(),
    shell: createShellFrame(),
    spark: createSparkFrame(),
    lantern: createLanternFrame(),
    smoke: createSmokePuffFrame(),
    leaf: createFallingLeafFrame(),
    position: new Vector3(),
    quaternion: new Quaternion(),
    euler: new Euler(),
    scale: new Vector3(),
  };
}

/** MFW-58 stretch offset scratch of the glow writers (never escapes). */
const scratchOffset: MutableXZ = { x: 0, z: 0 };

/** s·T of an entry's stretch into scratchOffset; (0, 0) without a frame or for stretch 0. False for a non-safe-integer stretch. */
function writeStretchOffset(frame: EndlessRiverFrame | null, stretchIndex: number): boolean {
  if (!Number.isSafeInteger(stretchIndex)) return false;
  if (frame === null || stretchIndex === 0) {
    scratchOffset.x = 0;
    scratchOffset.z = 0;
    return true;
  }
  stretchOffsetInto(frame, stretchIndex, scratchOffset);
  return true;
}

/** Effects never intercept taps. */
const NO_RAYCAST: InstancedMesh["raycast"] = () => {};

function assertCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("effect mesh capacity must be a positive integer");
}

/**
 * The ONE effect material setup: unlit, transparent, no depth write, not tone mapped, instanceColor set before the first render, no
 * map, no vertex colours. Every effect mesh shares the shader program of the ripple and lamp glow (three does not key the program on
 * `blending` when `transparent` is true). MFW-60: fireworks and sky lanterns use NormalBlending (they fade by shrinking: no additive halo).
 */
function setupEffectMesh(
  geometry: BufferGeometry,
  color: string,
  capacity: number,
  name: string,
  blending: "additive" | "normal" = "additive",
): EffectMesh {
  const material = new MeshBasicMaterial({
    blending: blending === "additive" ? AdditiveBlending : NormalBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.frustumCulled = false; // instances move; the cached bounding sphere would be stale
  mesh.raycast = NO_RAYCAST;
  const black = new Color(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, black); // create instanceColor BEFORE the first render (shader variant)
  mesh.count = 0;
  mesh.visible = false; // no draw call while idle
  return { mesh, baseColor: new Color(color), capacity };
}

export function createRippleMesh(capacity: number): EffectMesh {
  assertCapacity(capacity);
  const geometry = new RingGeometry(RIPPLE_LOOK.ringInnerRatio, 1, RIPPLE_LOOK.ringSegments);
  geometry.rotateX(-Math.PI / 2); // the ring lies flat with its normal up
  return setupEffectMesh(geometry, RIPPLE_LOOK.color, capacity, SCENE_OBJECT_NAMES.ripples);
}

export function createLampGlowMesh(capacity: number, lampHeadGeometry: PartGeometrySpec): EffectMesh {
  assertCapacity(capacity);
  return setupEffectMesh(createPartGeometry(lampHeadGeometry), LAMP_GLOW_LOOK.color, capacity, SCENE_OBJECT_NAMES.lampGlows);
}

function finishWrite(target: EffectMesh, n: number): number {
  target.mesh.count = n;
  target.mesh.visible = n > 0;
  if (n > 0) {
    target.mesh.instanceMatrix.needsUpdate = true;
    if (target.mesh.instanceColor) target.mesh.instanceColor.needsUpdate = true;
  }
  return n;
}

/** Writes the active ripples into instances 0..n-1, releases expired ones, sets count/visible; returns n. Allocation-free. */
export function writeRippleInstances(
  target: EffectMesh,
  pool: ObjectPool<RippleState>,
  nowMs: number,
  reducedMotion: boolean,
  surfaceY: number,
  scratch: EffectFrameScratch,
): number {
  let n = 0;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const f = writeRippleFrameAt(nowMs - e.startedAtMs, reducedMotion, scratch.ripple);
    if (f.done) {
      pool.release(e);
      continue;
    }
    scratch.matrix.makeScale(f.radius, 1, f.radius).setPosition(e.state.x, surfaceY + RIPPLE_LOOK.surfaceOffsetY, e.state.z);
    target.mesh.setMatrixAt(n, scratch.matrix);
    target.mesh.setColorAt(n, scratch.color.copy(target.baseColor).multiplyScalar(f.intensity));
    n++;
  }
  return finishWrite(target, n);
}

/**
 * Same for lamp glows; an entry whose lampIndex is outside `lamps` (or whose stretch is not a safe integer) is released. MFW-58: the
 * glow sits at the lamp of its stretch copy, lamp + s·T (`frame`; null = stretch 0 only). Returns n.
 */
export function writeLampGlowInstances(
  target: EffectMesh,
  pool: ObjectPool<LampGlowState>,
  lamps: readonly InstanceTransform[],
  lampHead: Pick<ScenePartSpec, "yOffset">,
  nowMs: number,
  reducedMotion: boolean,
  scratch: EffectFrameScratch,
  frame: EndlessRiverFrame | null = null,
): number {
  let n = 0;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const lamp = lamps[e.state.lampIndex];
    if (lamp === undefined || !writeStretchOffset(frame, e.state.stretchIndex)) {
      pool.release(e);
      continue;
    }
    const f = writeLampGlowFrameAt(nowMs - e.startedAtMs, reducedMotion, scratch.glow);
    if (f.done) {
      pool.release(e);
      continue;
    }
    const size = lamp.scale * LAMP_GLOW_LOOK.shellScale * f.scale;
    scratch.matrix
      .makeScale(size, size, size)
      .setPosition(
        lamp.position.x + scratchOffset.x,
        lamp.position.y + lampHead.yOffset * lamp.scale,
        lamp.position.z + scratchOffset.z,
      );
    target.mesh.setMatrixAt(n, scratch.matrix);
    target.mesh.setColorAt(n, scratch.color.copy(target.baseColor).multiplyScalar(f.intensity));
    n++;
  }
  return finishWrite(target, n);
}

/** House window light-up (MFW-60): capacity = houseCapacity × windowsPerHouse, additive skins over the window boxes. */
export function createWindowGlowMesh(houseCapacity: number, windowsPerHouse: number, windowGeometry: PartGeometrySpec): EffectMesh {
  assertCapacity(houseCapacity);
  assertCapacity(windowsPerHouse);
  return setupEffectMesh(
    createPartGeometry(windowGeometry),
    WINDOW_GLOW_LOOK.color,
    houseCapacity * windowsPerHouse,
    SCENE_OBJECT_NAMES.windowGlows,
  );
}

/**
 * Per active house h and window w < windowsPerHouse: t = houseWindows[h·W + w] (a house without its windows releases the entry);
 * matrix = composeInstanceMatrix(t, windowPart) · S(shellScale); colour = base × intensity (writeLampGlowFrameAt with WINDOW_GLOW_LOOK
 * and NO_BOUNCE: attack, steady hold, release; no flicker). MFW-58: the windows of the entry's stretch copy (+ s·T, `frame`; null =
 * stretch 0 only). Returns the instance count. Allocation-free.
 */
export function writeWindowGlowInstances(
  target: EffectMesh,
  pool: ObjectPool<WindowGlowState>,
  houseWindows: readonly InstanceTransform[],
  windowsPerHouse: number,
  windowPart: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">,
  nowMs: number,
  reducedMotion: boolean,
  scratch: EffectFrameScratch,
  frame: EndlessRiverFrame | null = null,
): number {
  let n = 0;
  if (pool.activeCount > 0) {
    scratch.scaleMatrix.makeScale(WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale);
  }
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const first = e.state.houseIndex * windowsPerHouse;
    if (
      !Number.isInteger(first) ||
      first < 0 ||
      first + windowsPerHouse > houseWindows.length ||
      n + windowsPerHouse > target.capacity ||
      !writeStretchOffset(frame, e.state.stretchIndex)
    ) {
      pool.release(e);
      continue;
    }
    const f = writeLampGlowFrameAt(nowMs - e.startedAtMs, reducedMotion, scratch.glow, WINDOW_GLOW_LOOK, NO_BOUNCE);
    if (f.done) {
      pool.release(e);
      continue;
    }
    for (let w = 0; w < windowsPerHouse; w++) {
      composeInstanceMatrix(houseWindows[first + w], windowPart, scratch.matrix).multiply(scratch.scaleMatrix);
      // Pre-translate by the stretch offset: T(s·T) · M only adds to the translation column.
      scratch.matrix.elements[12] += scratchOffset.x;
      scratch.matrix.elements[14] += scratchOffset.z;
      target.mesh.setMatrixAt(n, scratch.matrix);
      target.mesh.setColorAt(n, scratch.color.copy(target.baseColor).multiplyScalar(f.intensity));
      n++;
    }
  }
  return finishWrite(target, n);
}

/** Instances one burst can use: the shell and its trail, then a head and a tail per spark. */
export function fireworkInstancesPerBurst(sparksPerBurst: number): number {
  return 1 + FIREWORK_LOOK.shellTrailCount + 2 * sparksPerBurst;
}

/** Firework mesh: one shell (+ trail) + sparksPerBurst sparks (head + tail) per burst; directions and palette colours are made here, once. */
export interface FireworkMesh extends EffectMesh {
  readonly sparksPerBurst: number;
  readonly directions: Float32Array;
  readonly palette: readonly Color[];
}

export function createFireworkMesh(burstCapacity: number, sparksPerBurst: number): FireworkMesh {
  assertCapacity(burstCapacity);
  assertCapacity(sparksPerBurst);
  const base = setupEffectMesh(
    createPartGeometry(FIREWORK_SPARK_GEOMETRY),
    FIREWORK_LOOK.palette[0],
    burstCapacity * fireworkInstancesPerBurst(sparksPerBurst),
    SCENE_OBJECT_NAMES.fireworks,
    "normal",
  );
  return {
    ...base,
    sparksPerBurst,
    directions: fireworkDirectionsInto(sparksPerBurst, new Float32Array(3 * sparksPerBurst)),
    palette: Object.freeze(FIREWORK_LOOK.palette.map((hex) => new Color(hex))),
  };
}

/**
 * Releases bursts older than fireworkDurationMs. Shell phase: the shell at launch + (0, liftY, 0) (scale shellSize) and
 * shellTrailCount smaller dots below it, colour palette[p]. Burst phase: per spark i a head at the burst centre + the spark offset
 * (scale = spark size) and a tail at sparkTailRatio of the offset (scale × sparkTailSize), colour palette[(p + (i mod 2)) mod len]
 * at full strength (sparks fade by shrinking). Returns the number of active bursts. Allocation-free.
 */
export function writeFireworkInstances(
  target: FireworkMesh,
  pool: ObjectPool<FireworkState>,
  nowMs: number,
  reducedMotion: boolean,
  scratch: EffectFrameScratch,
): number {
  let n = 0;
  let bursts = 0;
  const len = target.palette.length;
  const life = fireworkDurationMs(reducedMotion);
  const L = FIREWORK_LOOK;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const age = nowMs - e.startedAtMs;
    if (age >= life) {
      pool.release(e);
      continue;
    }
    bursts++;
    const st = e.state;
    const p = ((st.paletteIndex % len) + len) % len;
    const shell = writeFireworkShellAt(age, reducedMotion, scratch.shell);
    if (!shell.done) {
      for (let k = 0; k <= L.shellTrailCount && n < target.capacity; k++) {
        const lift = shell.liftY - k * L.shellTrailSpacing;
        if (lift < 0) break;
        const size = (shell.size * (L.shellTrailCount + 1 - k)) / (L.shellTrailCount + 1);
        scratch.matrix.makeScale(size, size, size).setPosition(st.x, st.y + lift, st.z);
        target.mesh.setMatrixAt(n, scratch.matrix);
        target.mesh.setColorAt(n, target.palette[p]);
        n++;
      }
      continue;
    }
    const cy = st.y + L.burstHeight;
    const d = target.directions;
    for (let i = 0; i < target.sparksPerBurst && n + 1 < target.capacity; i++) {
      const f = writeFireworkSparkAt(age, reducedMotion, d[3 * i], d[3 * i + 1], d[3 * i + 2], scratch.spark);
      if (!f.visible || f.size <= 0) continue;
      const color = target.palette[(p + (i % 2)) % len];
      scratch.matrix.makeScale(f.size, f.size, f.size).setPosition(st.x + f.dx, cy + f.dy, st.z + f.dz);
      target.mesh.setMatrixAt(n, scratch.matrix);
      target.mesh.setColorAt(n, color);
      n++;
      const tail = f.size * L.sparkTailSize;
      scratch.matrix
        .makeScale(tail, tail, tail)
        .setPosition(st.x + f.dx * L.sparkTailRatio, cy + f.dy * L.sparkTailRatio, st.z + f.dz * L.sparkTailRatio);
      target.mesh.setMatrixAt(n, scratch.matrix);
      target.mesh.setColorAt(n, color);
      n++;
    }
  }
  finishWrite(target, n);
  return bursts;
}

/** Sky lanterns (โคมลอย, MFW-60): a body and a flame instance per lantern, NormalBlending, SKY_LANTERN_LOOK geometry and colours. */
export interface SkyLanternMesh extends EffectMesh {
  readonly flameColor: Color;
}

export function createSkyLanternMesh(capacity: number): SkyLanternMesh {
  assertCapacity(capacity);
  const base = setupEffectMesh(
    createPartGeometry(SKY_LANTERN_LOOK.geometry),
    SKY_LANTERN_LOOK.color,
    2 * capacity,
    SCENE_OBJECT_NAMES.skyLanterns,
    "normal",
  );
  return { ...base, flameColor: new Color(SKY_LANTERN_LOOK.flameColor) };
}

/**
 * Writes the active sky lanterns (lamp head + writeSkyLanternAt offsets, scale = size) and their flames (flameScale × size, flameOffsetY ×
 * the lantern height below the centre), releases finished ones; returns the instance count. Allocation-free.
 */
export function writeSkyLanternInstances(
  target: SkyLanternMesh,
  pool: ObjectPool<SkyLanternState>,
  nowMs: number,
  reducedMotion: boolean,
  scratch: EffectFrameScratch,
): number {
  let n = 0;
  const L = SKY_LANTERN_LOOK;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const f = writeSkyLanternAt(nowMs - e.startedAtMs, reducedMotion, scratch.lantern);
    if (f.done) {
      pool.release(e);
      continue;
    }
    if (f.size <= 0 || n + 2 > target.capacity) continue;
    const x = e.state.x + f.dx;
    const y = e.state.y + f.dy;
    const z = e.state.z + f.dz;
    scratch.matrix.makeScale(f.size, f.size, f.size).setPosition(x, y, z);
    target.mesh.setMatrixAt(n, scratch.matrix);
    target.mesh.setColorAt(n, target.baseColor);
    n++;
    const flame = f.size * L.flameScale;
    scratch.matrix.makeScale(flame, flame, flame).setPosition(x, y + L.flameOffsetY * L.geometry.height * f.size, z);
    target.mesh.setMatrixAt(n, scratch.matrix);
    target.mesh.setColorAt(n, target.flameColor);
    n++;
  }
  return finishWrite(target, n);
}

/** Per light preset, the palette as three Colors (made once per mesh; the effect program is unlit, so NIGHT gets its own tones). */
function presetPalettes(palette: Readonly<Record<LightPresetId, readonly string[]>>): Readonly<Record<LightPresetId, readonly Color[]>> {
  const out = {} as Record<LightPresetId, readonly Color[]>;
  for (const id of LIGHT_PRESET_IDS) out[id] = Object.freeze(palette[id].map((hex) => new Color(hex)));
  return Object.freeze(out);
}

/** Chimney smoke (MFW-72): `puffsPerSmoke` soft round puffs per smoke, NormalBlending (fades by shrinking: no halo, MFW-67). */
export interface ChimneySmokeMesh extends EffectMesh {
  readonly puffsPerSmoke: number;
  readonly palettes: Readonly<Record<LightPresetId, readonly Color[]>>;
}

export function createChimneySmokeMesh(smokeCapacity: number, puffsPerSmoke: number): ChimneySmokeMesh {
  assertCapacity(smokeCapacity);
  assertCapacity(puffsPerSmoke);
  const base = setupEffectMesh(
    createPartGeometry(CHIMNEY_SMOKE_LOOK.geometry),
    CHIMNEY_SMOKE_LOOK.palette.DAY[0],
    smokeCapacity * puffsPerSmoke,
    SCENE_OBJECT_NAMES.chimneySmoke,
    "normal",
  );
  return { ...base, puffsPerSmoke, palettes: presetPalettes(CHIMNEY_SMOKE_LOOK.palette) };
}

/**
 * Reduced motion: every running smoke is released and nothing is drawn (the instant state is MFW-60's window glow). Else per active
 * entry: a missing origin, a non-safe-integer stretch or an age ≥ chimneySmokeDurationMs releases it; per puff k a uniform scale
 * S(radius) at origin + s·T + (dx, dy, dz) (writeSmokePuffAt along the entry's tap-time drift), colour palettes[lightPreset][k mod len]. Returns the number of active
 * smokes. Allocation-free.
 */
export function writeChimneySmokeInstances(
  target: ChimneySmokeMesh,
  pool: ObjectPool<ChimneySmokeState>,
  origins: readonly WorldVec3[],
  nowMs: number,
  reducedMotion: boolean,
  lightPreset: LightPresetId,
  scratch: EffectFrameScratch,
  frame: EndlessRiverFrame | null = null,
): number {
  if (reducedMotion) {
    if (pool.activeCount > 0) pool.releaseAll();
    finishWrite(target, 0);
    return 0;
  }
  let n = 0;
  let smokes = 0;
  const palette = target.palettes[lightPreset];
  const life = chimneySmokeDurationMs(target.puffsPerSmoke);
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const origin = origins[e.state.houseIndex];
    const age = nowMs - e.startedAtMs;
    if (origin === undefined || !writeStretchOffset(frame, e.state.stretchIndex) || age >= life) {
      pool.release(e);
      continue;
    }
    smokes++;
    for (let k = 0; k < target.puffsPerSmoke && n < target.capacity; k++) {
      const f = writeSmokePuffAt(age, k, e.state.driftX, e.state.driftZ, scratch.smoke);
      if (!f.visible) continue;
      scratch.matrix
        .makeScale(f.radius, f.radius, f.radius)
        .setPosition(origin.x + scratchOffset.x + f.dx, origin.y + f.dy, origin.z + scratchOffset.z + f.dz);
      target.mesh.setMatrixAt(n, scratch.matrix);
      target.mesh.setColorAt(n, palette[k % palette.length]);
      n++;
    }
  }
  finishWrite(target, n);
  return smokes;
}

/** Falling leaves (MFW-72): `leavesPerFall` MFW-69 leaf shells per fall, NormalBlending (they fade by shrinking). */
export interface FallingLeafMesh extends EffectMesh {
  readonly leavesPerFall: number;
  readonly palettes: Readonly<Record<LightPresetId, readonly Color[]>>;
}

const VECTOR3_ITEM_SIZE = 3;
const INDEX_ITEM_SIZE = 1;

/** The unit leaf shell (FALLING_LEAF_LOOK.shell): indexed position + computed normals, centred on its box; no vertex colours. */
function createFallingLeafGeometry(): BufferGeometry {
  const data = buildLeafShellMeshData(FALLING_LEAF_LOOK.shell);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, VECTOR3_ITEM_SIZE));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeVertexNormals();
  geometry.center();
  return geometry;
}

export function createFallingLeafMesh(fallCapacity: number, leavesPerFall: number): FallingLeafMesh {
  assertCapacity(fallCapacity);
  assertCapacity(leavesPerFall);
  const base = setupEffectMesh(
    createFallingLeafGeometry(),
    FALLING_LEAF_LOOK.palette.DAY[0],
    fallCapacity * leavesPerFall,
    SCENE_OBJECT_NAMES.fallingLeaves,
    "normal",
  );
  return { ...base, leavesPerFall, palettes: presetPalettes(FALLING_LEAF_LOOK.palette) };
}

/**
 * Same release rules as the smoke (reduced motion, missing anchor, bad stretch, age ≥ fallingLeavesDurationMs). Per leaf slot
 * k < min(leavesPerFall, anchor.slots): position = lerp(spawn, landing, fall) + (−windZ, 0, windX)·sway + s·T; rotation
 * Euler(tilt, yaw, 0, "YXZ"); scale = length·size; colour palettes[lightPreset][k mod len]. Returns the number of active falls.
 * Allocation-free.
 */
export function writeFallingLeafInstances(
  target: FallingLeafMesh,
  pool: ObjectPool<FallingLeavesState>,
  anchors: readonly TreeLeafAnchor[],
  nowMs: number,
  reducedMotion: boolean,
  lightPreset: LightPresetId,
  scratch: EffectFrameScratch,
  frame: EndlessRiverFrame | null = null,
): number {
  if (reducedMotion) {
    if (pool.activeCount > 0) pool.releaseAll();
    finishWrite(target, 0);
    return 0;
  }
  let n = 0;
  let falls = 0;
  const palette = target.palettes[lightPreset];
  const life = fallingLeavesDurationMs(target.leavesPerFall);
  const wx = TAP_SHAKE_WIND.windDirX;
  const wz = TAP_SHAKE_WIND.windDirZ;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const anchor = anchors[e.state.treeIndex];
    const age = nowMs - e.startedAtMs;
    if (anchor === undefined || !writeStretchOffset(frame, e.state.stretchIndex) || age >= life) {
      pool.release(e);
      continue;
    }
    falls++;
    const leaves = Math.min(target.leavesPerFall, anchor.slots);
    const p = anchor.paths;
    for (let k = 0; k < leaves && n < target.capacity; k++) {
      const f = writeFallingLeafAt(age, k, scratch.leaf);
      if (!f.visible) continue;
      const o = k * TREE_LEAF_PATH_STRIDE;
      scratch.position.set(
        p[o] + (p[o + 3] - p[o]) * f.fall - wz * f.sway + scratchOffset.x,
        p[o + 1] + (p[o + 4] - p[o + 1]) * f.fall,
        p[o + 2] + (p[o + 5] - p[o + 2]) * f.fall + wx * f.sway + scratchOffset.z,
      );
      scratch.quaternion.setFromEuler(scratch.euler.set(f.tiltRad, f.yawRad, 0, "YXZ"));
      const size = FALLING_LEAF_LOOK.length * f.size;
      scratch.scale.set(size, size, size);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      target.mesh.setMatrixAt(n, scratch.matrix);
      target.mesh.setColorAt(n, palette[k % palette.length]);
      n++;
    }
  }
  finishWrite(target, n);
  return falls;
}

/** Disposes geometry, material and the mesh (instance buffers). R3F never disposes a <primitive>. */
export function disposeEffectMesh(target: EffectMesh): void {
  target.mesh.geometry.dispose();
  const material = target.mesh.material;
  if (Array.isArray(material)) for (const m of material) m.dispose();
  else material.dispose();
  target.mesh.dispose();
}
