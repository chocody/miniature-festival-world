import { InstancedMesh, Matrix4, type BufferGeometry, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { AMBIENT_MOTE_FAN } from "@/config/events/loyKrathong.life.config";
import { AMBIENT_MOTE_LOOK, type LightPresetId } from "@/config/look.config";
import {
  buildCrossedFanData,
  createMoteFrameOut,
  lanternFlickerFactor,
  moteFrameInto,
  type AmbientMoteSpec,
  type LanternFlickerSpec,
  type MoteAnchor,
  type MoteFrameOut,
} from "@/core/world";
import { createFanMaterial, createVertexAlphaGeometry, NO_RAYCAST } from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

/**
 * Soft mote (owner, 2026-11-25: tiny soft points, no hard edge, no halo): the vertex-alpha blob fan crossed in three planes, unit
 * radius. position(3) + RGBA colour(4) + index, so it shares the blob / fan shader program (no new program).
 */
export function createMoteGeometry(): BufferGeometry {
  return createVertexAlphaGeometry(buildCrossedFanData(AMBIENT_MOTE_FAN));
}

/** The fan material (unlit, transparent, vertex alpha, no depth write), coloured for `preset`. */
export function createMoteMaterial(preset: LightPresetId): MeshBasicMaterial {
  return createFanMaterial({ ...AMBIENT_MOTE_LOOK[preset], additive: false });
}

/** A preset switch recolours the same material (a uniform change: nothing is re-created or recompiled). */
export function applyMoteLook(material: MeshBasicMaterial, preset: LightPresetId): void {
  const look = AMBIENT_MOTE_LOOK[preset];
  material.color.set(look.color);
  material.opacity = look.opacity;
}

/** One draw call for every mote: never culled, no shadows, never takes taps (AC5), count = capacity. */
export function createMoteInstances(geometry: BufferGeometry, material: MeshBasicMaterial, count: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = SCENE_OBJECT_NAMES.ambientMotes;
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

export interface MoteWriteScratch {
  readonly frame: MoteFrameOut;
  readonly matrix: Matrix4;
}

export function createMoteWriteScratch(): MoteWriteScratch {
  return { frame: createMoteFrameOut(), matrix: new Matrix4() };
}

/** Allocation-free per-frame writer of every mote (moteFrameInto → uniform scale + position). */
export function writeMoteInstances(
  mesh: InstancedMesh,
  anchors: readonly MoteAnchor[],
  timeMs: number,
  animated: boolean,
  spec: AmbientMoteSpec,
  scratch: MoteWriteScratch,
): void {
  const f = scratch.frame;
  for (let i = 0; i < anchors.length; i++) {
    moteFrameInto(anchors[i], timeMs, animated, spec, f);
    mesh.setMatrixAt(i, scratch.matrix.makeScale(f.radius, f.radius, f.radius).setPosition(f.x, f.y, f.z));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Lamp-head emissive = base × flicker factor (a uniform: no recompile, no halo); exactly base when not animated. */
export function writeLanternFlicker(
  material: MeshStandardMaterial,
  baseIntensity: number,
  timeMs: number,
  animated: boolean,
  spec: LanternFlickerSpec,
): void {
  material.emissiveIntensity = baseIntensity * lanternFlickerFactor(timeMs, animated, spec);
}
