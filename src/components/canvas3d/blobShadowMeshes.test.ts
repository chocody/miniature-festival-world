// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY } from "@/config/look.config";
import {
  commitBlobShadows,
  createBlobShadowGeometry,
  createBlobShadowInstances,
  createBlobShadowMaterial,
  NO_RAYCAST,
  writeBlobShadowAt,
  writeStaticBlobShadows,
} from "./blobShadowMeshes";

const spec = { ...BLOB_SHADOW_TIER_GEOMETRY.HIGH, falloffExponent: BLOB_SHADOW_LOOK.falloffExponent };
const ALLOCATION = /\bnew\b|\.map\(|\.\.\./;

function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}

function decompose(m: Matrix4) {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(p, q, s);
  return { p, s, e: new Euler().setFromQuaternion(q) };
}

describe("blob shadow meshes (MFW-47)", () => {
  it("geometry carries vertex alpha", () => {
    const g = createBlobShadowGeometry(spec);
    expect(g.getAttribute("color").itemSize).toBe(4);
    expect(g.getAttribute("position").itemSize).toBe(3);
    const { segments, rings } = BLOB_SHADOW_TIER_GEOMETRY.HIGH;
    expect(g.index!.count).toBe(3 * segments * (2 * rings - 1));
  });

  it("material is translucent, depth-write free, vertex-coloured and tinted from config", () => {
    const m = createBlobShadowMaterial();
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.vertexColors).toBe(true);
    expect(m.opacity).toBe(BLOB_SHADOW_LOOK.opacity);
    expect(m.color.getHex()).toBe(new Color(BLOB_SHADOW_LOOK.color).getHex());
    expect(m.polygonOffset).toBe(true);
  });

  it("instances start empty, never culled, never hit", () => {
    const mesh = createBlobShadowInstances(createBlobShadowGeometry(spec), createBlobShadowMaterial(), 4, "n");
    expect(mesh.count).toBe(0);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.raycast).toBe(NO_RAYCAST);
    expect(mesh.name).toBe("n");
  });

  it("static blobs follow the prop transform and radii", () => {
    const mesh = createBlobShadowInstances(createBlobShadowGeometry(spec), createBlobShadowMaterial(), 2, "n");
    writeStaticBlobShadows(
      mesh,
      [{ transforms: [{ position: { x: 1, y: 2, z: 3 }, yawRad: Math.PI / 2, scale: 2 }], radii: { radiusX: 0.5, radiusZ: 0.25 } }],
      0.01,
    );
    expect(mesh.count).toBe(1);
    // instanceMatrix is a Float32Array: compare within float32 precision (1e-6).
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    const { p, s, e } = decompose(m);
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(2.01, 6);
    expect(p.z).toBeCloseTo(3, 6);
    expect(s.x).toBeCloseTo(1, 6);
    expect(s.y).toBeCloseTo(1, 6);
    expect(s.z).toBeCloseTo(0.5, 6);
    expect(e.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it("dynamic writer and commit set the matrix and count", () => {
    const mesh = createBlobShadowInstances(createBlobShadowGeometry(spec), createBlobShadowMaterial(), 3, "n");
    const scratch = new Matrix4();
    writeBlobShadowAt(mesh, 1, 4, -0.2, 5, 0.3, scratch);
    const version = mesh.instanceMatrix.version;
    commitBlobShadows(mesh, 2);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
    const m = new Matrix4();
    mesh.getMatrixAt(1, m);
    const { p, s } = decompose(m);
    expect([p.x, p.y, p.z]).toEqual([4, expect.closeTo(-0.2, 6), 5]);
    expect([s.x, s.y, s.z].map((v) => Number(v.toFixed(6)))).toEqual([0.3, 1, 0.3]);
    commitBlobShadows(mesh, 0);
    expect(mesh.count).toBe(0);
  });

  it("per-frame functions allocate nothing", () => {
    const source = readFileSync(join(process.cwd(), "src/components/canvas3d/blobShadowMeshes.ts"), "utf8");
    for (const name of ["writeBlobShadowAt", "commitBlobShadows"]) {
      expect(functionSource(source, name), name).not.toMatch(ALLOCATION);
    }
  });
});
