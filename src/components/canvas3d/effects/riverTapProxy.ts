import { IcosahedronGeometry, MeshBasicMaterial, type BufferGeometry, type Material } from "three";
import { RIVER_KRATHONG_TAP_RADIUS } from "@/config/gimmicks.config";

/** Icosahedron detail 0 = 20 flat faces. */
const ICOSAHEDRON_DETAIL = 0;

/** One invisible low-poly sphere shared by every river krathong's hit proxy (rendered with visible={false}: raycast only, no draw call). */
export interface RiverTapProxy {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  dispose(): void;
}

export function createRiverTapProxy(radius: number = RIVER_KRATHONG_TAP_RADIUS): RiverTapProxy {
  const geometry = new IcosahedronGeometry(radius, ICOSAHEDRON_DETAIL);
  const material = new MeshBasicMaterial();
  return {
    geometry,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
