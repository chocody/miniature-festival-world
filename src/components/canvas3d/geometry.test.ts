import { describe, expect, it } from "vitest";
import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial } from "three";
import { buildRibbonGeometryData, createRiverChannel } from "@/core/world";
import { countTriangles, createMatteMaterial, createPartGeometry, createRibbonGeometry } from "./geometry";

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
