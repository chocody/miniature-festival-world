import { DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import type { KrathongLod } from "@/config/krathongModel.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import {
  assembleKrathong,
  KRATHONG_INSTANCE_BUCKETS,
  krathongInstanceBucketIndex,
  type KrathongAppearance,
  type KrathongPartInstance,
} from "@/core/customization";
import { STATIC_FLAME_FLICKER, type FlameFlickerFrame } from "@/core/customization/flameFlicker";
import { writeYawTwistQuaternion } from "@/core/customization/uprightConstraint";
import type { KrathongAssets } from "./krathongAssets";

/** Elements of one 4×4 instance matrix. */
const MATRIX_ELEMENTS = 16;
/** mesh.userData key that holds the bucket index (lets a tap handler map event.object + instanceId to an item, MFW-28). */
export const KRATHONG_BATCH_BUCKET_USERDATA_KEY = "krathongBucketIndex";

/** One part of one river krathong: where it goes in the batch and its model-local transform. Render-time only (invariant A). */
export interface PlannedKrathongPart {
  readonly bucketIndex: number;
  readonly slot: number; // instance index inside its bucket mesh
  readonly upright: boolean; // true for the centre-anchor parts (candle, flame, incense)
  readonly flicker: boolean; // true for the flame: scaled per frame by the canvas-shared flicker (MFW-48)
  readonly local: Matrix4; // T(localPosition) · R_y(rotationY) · S(scale), as KrathongModel renders it
}
export interface PlannedKrathongItem {
  readonly anchorLocal: Vector3; // assembly.centerAnchor.localPosition
  readonly parts: readonly PlannedKrathongPart[];
}
/** Built once per item list (zone load, tier change), never per frame. */
export interface KrathongInstancePlan {
  readonly items: readonly PlannedKrathongItem[]; // index = the item's index in the rendered list
  readonly bucketCounts: readonly number[]; // used instances per bucket (length = bucket count)
  readonly slotItems: readonly (readonly number[])[]; // per bucket: slot → item index
}
/** Where the writer puts matrices (the batch component: meshes[bucketIndex].setMatrixAt(slot, m)). */
export interface KrathongInstanceSink {
  setMatrixAt(bucketIndex: number, slot: number, matrix: Matrix4): void;
}

const scratchAnchorPosition = new Vector3();
const scratchTwist = new Quaternion();
const scratchScale = new Vector3();
const scratchUpright = new Matrix4();
const scratchOut = new Matrix4();
const scratchFlickerScale = new Vector3();

/** One reusable upload range per batch mesh: three clears `updateRanges` after each upload, so a fresh object per frame would allocate. */
interface UploadRange {
  start: number;
  count: number;
}
const uploadRanges = new WeakMap<InstancedMesh, UploadRange>();

function uploadRangeOf(mesh: InstancedMesh): UploadRange {
  let range = uploadRanges.get(mesh);
  if (range === undefined) {
    range = { start: 0, count: 0 }; // a mesh not made by the factory: one allocation, then reused
    uploadRanges.set(mesh, range);
  }
  return range;
}

function assertMaxItems(maxItems: number): void {
  if (!Number.isSafeInteger(maxItems) || maxItems < 0) throw new RangeError("maxItems must be a non-negative integer");
}

function localMatrixOf(part: KrathongPartInstance): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...part.localPosition),
    new Quaternion().setFromEuler(new Euler(0, part.rotationY, 0)),
    new Vector3(...part.scale),
  );
}

export function planKrathongInstances(
  appearances: readonly KrathongAppearance[],
  maxItems: number = ZONE_ITEM_CAP,
): KrathongInstancePlan {
  assertMaxItems(maxItems);
  const n = KRATHONG_INSTANCE_BUCKETS.length;
  const counts = new Array<number>(n).fill(0);
  const slotItems = Array.from({ length: n }, () => [] as number[]);
  const capacity = KRATHONG_INSTANCE_BUCKETS.map((b) => b.maxPerKrathong * maxItems);
  const items: PlannedKrathongItem[] = [];
  const itemCount = Math.min(appearances.length, maxItems);
  for (let i = 0; i < itemCount; i++) {
    const assembly = assembleKrathong(appearances[i]);
    const parts: PlannedKrathongPart[] = [];
    const place = (part: KrathongPartInstance, upright: boolean) => {
      const b = krathongInstanceBucketIndex(part.geometryKey, part.materialKey);
      if (b === null || counts[b] >= capacity[b]) return; // defensive: a test proves it never happens
      const slot = counts[b]++;
      slotItems[b].push(i);
      parts.push(Object.freeze({ bucketIndex: b, slot, upright, flicker: part.role === "flame", local: localMatrixOf(part) }));
    };
    for (const part of assembly.body) place(part, false);
    for (const part of assembly.centerAnchor.parts) place(part, true);
    items.push(
      Object.freeze({ anchorLocal: new Vector3(...assembly.centerAnchor.localPosition), parts: Object.freeze(parts) }),
    );
  }
  return Object.freeze({
    items: Object.freeze(items),
    bucketCounts: Object.freeze(counts),
    slotItems: Object.freeze(slotItems.map((s) => Object.freeze(s))),
  });
}

/**
 * Per frame, no allocation. `itemMatrix` / `itemQuaternion` are the item anchor group's local matrix / quaternion in the
 * river-flow space, which is also the batch's space. Upright parts get the item's yaw twist (the UprightAnchor rule).
 * The flame part is scaled by `flame` (the canvas-shared flicker, MFW-48) in its own frame, as KrathongModel does.
 */
export function writeKrathongItemInstances(
  plan: KrathongInstancePlan,
  itemIndex: number,
  itemMatrix: Matrix4,
  itemQuaternion: Quaternion,
  sink: KrathongInstanceSink,
  flame: Readonly<FlameFlickerFrame> = STATIC_FLAME_FLICKER,
): void {
  const item = plan.items[itemIndex];
  if (item === undefined) return;
  scratchAnchorPosition.copy(item.anchorLocal).applyMatrix4(itemMatrix);
  writeYawTwistQuaternion(itemQuaternion, scratchTwist);
  scratchScale.setFromMatrixScale(itemMatrix);
  scratchUpright.compose(scratchAnchorPosition, scratchTwist, scratchScale);
  const parts = item.parts;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    scratchOut.multiplyMatrices(part.upright ? scratchUpright : itemMatrix, part.local);
    if (part.flicker) scratchOut.scale(scratchFlickerScale.set(flame.widthScale, flame.heightScale, flame.widthScale));
    sink.setMatrixAt(part.bucketIndex, part.slot, scratchOut);
  }
}

export function itemIndexForInstance(plan: KrathongInstancePlan, bucketIndex: number, instanceId: number): number | null {
  if (!Number.isSafeInteger(bucketIndex) || bucketIndex < 0 || !Number.isSafeInteger(instanceId) || instanceId < 0) return null;
  return plan.slotItems[bucketIndex]?.[instanceId] ?? null;
}

/** One persistent InstancedMesh per bucket, sharing the krathong assets. The batch never creates or disposes geometry or material. */
export function createKrathongBatchMeshes(
  assets: KrathongAssets,
  maxItems: number = ZONE_ITEM_CAP,
  lod: KrathongLod = "full",
): readonly InstancedMesh[] {
  assertMaxItems(maxItems);
  const meshes = KRATHONG_INSTANCE_BUCKETS.map((b, i) => {
    const mesh = new InstancedMesh(assets.geometry(b.geometryKey, lod), assets.material(b.materialKey), b.maxPerKrathong * maxItems);
    mesh.name = SCENE_OBJECT_NAMES.riverBatchMeshPrefix + i;
    mesh.userData[KRATHONG_BATCH_BUCKET_USERDATA_KEY] = i;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false; // instances move every frame; a stale bounding sphere must never cull them
    mesh.count = 0;
    mesh.visible = false;
    uploadRanges.set(mesh, { start: 0, count: 0 });
    return mesh;
  });
  return Object.freeze(meshes);
}

/**
 * Re-points each bucket mesh at the shared geometry of `lod` (MFW-69, tier change). Creates, disposes and allocates nothing;
 * called from a layout effect, never per frame. Part matrices do not depend on the LOD.
 */
export function applyKrathongBatchLod(meshes: readonly InstancedMesh[], assets: KrathongAssets, lod: KrathongLod): void {
  for (let i = 0; i < meshes.length; i++) {
    const bucket = KRATHONG_INSTANCE_BUCKETS[i];
    if (bucket === undefined) continue;
    const geometry = assets.geometry(bucket.geometryKey, lod);
    if (meshes[i].geometry !== geometry) {
      meshes[i].geometry = geometry;
      meshes[i].boundingSphere = null;
    }
  }
}

export function applyKrathongBatchPlan(meshes: readonly InstancedMesh[], plan: KrathongInstancePlan): void {
  for (let i = 0; i < meshes.length; i++) {
    meshes[i].count = plan.bucketCounts[i] ?? 0;
    meshes[i].visible = meshes[i].count > 0;
  }
}

/** Matches KrathongModel: every part casts, only the base receives. */
export function applyKrathongBatchShadows(meshes: readonly InstancedMesh[], shadows: boolean): void {
  for (let i = 0; i < meshes.length; i++) {
    meshes[i].castShadow = shadows;
    meshes[i].receiveShadow = shadows && KRATHONG_INSTANCE_BUCKETS[i]?.role === "base";
  }
}

/** Per frame, no allocation: uploads only the used range of each bucket. */
export function commitKrathongBatch(meshes: readonly InstancedMesh[], plan: KrathongInstancePlan): void {
  for (let i = 0; i < meshes.length; i++) {
    const count = plan.bucketCounts[i] ?? 0;
    if (count <= 0) continue;
    const attr = meshes[i].instanceMatrix;
    const range = uploadRangeOf(meshes[i]);
    range.start = 0;
    range.count = count * MATRIX_ELEMENTS;
    const ranges = attr.updateRanges;
    if (ranges.length !== 1 || ranges[0] !== range) {
      ranges.length = 0;
      ranges.push(range);
    }
    attr.needsUpdate = true;
    meshes[i].boundingSphere = null; // a later raycast recomputes it from the current matrices
  }
}

/** Releases the instance buffers. Does not touch the shared geometry or material. */
export function disposeKrathongBatch(meshes: readonly InstancedMesh[]): void {
  for (let i = 0; i < meshes.length; i++) meshes[i].dispose();
}
