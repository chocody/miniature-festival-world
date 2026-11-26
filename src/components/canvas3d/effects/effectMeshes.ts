import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  RingGeometry,
  type BufferGeometry,
} from "three";
import {
  FIREWORK_LOOK,
  FIREWORK_SPARK_GEOMETRY,
  LAMP_GLOW_LOOK,
  NO_BOUNCE,
  RIPPLE_LOOK,
  SKY_LANTERN_LOOK,
  WINDOW_GLOW_LOOK,
} from "@/config/gimmicks.config";
import type { PartGeometrySpec, ScenePartSpec } from "@/config/scene.config";
import {
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
import type { InstanceTransform } from "@/core/world";
import { createPartGeometry } from "../geometry";
import { composeInstanceMatrix } from "../instancing";
import { SCENE_OBJECT_NAMES } from "../sceneObjectNames";

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
  };
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

/** Same for lamp glows; an entry whose lampIndex is outside `lamps` is released. Returns n. */
export function writeLampGlowInstances(
  target: EffectMesh,
  pool: ObjectPool<LampGlowState>,
  lamps: readonly InstanceTransform[],
  lampHead: Pick<ScenePartSpec, "yOffset">,
  nowMs: number,
  reducedMotion: boolean,
  scratch: EffectFrameScratch,
): number {
  let n = 0;
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const lamp = lamps[e.state.lampIndex];
    if (lamp === undefined) {
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
      .setPosition(lamp.position.x, lamp.position.y + lampHead.yOffset * lamp.scale, lamp.position.z);
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
 * and NO_BOUNCE: attack, steady hold, release; no flicker). Returns the instance count. Allocation-free.
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
): number {
  let n = 0;
  if (pool.activeCount > 0) {
    scratch.scaleMatrix.makeScale(WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale, WINDOW_GLOW_LOOK.shellScale);
  }
  for (let s = 0; s < pool.capacity; s++) {
    const e = pool.entryAt(s);
    if (!e.active) continue;
    const first = e.state.houseIndex * windowsPerHouse;
    if (!Number.isInteger(first) || first < 0 || first + windowsPerHouse > houseWindows.length || n + windowsPerHouse > target.capacity) {
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

/** Disposes geometry, material and the mesh (instance buffers). R3F never disposes a <primitive>. */
export function disposeEffectMesh(target: EffectMesh): void {
  target.mesh.geometry.dispose();
  const material = target.mesh.material;
  if (Array.isArray(material)) for (const m of material) m.dispose();
  else material.dispose();
  target.mesh.dispose();
}
