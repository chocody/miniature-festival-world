import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { KRATHONG_LODS, type KrathongLod, type KrathongMeshSpec } from "@/config/krathongModel.config";
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
  /** Same object for the same (key, lod), every call; default lod "full". Identical mesh specs share one geometry (MFW-69). */
  geometry(key: KrathongGeometryKey, lod?: KrathongLod): BufferGeometry;
  material(key: KrathongMaterialKey): MeshStandardMaterial;
  /** Every distinct geometry once. */
  listGeometries(): readonly BufferGeometry[];
  listMaterials(): readonly MeshStandardMaterial[];
  /** Shared flame flicker of this canvas: written once per frame by <FlameFlicker>, read by KrathongModel and the river batch. */
  readonly flameFlicker: FlameFlickerFrame;
  /** Disposes every geometry and material once; idempotent. */
  dispose(): void;
}

const POSITION_ITEM_SIZE = 3;
const INDEX_ITEM_SIZE = 1;

/** Parametric clay mesh (v2 MFW-48, v3 MFW-69): indexed closed solid with smooth normals. */
function buildGeometry(spec: KrathongMeshSpec): BufferGeometry {
  const data = buildKrathongMeshData(spec);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, POSITION_ITEM_SIZE));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const lodKey = (key: string, lod: string) => `${key}@${lod}`;

/**
 * One three geometry per (key, LOD) and one material per key; every krathong part under one canvas shares them.
 * All LODs are built eagerly (pure CPU, small buffers); only the ones drawn are uploaded to the GPU.
 */
export function createKrathongAssets(): KrathongAssets {
  const bySpec = new Map<KrathongMeshSpec, BufferGeometry>();
  const geometries = new Map<string, BufferGeometry>();
  for (const key of KRATHONG_GEOMETRY_KEYS) {
    for (const lod of KRATHONG_LODS) {
      const spec = meshSpecFor(key, lod);
      let geometry = bySpec.get(spec);
      if (geometry === undefined) {
        geometry = buildGeometry(spec);
        bySpec.set(spec, geometry);
      }
      geometries.set(lodKey(key, lod), geometry);
    }
  }
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
    geometry(key, lod = "full") {
      const found = geometries.get(lodKey(key, lod));
      if (!found) throw new Error(`unknown krathong asset key: ${key}`);
      return found;
    },
    material(key) {
      const found = materials.get(key);
      if (!found) throw new Error(`unknown krathong asset key: ${key}`);
      return found;
    },
    listGeometries: () => [...bySpec.values()],
    listMaterials: () => [...materials.values()],
    flameFlicker: createFlameFlickerFrame(),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of bySpec.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}
