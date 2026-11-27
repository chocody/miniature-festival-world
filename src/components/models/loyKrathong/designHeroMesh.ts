import { InstancedMesh, Matrix4, type BufferGeometry, type MeshStandardMaterial } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";

const IDENTITY = new Matrix4();

/**
 * The hero (customizer / pier) body of an owner-supplied design (MFW-65): a 1-instance InstancedMesh, so the hero and the
 * river batch share ONE program variant of the vertex-colour material. The geometry and material belong to the krathong
 * assets: dispose only the mesh (its instance buffer), never them.
 */
export function createDesignHeroMesh(geometry: BufferGeometry, material: MeshStandardMaterial): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, 1);
  mesh.setMatrixAt(0, IDENTITY);
  mesh.name = SCENE_OBJECT_NAMES.krathongDesignBody;
  mesh.receiveShadow = false;
  return mesh;
}
