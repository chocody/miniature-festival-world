import { InstancedMesh, Matrix4, type BufferGeometry, type MeshStandardMaterial } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import type { KrathongDesignId } from "@/config/krathongDesigns.config";

const IDENTITY = new Matrix4();

/** MFW-78: userData key holding the design id of the hero body (read by e2e through the scene probe). */
export const KRATHONG_DESIGN_USERDATA_KEY = "krathongDesign";

/**
 * The hero (customizer / pier) body of an owner-supplied design (MFW-65): a 1-instance InstancedMesh, so the hero and the
 * river batch share ONE program variant of the vertex-colour material. The geometry and material belong to the krathong
 * assets: dispose only the mesh (its instance buffer), never them. MFW-78: `userData[KRATHONG_DESIGN_USERDATA_KEY]` = design, set once.
 */
export function createDesignHeroMesh(geometry: BufferGeometry, material: MeshStandardMaterial, design: KrathongDesignId): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, 1);
  mesh.userData[KRATHONG_DESIGN_USERDATA_KEY] = design;
  mesh.setMatrixAt(0, IDENTITY);
  mesh.name = SCENE_OBJECT_NAMES.krathongDesignBody;
  mesh.receiveShadow = false;
  return mesh;
}
