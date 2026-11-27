// @vitest-environment node
// MFW-66: the offline house model pipeline (scripts/house-model-lib.mjs) on synthetic GLBs built here (no owner file).
import { describe, expect, it } from "vitest";
import { buildHouseModel, readGlbPrimitives, renderHouseModelModule } from "../../scripts/house-model-lib.mjs";
import { HOUSE_MODEL_SPEC } from "../../scripts/house-model.data.mjs";

interface SynthPrimitive {
  readonly material: number;
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly mode?: number;
}
interface SynthNode {
  readonly name: string;
  readonly primitives: readonly SynthPrimitive[];
  readonly extra?: Record<string, unknown>; // e.g. { translation: [...] }
}

/** Minimal GLB v2: one mesh per node, FLOAT VEC3 positions and UNSIGNED_INT indices in one BIN chunk. */
function makeGlb(nodes: readonly SynthNode[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const push = (bytes: Uint8Array, accessor: object) => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    accessors.push({ bufferView: bufferViews.length - 1, ...accessor });
    chunks.push(bytes);
    offset += bytes.byteLength;
    return accessors.length - 1;
  };
  const meshes = nodes.map((node) => ({
    primitives: node.primitives.map((p) => {
      const position = push(new Uint8Array(Float32Array.from(p.positions).buffer), {
        componentType: 5126,
        count: p.positions.length / 3,
        type: "VEC3",
      });
      const indices = push(new Uint8Array(Uint32Array.from(p.indices).buffer), {
        componentType: 5125,
        count: p.indices.length,
        type: "SCALAR",
      });
      return { attributes: { POSITION: position }, indices, material: p.material, ...(p.mode === undefined ? {} : { mode: p.mode }) };
    }),
  }));
  const json = {
    asset: { version: "2.0", generator: "test" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes.map((n, i) => ({ name: n.name, mesh: i, ...(n.extra ?? {}) })),
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const pad = (n: number) => (4 - (n % 4)) % 4;
  let jsonText = JSON.stringify(json);
  jsonText += " ".repeat(pad(jsonText.length));
  const jsonBytes = new TextEncoder().encode(jsonText);
  const binLength = offset + pad(offset);
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.byteLength;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  let at = binHeader + 8;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const THETA = HOUSE_MODEL_SPEC.sourceYawRad;
/** Source point whose rotated-frame position is (x, y, z): the inverse of the script's yaw turn. */
const fromRotated = (x: number, y: number, z: number): number[] => [
  x * Math.cos(THETA) + z * Math.sin(THETA),
  y,
  -x * Math.sin(THETA) + z * Math.cos(THETA),
];
const triangles = (pts: readonly (readonly number[])[]): SynthPrimitive["positions"] => pts.flatMap((p) => fromRotated(p[0], p[1], p[2]));
const sequential = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Rotated-frame walls box x 0…100, y 0…50, z 0…60, 12 outward triangles (the floor faces −y). */
function wallsBox(): SynthPrimitive {
  const [X, Y, Z] = [100, 50, 60];
  const c = [
    [0, 0, 0], [X, 0, 0], [X, Y, 0], [0, Y, 0], // z = 0 (front, rotated min z)
    [0, 0, Z], [X, 0, Z], [X, Y, Z], [0, Y, Z], // z = Z (back)
  ];
  // prettier-ignore
  const faces = [
    0, 2, 1, 0, 3, 2, // −z
    4, 5, 6, 4, 6, 7, // +z
    0, 1, 5, 0, 5, 4, // −y (floor)
    3, 7, 6, 3, 6, 2, // +y
    0, 4, 7, 0, 7, 3, // −x
    1, 2, 6, 1, 6, 5, // +x
  ];
  return { material: 0, positions: triangles(faces.map((i) => c[i])), indices: sequential(faces.length) };
}

/** Quad in the plane z = zAt, x 40…60, y 10…20, facing +z (toward = 1) or −z (toward = −1). */
function quadZ(zAt: number, toward: 1 | -1): SynthPrimitive {
  const a = [40, 10, zAt], b = [60, 10, zAt], c = [60, 20, zAt], d = [40, 20, zAt];
  const pts = toward === 1 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  return { material: 2, positions: triangles(pts), indices: sequential(6) };
}

const SYNTH_HOUSE: SynthNode[] = [
  { name: "Box001", primitives: [wallsBox()] },
  { name: "Cylinder001", primitives: [{ material: 3, positions: triangles([[50, 10, -1], [52, 10, -1], [51, 12, -1]]), indices: [0, 1, 2] }] },
  { name: "Roof", primitives: [{ material: 1, positions: triangles([[0, 50, 0], [50, 70, 30], [100, 50, 0]]), indices: [0, 1, 2] }] },
  { name: "TrimInside", primitives: [quadZ(0.5, 1)] }, // inside the front wall, facing +z′ (into the house)
  { name: "TrimOutside", primitives: [quadZ(-0.5, -1)] }, // on the front wall, facing out
];

const build = () => buildHouseModel(readGlbPrimitives(makeGlb(SYNTH_HOUSE)));

function faceCentroidAndNormal(part: { positions: readonly number[]; indices: readonly number[] }, f: number) {
  const v = [0, 1, 2].map((k) => {
    const i = part.indices[f * 3 + k] * 3;
    return [part.positions[i], part.positions[i + 1], part.positions[i + 2]];
  });
  const u = [0, 1, 2].map((a) => v[1][a] - v[0][a]);
  const w = [0, 1, 2].map((a) => v[2][a] - v[0][a]);
  const normal = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const centroid = [0, 1, 2].map((a) => (v[0][a] + v[1][a] + v[2][a]) / 3);
  return { centroid, normal };
}

describe("house model script (MFW-66)", () => {
  it("HS1: readGlbPrimitives returns names, materials, positions and indices in node order; rejects transforms and mode 1", () => {
    const nodes: SynthNode[] = [
      { name: "A", primitives: [{ material: 0, positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }] },
      { name: "B", primitives: [{ material: 1, positions: [0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1], indices: [0, 1, 2, 1, 3, 2] }] },
    ];
    const prims = readGlbPrimitives(makeGlb(nodes));
    expect(prims.map((p) => [p.node, p.material])).toEqual([["A", 0], ["B", 1]]);
    expect(Array.from(prims[0].positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(prims[1].indices)).toEqual([0, 1, 2, 1, 3, 2]);
    expect(prims[1].positions).toBeInstanceOf(Float32Array);
    expect(prims[1].indices).toBeInstanceOf(Uint32Array);
    expect(() => readGlbPrimitives(makeGlb([{ ...nodes[0], extra: { translation: [1, 0, 0] } }]))).toThrow(/house GLB/);
    expect(() => readGlbPrimitives(makeGlb([{ name: "L", primitives: [{ ...nodes[0].primitives[0], mode: 1 }] }]))).toThrow(/house GLB/);
    const bad = makeGlb(nodes);
    bad[0] = 0;
    expect(() => readGlbPrimitives(bad)).toThrow(/house GLB/);
  });

  it("HS2: culls the floor, the knob and the inward trim; the roof goes to the roof part; scale = bodyWidth / walls x extent", () => {
    const b = build();
    expect(b.stats["walls:down"]).toBe(2); // the floor (n.y = −1)
    expect(b.stats.knob).toBe(1);
    expect(b.stats["trim:inward"]).toBe(2);
    expect(b.stats["trim:down"]).toBeUndefined();
    // Shell = 12 walls − 2 floor + 2 outward trim; roof = 1.
    expect(b.shell.indices.length / 3).toBe(12);
    expect(b.roof.indices.length / 3).toBe(1);
    expect(b.roof.faceColors).toBeNull();
    expect(b.scale).toBeCloseTo(HOUSE_MODEL_SPEC.bodyWidth / 100, 4);
    // The roof triangle is the only face above the walls; nothing of it is in the shell.
    const shellTop = b.shell.centerY + b.shell.halfExtents[1];
    expect(shellTop).toBeCloseTo(50 * (0.8 / 100), 3);
    expect(b.roof.centerY + b.roof.halfExtents[1]).toBeCloseTo(70 * (0.8 / 100), 3);
    // Walls are centred and 0.8 wide.
    expect(b.shell.halfExtents[0]).toBeCloseTo(0.4, 4);
  });

  it("HS3: the rotated-frame min-z wall ends at local +Z with outward (+Z) normals from the output winding", () => {
    const b = build();
    let front = 0;
    for (let f = 0; f < b.shell.indices.length / 3; f++) {
      const { centroid, normal } = faceCentroidAndNormal(b.shell, f);
      if (centroid[2] > 0.2) {
        front += 1;
        expect(normal[2], `face ${f}`).toBeGreaterThan(0);
      }
    }
    expect(front).toBe(4); // the front wall (2) + the outward trim quad (2)
  });

  it("HS4: palette = distinct hexes in region order; every face colour is a palette index", () => {
    const b = build();
    const p = HOUSE_MODEL_SPEC.palette;
    const expected = [...new Set([p.walls.hex, p.chimney.hex, p.chimneyCap.hex, p.step.hex, p.door.hex, p.trim.hex])];
    expect(b.shell.palette).toEqual(expected);
    expect(b.shell.faceColors).toHaveLength(b.shell.indices.length / 3);
    for (const c of b.shell.faceColors ?? []) expect(c).toBeLessThan(b.shell.palette.length);
    expect(b.shell.faceColors?.filter((c) => c === b.shell.palette.indexOf(p.trim.hex))).toHaveLength(2);
  });

  it("HS5: the module is deterministic, has at most 4 decimals and records the sha256", () => {
    const source = { file: "house.glb", sha256: "ab".repeat(32) };
    const a = renderHouseModelModule(build(), source);
    const b = renderHouseModelModule(build(), source);
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d\.\d{5,}/);
    expect(a).toContain(source.sha256);
    expect(a).toContain('import type { HouseModelData } from "@/config/scene.config";');
    expect(a).toContain("export const LOY_KRATHONG_HOUSE_MODEL: HouseModelData");
  });

  it("HS6: MFW-77: liteShell = the shell without the liteDroppedRegions faces", () => {
    const b = build();
    expect(HOUSE_MODEL_SPEC.liteDroppedRegions).toEqual(["trim"]);
    // The shell's 12 faces minus the 2 outward trim faces.
    expect(b.liteShell.indices.length / 3).toBe(10);
    expect(b.liteShell.palette).toEqual(b.shell.palette);
    const trim = b.shell.palette.indexOf(HOUSE_MODEL_SPEC.palette.trim.hex);
    expect(trim).toBeGreaterThanOrEqual(0);
    expect(b.liteShell.faceColors).toHaveLength(10);
    expect(b.liteShell.faceColors?.filter((c) => c === trim)).toEqual([]);
    expect(b.liteShell.centerY).toBe(b.shell.centerY);
    const text = renderHouseModelModule(b, { file: "house.glb", sha256: "ab".repeat(32) });
    const shellAt = text.indexOf("  shell: {");
    const liteAt = text.indexOf("  liteShell: {");
    const roofAt = text.indexOf("  roof: {");
    expect(shellAt).toBeGreaterThanOrEqual(0);
    expect(liteAt).toBeGreaterThan(shellAt);
    expect(roofAt).toBeGreaterThan(liteAt);
  });
});
