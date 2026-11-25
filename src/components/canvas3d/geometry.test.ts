import { describe, expect, it } from "vitest";
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial } from "three";
import { buildRibbonGeometryData, createRiverChannel } from "@/core/world";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY } from "@/config/look.config";
import { createBlobShadowGeometry } from "./blobShadowMeshes";
import { createInstancedPartGeometry, createInstancedPartMaterial, countTriangles, createMatteMaterial, createPartGeometry, createRibbonGeometry } from "./geometry";

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
