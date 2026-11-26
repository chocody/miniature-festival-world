import { describe, expect, it } from "vitest";
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial } from "three";
import { buildRibbonGeometryData, createRiverChannel } from "@/core/world";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY } from "@/config/look.config";
import { createBlobShadowGeometry } from "./blobShadowMeshes";
import { createBankGeometry, createInstancedPartGeometry, createInstancedPartMaterial, countTriangles, createMatteMaterial, createPartGeometry, createRibbonGeometry } from "./geometry";
import { Box3, Triangle, Vector3 } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";

describe("createPartGeometry", () => {
  it("builds each primitive with its triangle count", () => {
    const box = createPartGeometry({ kind: "box", width: 1, height: 1, depth: 1 });
    const cone = createPartGeometry({ kind: "cone", radius: 1, height: 1, radialSegments: 4 });
    const cyl = createPartGeometry({ kind: "cylinder", radiusTop: 1, radiusBottom: 1, height: 1, radialSegments: 5 });
    const ico = createPartGeometry({ kind: "icosahedron", radius: 1 });
    expect(box).toBeInstanceOf(BoxGeometry);
    expect(cone).toBeInstanceOf(ConeGeometry);
    expect(cyl).toBeInstanceOf(CylinderGeometry);
    expect(ico).toBeInstanceOf(IcosahedronGeometry);
    expect([box, cone, cyl, ico].map(countTriangles)).toEqual([12, 8, 20, 20]);
  });
});

describe("rounded clay parts (MFW-47)", () => {
  it("roundedBox is a bevelled RoundedBoxGeometry of 300 triangles", () => {
    const g = createPartGeometry({ kind: "roundedBox", width: 0.8, height: 0.5, depth: 0.6, radius: 0.06, segments: 2 });
    expect(g).toBeInstanceOf(RoundedBoxGeometry);
    expect(countTriangles(g)).toBe(300);
  });
  it("icosahedron detail 1 has 80 triangles; no detail stays 20", () => {
    expect(countTriangles(createPartGeometry({ kind: "icosahedron", radius: 1, detail: 1 }))).toBe(80);
    expect(countTriangles(createPartGeometry({ kind: "icosahedron", radius: 1 }))).toBe(20);
  });
  it("the HIGH blob fan has segments × (2·rings − 1) triangles", () => {
    const g = createBlobShadowGeometry({ ...BLOB_SHADOW_TIER_GEOMETRY.HIGH, falloffExponent: BLOB_SHADOW_LOOK.falloffExponent });
    const { segments, rings } = BLOB_SHADOW_TIER_GEOMETRY.HIGH;
    expect(g.index!.count).toBe(3 * segments * (2 * rings - 1));
  });
});

describe("instanced part assets share one program (MFW-47)", () => {
  it("a flat spec bakes per-face normals and uses a smooth material", () => {
    const spec = { kind: "cone", radius: 0.6, height: 0.35, radialSegments: 4 } as const;
    const g = createInstancedPartGeometry(spec, true);
    expect(g.index).toBeNull();
    expect(countTriangles(g)).toBe(countTriangles(createPartGeometry(spec)));
    const n = g.getAttribute("normal");
    for (let t = 0; t < n.count; t += 3) {
      const a = [n.getX(t), n.getY(t), n.getZ(t)];
      for (const v of [t + 1, t + 2]) expect([n.getX(v), n.getY(v), n.getZ(v)]).toEqual(a);
    }
    const m = createInstancedPartMaterial({ color: "#445566", roughness: 1, metalness: 0, flatShading: true });
    expect(m.flatShading).toBe(false);
  });
  it("smooth specs and faceted boxes are left as they are", () => {
    const cyl = { kind: "cylinder", radiusTop: 1, radiusBottom: 1, height: 1, radialSegments: 8 } as const;
    expect(createInstancedPartGeometry(cyl, false).index).not.toBeNull();
    expect(createInstancedPartGeometry({ kind: "box", width: 1, height: 1, depth: 1 }, true)).toBeInstanceOf(BoxGeometry);
  });
});

describe("createMatteMaterial", () => {
  it("is matte and flat shaded", () => {
    const m = createMatteMaterial({ color: "#445566", roughness: 1, metalness: 0, flatShading: true });
    expect(m).toBeInstanceOf(MeshStandardMaterial);
    expect([m.roughness, m.metalness, m.flatShading]).toEqual([1, 0, true]);
  });
  it("applies emissive", () => {
    const m = createMatteMaterial({
      color: "#445566", roughness: 1, metalness: 0, flatShading: true, emissive: "#5c4c27", emissiveIntensity: 0.2,
    });
    expect(m.emissive.getHexString()).toBe("5c4c27");
    expect(m.emissiveIntensity).toBe(0.2);
  });
});

describe("createRibbonGeometry", () => {
  it("has upward normals and the data indices", () => {
    const channel = createRiverChannel({
      controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }],
      width: 4,
    });
    const g = createRibbonGeometry(buildRibbonGeometryData(channel, -1, 1, 4));
    expect(g.getAttribute("position").count).toBe(10);
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect([n.getX(i), n.getY(i), n.getZ(i)]).toEqual([0, 1, 0]);
    expect(g.index!.count).toBe(24);
  });
});

describe("riverside v2 parts (MFW-49)", () => {
  it("gable roof: 8 triangles, unit face normals, bounding box width × height × depth", () => {
    const g = createPartGeometry({ kind: "gable", width: 0.9, depth: 0.7, height: 0.3 });
    expect(g.index).toBeNull();
    expect(countTriangles(g)).toBe(8);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < pos.count; i += 3) {
      const tri = new Triangle(
        new Vector3().fromBufferAttribute(pos, i),
        new Vector3().fromBufferAttribute(pos, i + 1),
        new Vector3().fromBufferAttribute(pos, i + 2),
      );
      const face = tri.getNormal(new Vector3());
      for (let k = 0; k < 3; k++) {
        const n = new Vector3().fromBufferAttribute(nrm, i + k);
        expect(n.length()).toBeCloseTo(1, 6);
        expect(n.dot(face)).toBeCloseTo(1, 6); // per-face normal, outward winding
      }
    }
    const size = new Box3().setFromBufferAttribute(pos as never).getSize(new Vector3());
    expect([size.x, size.y, size.z]).toEqual([0.9, 0.3, 0.7].map((n) => expect.closeTo(n, 6)));
    // Faceted already: the instanced copy is the same geometry.
    expect(createInstancedPartGeometry({ kind: "gable", width: 0.9, depth: 0.7, height: 0.3 }, true).index).toBeNull();
  });

  it("icosahedron scaleY squashes the height", () => {
    const full = createPartGeometry({ kind: "icosahedron", radius: 1, detail: 0 });
    const half = createPartGeometry({ kind: "icosahedron", radius: 1, detail: 0, scaleY: 0.5 });
    const h = (g: typeof full) => new Box3().setFromBufferAttribute(g.getAttribute("position") as never).getSize(new Vector3());
    expect(h(half).y).toBeCloseTo(h(full).y / 2, 6);
    expect(h(half).x).toBeCloseTo(h(full).x, 6);
  });

  it("createBankGeometry has upward normals everywhere", () => {
    for (const bank of [LOY_KRATHONG_RIVER_LAYOUT.banks.left, LOY_KRATHONG_RIVER_LAYOUT.banks.right]) {
      const g = createBankGeometry(bank);
      const n = g.getAttribute("normal");
      expect(n.count).toBe(bank.vertexCount);
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0);
      expect(countTriangles(g)).toBe(bank.indices.length / 3);
      expect(g.boundingSphere).not.toBeNull();
    }
  });

  it("MFW-58: the ground strips are a ribbon geometry with up normals, no fold and the strip triangle count", () => {
    const ground = LOY_KRATHONG_RIVER_LAYOUT.ground;
    const g = createRibbonGeometry(ground.strips);
    const pos = g.getAttribute("position");
    const idx = g.index!;
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBe(1);
    const v = (i: number) => new Vector3().fromBufferAttribute(pos, idx.getX(i));
    const water = createRibbonGeometry(LOY_KRATHONG_RIVER_LAYOUT.water);
    const wp = water.getAttribute("position");
    const wi = water.index!;
    const w = (i: number) => new Vector3().fromBufferAttribute(wp, wi.getX(i));
    const crossXZ = (a: Vector3, b: Vector3, c: Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const sign = Math.sign(crossXZ(w(0), w(1), w(2)));
    for (let t = 0; t < idx.count; t += 3) {
      const cross = crossXZ(v(t), v(t + 1), v(t + 2));
      expect(Math.sign(cross)).toBe(sign); // same winding as the water: faces up, no fold
      expect(Math.abs(cross)).toBeGreaterThan(0);
    }
    const segments = LOY_KRATHONG_RIVER_LAYOUT.ribbonSegments;
    expect(countTriangles(g)).toBe(2 * 2 * segments + 2 * 2);
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBe(0); // the mesh position sets the height
    g.dispose();
    water.dispose();
  });
});
