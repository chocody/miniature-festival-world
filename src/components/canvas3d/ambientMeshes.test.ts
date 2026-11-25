// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FrontSide, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Raycaster, Vector3 } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { AMBIENT_MOTE_FAN, AMBIENT_MOTES, LANTERN_FLICKER } from "@/config/events/loyKrathong.life.config";
import { AMBIENT_MOTE_LOOK } from "@/config/look.config";
import { lanternFlickerFactor, prepareMoteAnchors } from "@/core/world";
import {
  applyMoteLook,
  createMoteGeometry,
  createMoteInstances,
  createMoteMaterial,
  createMoteWriteScratch,
  writeLanternFlicker,
  writeMoteInstances,
} from "./ambientMeshes";
import { createBlobShadowMaterial, NO_RAYCAST } from "./blobShadowMeshes";
import { countTriangles } from "./geometry";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

const hex = (c: string) => c.slice(1).toLowerCase();

describe("ambient meshes (MFW-50 AC3, AC5)", () => {
  it("AM1 the soft mote: RGBA vertex alpha (1 at each centre, 0 at the rim), three crossed fans", () => {
    const g = createMoteGeometry();
    const color = g.getAttribute("color");
    expect(color.itemSize).toBe(4);
    for (let i = 0; i < color.count; i++) {
      expect([color.getX(i), color.getY(i), color.getZ(i)]).toEqual([1, 1, 1]);
      expect([0, 1]).toContain(color.getW(i));
    }
    expect(countTriangles(g)).toBe(3 * AMBIENT_MOTE_FAN.segments * (2 * AMBIENT_MOTE_FAN.rings - 1));
    g.dispose();
  });

  it("AM2 the mote material is the shared fan program; a preset switch recolours the same object", () => {
    const m = createMoteMaterial("NIGHT");
    const blob = createBlobShadowMaterial();
    expect(m).toBeInstanceOf(MeshBasicMaterial);
    expect(m.vertexColors).toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.toneMapped).toBe(true);
    expect(m.side).toBe(FrontSide);
    expect(m.blending).toBe(blob.blending);
    expect(m.color.getHexString()).toBe(hex(AMBIENT_MOTE_LOOK.NIGHT.color));
    applyMoteLook(m, "DAY");
    expect(m.color.getHexString()).toBe(hex(AMBIENT_MOTE_LOOK.DAY.color));
    expect(m.opacity).toBe(AMBIENT_MOTE_LOOK.DAY.opacity);
    applyMoteLook(m, "NIGHT");
    expect(m.opacity).toBe(AMBIENT_MOTE_LOOK.NIGHT.opacity);
    m.dispose();
    blob.dispose();
  });

  it("AM3 motes: name, NO_RAYCAST (a real raycaster misses), never culled, no shadows, count = capacity", () => {
    const g = createMoteGeometry();
    const m = createMoteMaterial("NIGHT");
    const mesh = createMoteInstances(g, m, 6);
    expect(mesh.name).toBe(SCENE_OBJECT_NAMES.ambientMotes);
    expect(mesh.raycast).toBe(NO_RAYCAST);
    expect(mesh.frustumCulled).toBe(false);
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, false]);
    expect(mesh.count).toBe(6);
    const anchors = prepareMoteAnchors(6, layout.channel, layout.bankProfile, AMBIENT_MOTES);
    writeMoteInstances(mesh, anchors, 0, false, AMBIENT_MOTES, createMoteWriteScratch());
    const at = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(mesh.instanceMatrix.array as Float32Array, 0));
    expect(new Raycaster(new Vector3(at.x, at.y + 5, at.z), new Vector3(0, -1, 0)).intersectObject(mesh)).toEqual([]);
    mesh.dispose();
    g.dispose();
    m.dispose();
  });

  it("AM5 writeLanternFlicker: base × factor, exactly base when not animated", () => {
    const m = new MeshStandardMaterial();
    writeLanternFlicker(m, 1.2, 777, true, LANTERN_FLICKER);
    expect(m.emissiveIntensity).toBeCloseTo(1.2 * lanternFlickerFactor(777, true, LANTERN_FLICKER), 12);
    writeLanternFlicker(m, 1.2, 777, false, LANTERN_FLICKER);
    expect(m.emissiveIntensity).toBe(1.2);
    m.dispose();
  });
});
