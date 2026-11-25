import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import {
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  materialSpecFor,
  meshSpecFor,
  type KrathongGeometryKey,
  type KrathongMaterialKey,
} from "@/core/customization";
import { createFlameFlickerFrame, type FlameFlickerFrame } from "@/core/customization/flameFlicker";
import { buildKrathongMeshData } from "@/core/customization/krathongMeshData";

export interface KrathongAssets {
  /** Same object for the same key, every call. */
  geometry(key: KrathongGeometryKey): BufferGeometry;
  material(key: KrathongMaterialKey): MeshStandardMaterial;
  listGeometries(): readonly BufferGeometry[];
  listMaterials(): readonly MeshStandardMaterial[];
  /** Shared flame flicker of this canvas: written once per frame by <FlameFlicker>, read by KrathongModel and the river batch. */
  readonly flameFlicker: FlameFlickerFrame;
  /** Disposes every geometry and material once; idempotent. */
  dispose(): void;
}

const POSITION_ITEM_SIZE = 3;
const INDEX_ITEM_SIZE = 1;

/** v2 parametric clay mesh (MFW-48): indexed closed solid with smooth normals. */
function buildGeometry(key: KrathongGeometryKey): BufferGeometry {
  const data = buildKrathongMeshData(meshSpecFor(key));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, POSITION_ITEM_SIZE));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One three geometry/material per key; every krathong part under one canvas shares them. */
export function createKrathongAssets(): KrathongAssets {
  const geometries = new Map<string, BufferGeometry>(
    KRATHONG_GEOMETRY_KEYS.map((key) => [key, buildGeometry(key)]),
  );
  const materials = new Map<string, MeshStandardMaterial>(
    KRATHONG_MATERIAL_KEYS.map((key) => {
      const { color, roughness, metalness, emissive, emissiveIntensity } = materialSpecFor(key);
      return [
        key,
        new MeshStandardMaterial({
          color,
          roughness,
          metalness,
          ...(emissive ? { emissive, emissiveIntensity } : {}),
        }),
      ];
    }),
  );
  let disposed = false;
  return {
    geometry(key) {
      const found = geometries.get(key);
      if (!found) throw new Error(`unknown krathong asset key: ${key}`);
      return found;
    },
    material(key) {
      const found = materials.get(key);
      if (!found) throw new Error(`unknown krathong asset key: ${key}`);
      return found;
    },
    listGeometries: () => [...geometries.values()],
    listMaterials: () => [...materials.values()],
    flameFlicker: createFlameFlickerFrame(),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}
