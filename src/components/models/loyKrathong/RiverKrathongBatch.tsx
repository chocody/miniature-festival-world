"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, type Ref } from "react";
import type { InstancedMesh, Matrix4, Quaternion } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { useKrathongAssets } from "./KrathongAssetsProvider";
import {
  applyKrathongBatchPlan,
  applyKrathongBatchShadows,
  commitKrathongBatch,
  createKrathongBatchMeshes,
  disposeKrathongBatch,
  writeKrathongItemInstances,
  type KrathongInstancePlan,
  type KrathongInstanceSink,
} from "./riverKrathongBatch";

export interface RiverKrathongBatchHandle {
  /** The persistent bucket meshes (same array for the batch's lifetime). For tests and the perf audit. */
  readonly meshes: readonly InstancedMesh[];
  /** Per frame: write every part of item `itemIndex` from its anchor matrix/quaternion (river-flow space). Allocation-free. */
  writeItem(itemIndex: number, itemMatrix: Matrix4, itemQuaternion: Quaternion): void;
  /** Per frame, after all writeItem calls: upload only the used ranges. */
  commit(): void;
}
export interface RiverKrathongBatchProps {
  readonly plan: KrathongInstancePlan;
  readonly shadows: boolean; // RiverFlow's castShadow (shadows && riverItemCastShadow)
  readonly ref?: Ref<RiverKrathongBatchHandle>;
}

/** All river krathongs in ≤ KRATHONG_INSTANCE_BUCKET_COUNT draw calls. Created once per canvas; zone switches only re-plan (MFW-34). */
export function RiverKrathongBatch({ plan, shadows, ref }: RiverKrathongBatchProps) {
  const assets = useKrathongAssets();
  const meshes = useMemo(() => createKrathongBatchMeshes(assets), [assets]);
  const sink = useMemo<KrathongInstanceSink>(
    () => ({ setMatrixAt: (bucketIndex, slot, matrix) => meshes[bucketIndex]?.setMatrixAt(slot, matrix) }),
    [meshes],
  );
  useEffect(() => () => disposeKrathongBatch(meshes), [meshes]);
  useLayoutEffect(() => applyKrathongBatchPlan(meshes, plan), [meshes, plan]);
  useLayoutEffect(() => applyKrathongBatchShadows(meshes, shadows), [meshes, shadows]);
  useImperativeHandle(
    ref,
    () => ({
      meshes,
      writeItem: (itemIndex, itemMatrix, itemQuaternion) =>
        writeKrathongItemInstances(plan, itemIndex, itemMatrix, itemQuaternion, sink),
      commit: () => commitKrathongBatch(meshes, plan),
    }),
    [meshes, plan, sink],
  );
  return (
    <group name={SCENE_OBJECT_NAMES.riverKrathongBatch}>
      {meshes.map((mesh) => (
        <primitive key={mesh.name} object={mesh} />
      ))}
    </group>
  );
}
