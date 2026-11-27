import { BufferGeometry, DynamicDrawUsage, Group, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { perfSoakAppearance } from "@/components/canvas3d/perfSoak";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import {
  assembleKrathong,
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_INSTANCE_BUCKET_COUNT,
  KRATHONG_INSTANCE_BUCKETS,
  type KrathongAppearance,
  type KrathongPartInstance,
} from "@/core/customization";
import { computeUprightLocalQuaternion } from "@/core/customization/uprightConstraint";
import { RIVER_ITEM_EULER_ORDER } from "@/core/world/riverFlow";
import { KRATHONG_DESIGN_MAX_FLAMES, type KrathongDesignId } from "@/config/krathongDesigns.config";
import { krathongInstanceBucketIndex, type KrathongFlameAnchor } from "@/core/customization";
import { parseKrathongDesignGlb } from "@/core/customization/krathongDesignGlb";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import { createKrathongAssets } from "./krathongAssets";
import {
  applyKrathongBatchLod,
  applyKrathongBatchPlan,
  applyKrathongBatchShadows,
  commitKrathongBatch,
  createKrathongBatchMeshes,
  itemIndexForInstance,
  KRATHONG_BATCH_BUCKET_USERDATA_KEY,
  planKrathongInstances,
  writeKrathongItemInstances,
  type KrathongInstanceSink,
} from "./riverKrathongBatch";

function addPart(parent: Object3D, part: KrathongPartInstance): Object3D {
  const node = new Object3D();
  node.position.set(...part.localPosition);
  node.rotation.set(0, part.rotationY, 0);
  node.scale.set(...part.scale);
  parent.add(node);
  return node;
}

/** The real per-mesh tree: KrathongModel + UprightAnchor under river-flow under a rotated world-view group. */
function referenceKrathongMatrices(
  appearance: KrathongAppearance,
  itemPosition: readonly [number, number, number],
  itemEuler: readonly [number, number, number],
  worldViewYaw: number,
): Matrix4[] {
  const assembly = assembleKrathong(appearance);
  const worldView = new Group();
  worldView.rotation.y = worldViewYaw;
  worldView.position.set(1, 0, -2);
  const riverFlow = new Group();
  const item = new Group();
  item.position.set(...itemPosition);
  item.rotation.set(itemEuler[0], itemEuler[1], itemEuler[2], RIVER_ITEM_EULER_ORDER);
  item.scale.setScalar(RIVER_KRATHONG_SCALE);
  const model = new Group();
  worldView.add(riverFlow);
  riverFlow.add(item);
  item.add(model);
  const bodyNodes = assembly.body.map((p) => addPart(model, p));
  const anchor = new Object3D();
  anchor.position.set(...assembly.centerAnchor.localPosition);
  model.add(anchor);
  const anchorNodes = assembly.centerAnchor.parts.map((p) => addPart(anchor, p));
  worldView.updateMatrixWorld(true);
  computeUprightLocalQuaternion(model.getWorldQuaternion(new Quaternion()), anchor.quaternion);
  worldView.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(riverFlow.matrixWorld).invert();
  return [...bodyNodes, ...anchorNodes].map((n) => new Matrix4().copy(inverse).multiply(n.matrixWorld));
}

function itemGroup(position: readonly [number, number, number], euler: readonly [number, number, number]): Group {
  const g = new Group();
  g.position.set(...position);
  g.rotation.set(euler[0], euler[1], euler[2], RIVER_ITEM_EULER_ORDER);
  g.scale.setScalar(RIVER_KRATHONG_SCALE);
  g.updateMatrix();
  return g;
}

const NO_FLOWERS: KrathongAppearance = { ...DEFAULT_KRATHONG_APPEARANCE, flowers: [null, null, null, null, null, null, null, null] };

describe("planKrathongInstances / writeKrathongItemInstances", () => {
  it("matches the per-mesh model", () => {
    const position = [2.5, -0.2, 0.7] as const;
    const euler = [0.05, 1.3, -0.04] as const;
    for (const appearance of [DEFAULT_KRATHONG_APPEARANCE, NO_FLOWERS, perfSoakAppearance(5)]) {
      const expected = referenceKrathongMatrices(appearance, position, euler, 0.8);
      const plan = planKrathongInstances([appearance]);
      const stored = new Map<string, Matrix4>();
      const sink: KrathongInstanceSink = { setMatrixAt: (b, s, m) => void stored.set(`${b}:${s}`, m.clone()) };
      const item = itemGroup(position, euler);
      writeKrathongItemInstances(plan, 0, item.matrix, item.quaternion, sink);
      const parts = plan.items[0].parts;
      expect(parts).toHaveLength(expected.length);
      parts.forEach((part, i) => {
        const got = stored.get(`${part.bucketIndex}:${part.slot}`)!;
        for (let e = 0; e < 16; e++) expect(Math.abs(got.elements[e] - expected[i].elements[e])).toBeLessThan(1e-9);
      });
    }
  });

  it("MFW-48: flame instances get the shared flicker scale", () => {
    const position = [2.5, -0.2, 0.7] as const;
    const euler = [0.05, 1.3, -0.04] as const;
    const flicker = { heightScale: 1.1, widthScale: 0.95, emissiveScale: 1 };
    const expected = referenceKrathongMatrices(DEFAULT_KRATHONG_APPEARANCE, position, euler, 0.8);
    const plan = planKrathongInstances([DEFAULT_KRATHONG_APPEARANCE]);
    const stored = new Map<string, Matrix4>();
    const item = itemGroup(position, euler);
    writeKrathongItemInstances(plan, 0, item.matrix, item.quaternion, { setMatrixAt: (b, s, m) => void stored.set(`${b}:${s}`, m.clone()) }, flicker);
    const parts = plan.items[0].parts;
    expect(parts.filter((p) => p.flicker)).toHaveLength(1);
    const flameIndex = parts.findIndex((p) => KRATHONG_INSTANCE_BUCKETS[p.bucketIndex].role === "flame");
    expect(parts[flameIndex].flicker).toBe(true);
    parts.forEach((part, i) => {
      const want = part.flicker
        ? new Matrix4().multiplyMatrices(expected[i], new Matrix4().makeScale(flicker.widthScale, flicker.heightScale, flicker.widthScale))
        : expected[i];
      const got = stored.get(`${part.bucketIndex}:${part.slot}`)!;
      for (let e = 0; e < 16; e++) expect(Math.abs(got.elements[e] - want.elements[e])).toBeLessThan(1e-9);
      if (part.upright) {
        const dir = new Vector3(0, 1, 0).transformDirection(got);
        expect(Math.abs(dir.x)).toBeLessThan(1e-9);
        expect(Math.abs(dir.z)).toBeLessThan(1e-9);
      }
    });
  });

  it("upright parts stay upright", () => {
    const plan = planKrathongInstances([DEFAULT_KRATHONG_APPEARANCE]);
    const stored = new Map<string, Matrix4>();
    const item = itemGroup([0, 0, 0], [0.3, 0.9, -0.25]);
    writeKrathongItemInstances(plan, 0, item.matrix, item.quaternion, { setMatrixAt: (b, s, m) => void stored.set(`${b}:${s}`, m.clone()) });
    const uprightParts = plan.items[0].parts.filter((p) => p.upright);
    expect(uprightParts.length).toBeGreaterThan(0);
    for (const p of uprightParts) {
      const dir = new Vector3(0, 1, 0).transformDirection(stored.get(`${p.bucketIndex}:${p.slot}`)!);
      expect(Math.abs(dir.x)).toBeLessThan(1e-9);
      expect(Math.abs(dir.y - 1)).toBeLessThan(1e-9);
      expect(Math.abs(dir.z)).toBeLessThan(1e-9);
    }
  });

  it("slots are unique and dense, and map back to their item", () => {
    const plan = planKrathongInstances(Array.from({ length: ZONE_ITEM_CAP }, (_, k) => perfSoakAppearance(k)));
    plan.bucketCounts.forEach((count, b) => {
      const slots = plan.items.flatMap((it) => it.parts.filter((p) => p.bucketIndex === b).map((p) => p.slot));
      expect(slots.sort((x, y) => x - y)).toEqual(Array.from({ length: count }, (_, s) => s));
      plan.items.forEach((it, i) => {
        for (const p of it.parts) if (p.bucketIndex === b) expect(plan.slotItems[b][p.slot]).toBe(i);
      });
      for (let s = 0; s < count; s++) expect(itemIndexForInstance(plan, b, s)).toBe(plan.slotItems[b][s]);
      expect(itemIndexForInstance(plan, b, -1)).toBeNull();
      expect(itemIndexForInstance(plan, b, 1.5)).toBeNull();
      expect(itemIndexForInstance(plan, b, count)).toBeNull();
    });
    expect(itemIndexForInstance(plan, 999, 0)).toBeNull();
  });

  it("caps at maxItems and validates it", () => {
    const plan = planKrathongInstances(Array.from({ length: ZONE_ITEM_CAP + 5 }, (_, k) => perfSoakAppearance(k)));
    expect(plan.items).toHaveLength(ZONE_ITEM_CAP);
    expect(planKrathongInstances([], ZONE_ITEM_CAP).bucketCounts.every((c) => c === 0)).toBe(true);
    expect(() => planKrathongInstances([], -1)).toThrow(RangeError);
    expect(() => planKrathongInstances([], 2.5)).toThrow(RangeError);
  });
});

describe("batch meshes", () => {
  it("commit uploads only the used range", () => {
    const assets = createKrathongAssets();
    const meshes = createKrathongBatchMeshes(assets);
    const appearance = DEFAULT_KRATHONG_APPEARANCE;
    const plan = planKrathongInstances([appearance, appearance, appearance]);
    applyKrathongBatchPlan(meshes, plan);
    const before = meshes[0].instanceMatrix.version;
    commitKrathongBatch(meshes, plan);
    expect(meshes[0].instanceMatrix.updateRanges).toEqual([{ start: 0, count: 3 * 16 }]);
    expect(meshes[0].instanceMatrix.version).toBeGreaterThan(before);
    expect(meshes[0].boundingSphere).toBeNull();
    const empty = plan.bucketCounts.findIndex((c) => c === 0);
    expect(empty).toBeGreaterThanOrEqual(0);
    expect(meshes[empty].visible).toBe(false);
    expect(meshes[empty].instanceMatrix.version).toBe(0);
    assets.dispose();
  });

  it("meshes share the krathong assets and have fixed capacity", () => {
    const assets = createKrathongAssets();
    const meshes = createKrathongBatchMeshes(assets);
    expect(meshes).toHaveLength(KRATHONG_INSTANCE_BUCKET_COUNT);
    meshes.forEach((mesh, i) => {
      const b = KRATHONG_INSTANCE_BUCKETS[i];
      expect(mesh.geometry).toBe(assets.batchGeometry(b.geometryKey, "full"));
      expect(mesh.material).toBe(assets.batchMaterial(b.materialKey));
      expect(mesh.instanceMatrix.count).toBe(b.maxPerKrathong * ZONE_ITEM_CAP);
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.instanceMatrix.usage).toBe(DynamicDrawUsage);
      expect(mesh.userData[KRATHONG_BATCH_BUCKET_USERDATA_KEY]).toBe(i);
      expect(mesh.name).toBe("river-batch-" + i);
    });
    assets.dispose();
  });

  it("shadows mirror KrathongModel", () => {
    const assets = createKrathongAssets();
    const meshes = createKrathongBatchMeshes(assets);
    applyKrathongBatchShadows(meshes, true);
    meshes.forEach((m, i) => {
      expect(m.castShadow).toBe(true);
      expect(m.receiveShadow).toBe(KRATHONG_INSTANCE_BUCKETS[i].role === "base");
    });
    applyKrathongBatchShadows(meshes, false);
    for (const m of meshes) {
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
    }
    assets.dispose();
  });

  it("MFW-69: createKrathongBatchMeshes(…, \"low\") uses the low geometries", () => {
    const assets = createKrathongAssets();
    const meshes = createKrathongBatchMeshes(assets, ZONE_ITEM_CAP, "low");
    meshes.forEach((mesh, i) => expect(mesh.geometry).toBe(assets.batchGeometry(KRATHONG_INSTANCE_BUCKETS[i].geometryKey, "low")));
    assets.dispose();
  });

  it("MFW-69: applyKrathongBatchLod re-points geometry without creating or disposing", () => {
    const assets = createKrathongAssets();
    const meshes = createKrathongBatchMeshes(assets);
    const items = [...meshes];
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    for (const lod of ["medium", "low", "full"] as const) {
      applyKrathongBatchLod(meshes, assets, lod);
      meshes.forEach((mesh, i) => {
        expect(mesh, `${lod} ${i}`).toBe(items[i]);
        expect(mesh.geometry, `${lod} ${i}`).toBe(assets.batchGeometry(KRATHONG_INSTANCE_BUCKETS[i].geometryKey, lod));
      });
    }
    expect(dispose).toHaveBeenCalledTimes(0);
    dispose.mockRestore();
    assets.dispose();
  });

  describe("MFW-65 owner-supplied designs", () => {
    const DESIGN_BUCKET = krathongInstanceBucketIndex("design:banana_leaf_01", "designBody")!;
    const FLAME_BUCKET = krathongInstanceBucketIndex("flame", "flame")!;
    const flame = (i: number): KrathongFlameAnchor => ({ x: 0.01 * i, y: 1, z: 0, height: 0.4, radius: 0.1 });
    const source = (flames: readonly KrathongFlameAnchor[] | null) => ({ flames: () => flames });
    const zone = (n: number) => Array.from({ length: n }, (_, k) => perfSoakAppearance(k));
    const elements = (plan: ReturnType<typeof planKrathongInstances>) =>
      plan.items.map((item) => item.parts.map((p) => [p.bucketIndex, p.slot, p.upright, p.flicker, ...p.local.elements]));

    it("RB1 / RB3: no source, or a design not loaded, plans the procedural parts as before", () => {
      const appearances = zone(12);
      const today = planKrathongInstances(appearances);
      for (const plan of [planKrathongInstances(appearances, ZONE_ITEM_CAP, null), planKrathongInstances(appearances, ZONE_ITEM_CAP, source(null))]) {
        expect(plan.bucketCounts).toEqual(today.bucketCounts);
        expect(elements(plan)).toEqual(elements(today));
        expect(plan.bucketCounts[DESIGN_BUCKET]).toBe(0);
      }
    });

    it("RB2: a loaded design with one flame: one body and one flickering, tilting flame per item", () => {
      const plan = planKrathongInstances(zone(5), ZONE_ITEM_CAP, source([flame(0)]));
      for (const item of plan.items) {
        expect(item.anchorLocal.toArray()).toEqual([0, 0, 0]);
        expect(item.parts).toHaveLength(2);
        const [body, f] = item.parts;
        expect(body.bucketIndex).toBe(DESIGN_BUCKET);
        expect(body.upright).toBe(false);
        expect(body.flicker).toBe(false);
        expect(body.local.equals(new Matrix4())).toBe(true);
        expect(f.bucketIndex).toBe(FLAME_BUCKET);
        expect(f.flicker).toBe(true);
        expect(f.upright).toBe(false);
      }
      plan.bucketCounts.forEach((c, b) => expect(c, String(b)).toBe(b === DESIGN_BUCKET || b === FLAME_BUCKET ? 5 : 0));
    });

    it("RB4: a full zone of designs with the most flames fits the flame bucket", () => {
      const flames = Array.from({ length: KRATHONG_DESIGN_MAX_FLAMES }, (_, i) => flame(i));
      const plan = planKrathongInstances(zone(ZONE_ITEM_CAP), ZONE_ITEM_CAP, source(flames));
      expect(plan.bucketCounts[FLAME_BUCKET]).toBe(ZONE_ITEM_CAP * KRATHONG_DESIGN_MAX_FLAMES);
      expect(plan.bucketCounts[DESIGN_BUCKET]).toBe(ZONE_ITEM_CAP);
      for (const item of plan.items) expect(item.parts).toHaveLength(1 + KRATHONG_DESIGN_MAX_FLAMES);
    });

    it("RB5: applyKrathongBatchLod re-points the design bucket from the placeholder once the design has loaded", async () => {
      const bytes = writeGlb({
        positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array(9),
        colors: new Uint8Array(12).fill(255),
        indices: [0, 1, 2],
        flames: [[0, 1, 0, 0.4, 0.1]],
      });
      const data = parseKrathongDesignGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const assets = createKrathongAssets({ loadDesign: () => Promise.resolve(data) });
      const meshes = createKrathongBatchMeshes(assets, ZONE_ITEM_CAP, "medium");
      const placeholder = meshes[DESIGN_BUCKET].geometry;
      expect(placeholder).toBe(assets.batchGeometry("design:banana_leaf_01", "medium"));
      expect(meshes[DESIGN_BUCKET].material).toBe(assets.designMaterial);
      assets.requestDesign("banana_leaf_01", "medium");
      await new Promise((r) => setTimeout(r, 0));
      const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
      applyKrathongBatchLod(meshes, assets, "medium");
      expect(meshes[DESIGN_BUCKET].geometry).toBe(assets.design("banana_leaf_01", "medium")!.geometry);
      expect(meshes[DESIGN_BUCKET].geometry).not.toBe(placeholder);
      expect(dispose).not.toHaveBeenCalled();
      dispose.mockRestore();
      assets.dispose();
    });

    it("MFW-78 RB1: each item goes to its design bucket", () => {
      const { design, ...legacy } = DEFAULT_KRATHONG_APPEARANCE;
      void design;
      const appearances: KrathongAppearance[] = [legacy, { ...legacy, design: "lotus_bud_01" }, { ...legacy, design: "naga_01" }, legacy];
      const plan = planKrathongInstances(appearances, ZONE_ITEM_CAP, source([]));
      const at = (id: KrathongDesignId) => plan.bucketCounts[krathongInstanceBucketIndex(`design:${id}`, "designBody")!];
      expect(at("banana_leaf_01")).toBe(2);
      expect(at("lotus_bud_01")).toBe(1);
      expect(at("naga_01")).toBe(1);
      expect(at("marigold_01")).toBe(0);
      expect(at("rose_candles_01")).toBe(0);
    });

    it("RB6: the design body casts with the shadows flag and never receives", () => {
      const assets = createKrathongAssets();
      const meshes = createKrathongBatchMeshes(assets);
      for (const shadows of [true, false]) {
        applyKrathongBatchShadows(meshes, shadows);
        expect(meshes[DESIGN_BUCKET].castShadow).toBe(shadows);
        expect(meshes[DESIGN_BUCKET].receiveShadow).toBe(false);
      }
      assets.dispose();
    });
  });
});
