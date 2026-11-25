import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
  type BufferGeometry,
} from "three";
import { LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";
import type { PartGeometrySpec, ScenePartSpec } from "@/config/scene.config";
import {
  createLampGlowFrame,
  createRippleFrame,
  writeLampGlowFrameAt,
  writeRippleFrameAt,
  type LampGlowFrame,
  type LampGlowState,
  type ObjectPool,
  type RippleFrame,
  type RippleState,
} from "@/core/effects";
import type { InstanceTransform } from "@/core/world";
import { createPartGeometry } from "../geometry";
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
  readonly color: Color;
  readonly ripple: RippleFrame;
  readonly glow: LampGlowFrame;
}

export function createEffectFrameScratch(): EffectFrameScratch {
  return { matrix: new Matrix4(), color: new Color(), ripple: createRippleFrame(), glow: createLampGlowFrame() };
}

/** Effects never intercept taps. */
const NO_RAYCAST: InstancedMesh["raycast"] = () => {};

function assertCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("effect mesh capacity must be a positive integer");
}

function setupEffectMesh(geometry: BufferGeometry, color: string, capacity: number, name: string): EffectMesh {
  const material = new MeshBasicMaterial({
    blending: AdditiveBlending,
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

/** Disposes geometry, material and the mesh (instance buffers). R3F never disposes a <primitive>. */
export function disposeEffectMesh(target: EffectMesh): void {
  target.mesh.geometry.dispose();
  const material = target.mesh.material;
  if (Array.isArray(material)) for (const m of material) m.dispose();
  else material.dispose();
  target.mesh.dispose();
}
