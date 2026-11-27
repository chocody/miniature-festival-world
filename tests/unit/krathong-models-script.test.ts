// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseKrathongDesignGlb } from "@/core/customization/krathongDesignGlb";
import {
  buildDesignLod,
  classifyFaces,
  computeCreaseNormals,
  extractFlames,
  footprintTransform,
  normaliseToFootprint,
  readGlbMesh,
  srgbHexToLinearBytes,
  writeGlb,
} from "../../scripts/krathong-models-lib.mjs";
import { FOOTPRINT } from "../../scripts/krathong-models.designs.mjs";

type Rule = Parameters<typeof classifyFaces>[2][number];
const ANY: Rule = { region: "leaves", color: "#00FF00", shape: { kind: "any" } };

/** Unit cube, 8 shared vertices, 12 outward triangles. */
function cube(): { positions: Float32Array; indices: Uint32Array } {
  const positions = Float32Array.from([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]);
  // prettier-ignore
  const indices = Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { positions, indices };
}

/** Closed solid: a cylinder (radius r, y 0…1, bottom fan) whose top ring is shared with a cone up to `apexY`. */
function candleWithFlame(n = 8, r = 0.5, apexY = 1.5) {
  const p: number[] = [0, 0, 0]; // 0: bottom centre
  for (let i = 0; i < n; i++) p.push(r * Math.cos((2 * Math.PI * i) / n), 0, r * Math.sin((2 * Math.PI * i) / n)); // 1..n
  for (let i = 0; i < n; i++) p.push(r * Math.cos((2 * Math.PI * i) / n), 1, r * Math.sin((2 * Math.PI * i) / n)); // n+1..2n
  p.push(0, apexY, 0); // 2n+1: apex
  const bottom = (i: number) => 1 + (i % n);
  const top = (i: number) => 1 + n + (i % n);
  const apex = 2 * n + 1;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(0, bottom(i), bottom(i + 1)); // faces −y
  for (let i = 0; i < n; i++) idx.push(bottom(i), top(i), top(i + 1), bottom(i), top(i + 1), bottom(i + 1));
  const bodyFaces = idx.length / 3;
  for (let i = 0; i < n; i++) idx.push(top(i), apex, top(i + 1));
  return { positions: Float32Array.from(p), indices: Uint32Array.from(idx), bodyFaces };
}

/** Two candles: `candleWithFlame(8, 0.5, apexA)` and a copy shifted to x + 3 with apex `apexB`; candle A's faces come first. */
function twoCandles(apexA: number, apexB: number) {
  const a = candleWithFlame(8, 0.5, apexA);
  const b = candleWithFlame(8, 0.5, apexB);
  const shifted = Float32Array.from(b.positions, (v, i) => (i % 3 === 0 ? v + 3 : v));
  const offset = a.positions.length / 3;
  return {
    positions: Float32Array.from([...a.positions, ...shifted]),
    indices: Uint32Array.from([...a.indices, ...Array.from(b.indices, (v) => v + offset)]),
    bodyFaces: a.bodyFaces,
    facesPerCandle: a.indices.length / 3,
  };
}

const FLAME_RULE: Rule = { region: "flame", color: "#FFD27A", shape: { kind: "column", cx: 0, cz: 0, radius: 10, yMin: 1.0001, yMax: 10 } };

function edgeUse(indices: ArrayLike<number>): Map<string, number> {
  const use = new Map<string, number>();
  for (let f = 0; f < indices.length; f += 3)
    for (let k = 0; k < 3; k++) {
      const a = indices[f + k];
      const b = indices[f + ((k + 1) % 3)];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  return use;
}

function icosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;
  // prettier-ignore
  const v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  // prettier-ignore
  const f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  return { positions: Float32Array.from(v), indices: Uint32Array.from(f) };
}

function sourceGlb(mesh: { positions: Float32Array; indices: Uint32Array }): Uint8Array {
  const n = mesh.positions.length / 3;
  return writeGlb({ positions: mesh.positions, normals: new Float32Array(n * 3), colors: new Uint8Array(n * 4), indices: mesh.indices, flames: [] });
}

describe("krathong models script (MFW-65)", () => {
  it("KS1: writeGlb → readGlbMesh round-trips; header and chunk padding", () => {
    const { positions, indices } = cube();
    const n = positions.length / 3;
    const bytes = writeGlb({ positions, normals: new Float32Array(n * 3), colors: new Uint8Array(n * 4).fill(255), indices, flames: [[0, 1, 0, 0.5, 0.1]] });
    const read = readGlbMesh(bytes);
    expect([...read.positions]).toEqual([...positions]);
    expect([...read.indices]).toEqual([...indices]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    expect(jsonLength % 4).toBe(0);
    expect(view.getUint32(20 + jsonLength, true) % 4).toBe(0);
    expect(() => readGlbMesh(new Uint8Array(32))).toThrow(/not a glTF 2/);
  });

  it("KS2: normaliseToFootprint", () => {
    const box = Float32Array.from([-2, 1, -1, 2, 1, -1, 2, 3, 1, -2, 3, 1]);
    const out = normaliseToFootprint(box, { radius: 1, bottomY: -0.18 });
    let maxR = 0, minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; // prettier-ignore
    for (let i = 0; i < out.length; i += 3) {
      maxR = Math.max(maxR, Math.hypot(out[i], out[i + 2]));
      minY = Math.min(minY, out[i + 1]);
      minX = Math.min(minX, out[i]);
      maxX = Math.max(maxX, out[i]);
      minZ = Math.min(minZ, out[i + 2]);
      maxZ = Math.max(maxZ, out[i + 2]);
    }
    expect(maxR).toBeCloseTo(1, 6);
    expect(minY).toBeCloseTo(-0.18, 6);
    expect((minX + maxX) / 2).toBeCloseTo(0, 6);
    expect((minZ + maxZ) / 2).toBeCloseTo(0, 6);
  });

  it("KS3: classifyFaces — first match wins, else the trailing any; no trailing any throws", () => {
    const positions = Float32Array.from([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 5, 5, 5, 5.1, 5, 5, 5, 5.1, 5]);
    const indices = Uint32Array.from([0, 1, 2, 3, 4, 5]);
    const column: Rule = { region: "candle", color: "#FFFFFF", shape: { kind: "column", cx: 0, cz: 0, radius: 0.5, yMin: -1, yMax: 1 } };
    const sphere: Rule = { region: "flowers", color: "#FF0000", shape: { kind: "sphere", c: [0, 0, 0], radius: 1 } };
    expect([...classifyFaces(positions, indices, [column, ANY])]).toEqual([0, 1]);
    expect([...classifyFaces(positions, indices, [sphere, column, ANY])]).toEqual([0, 2]);
    expect([...classifyFaces(positions, indices, [column, sphere, ANY])]).toEqual([0, 2]);
    expect(() => classifyFaces(positions, indices, [column])).toThrow(/last rule/);
  });

  it("KS4: extractFlames cuts the cone, anchors it and caps the hole", () => {
    const mesh = candleWithFlame();
    const rules = [FLAME_RULE, ANY];
    const faceRules = classifyFaces(mesh.positions, mesh.indices, rules);
    const cut = extractFlames(mesh.positions, mesh.indices, faceRules, rules);
    expect(cut.flames).toHaveLength(1);
    const [x, y, z, height, radius] = cut.flames[0];
    expect(Math.abs(x)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(z)).toBeLessThanOrEqual(1e-4);
    expect(y).toBeCloseTo(1, 4);
    expect(height).toBeCloseTo(0.5, 4);
    expect(radius).toBeCloseTo(0.5, 4);
    // No flame faces in the body: every face is a kept body face or a cap (source = a body face).
    const faces = cut.indices.length / 3;
    expect(cut.capFaceSource).toHaveLength(faces);
    for (const source of cut.capFaceSource) expect(source).toBeLessThan(mesh.bodyFaces);
    for (const v of cut.indices) expect(cut.positions[v * 3 + 1]).toBeLessThanOrEqual(1 + 1e-6);
    for (const [, count] of edgeUse(cut.indices)) expect(count).toBe(2);
  });

  it("KS5: computeCreaseNormals — a cube keeps hard edges, an icosahedron is smooth", () => {
    const c = cube();
    const n = computeCreaseNormals(c.positions, c.indices, 60);
    for (let f = 0; f < c.indices.length / 3; f++) {
      const p = (k: number) => [0, 1, 2].map((d) => c.positions[c.indices[f * 3 + k] * 3 + d]);
      const [a, b, d] = [p(0), p(1), p(2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const len = Math.hypot(...fn);
      for (let k = 0; k < 3; k++) for (let dim = 0; dim < 3; dim++) expect(n[(f * 3 + k) * 3 + dim]).toBeCloseTo(fn[dim] / len, 6);
    }
    const ico = icosahedron();
    const m = computeCreaseNormals(ico.positions, ico.indices, 75);
    const byVertex = new Map<number, number[]>();
    for (let i = 0; i < ico.indices.length; i++) {
      const v = ico.indices[i];
      const normal = [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
      const seen = byVertex.get(v);
      if (seen) for (let d = 0; d < 3; d++) expect(normal[d]).toBeCloseTo(seen[d], 6);
      else byVertex.set(v, normal);
      const pos = [ico.positions[v * 3], ico.positions[v * 3 + 1], ico.positions[v * 3 + 2]];
      const len = Math.hypot(...pos);
      expect(normal[0] * (pos[0] / len) + normal[1] * (pos[1] / len) + normal[2] * (pos[2] / len)).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("KS6: srgbHexToLinearBytes", () => {
    expect(srgbHexToLinearBytes("#FFFFFF")).toEqual([255, 255, 255]);
    expect(srgbHexToLinearBytes("#000000")).toEqual([0, 0, 0]);
    expect(srgbHexToLinearBytes("#808080")).toEqual([55, 55, 55]);
  });

  it("KS7: buildDesignLod is deterministic and its output parses", () => {
    const source = sourceGlb(candleWithFlame(12));
    const design = { id: "test", sourceFile: "x.glb", referenceImage: "x.png", rules: [FLAME_RULE, ANY] };
    const a = buildDesignLod(source, design, "full");
    const b = buildDesignLod(source, design, "full");
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
    const parsed = parseKrathongDesignGlb(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer);
    expect(parsed.flames).toHaveLength(1);
    let minY = Infinity;
    for (let i = 1; i < parsed.positions.length; i += 3) minY = Math.min(minY, parsed.positions[i]);
    expect(minY).toBeCloseTo(FOOTPRINT.bottomY, 5);
  });

  it("KS8: no flame region → buildDesignLod throws", () => {
    const source = sourceGlb(candleWithFlame());
    expect(() => buildDesignLod(source, { id: "t", sourceFile: "x", referenceImage: "x", rules: [ANY] }, "low")).toThrow(/no flame found/);
  });

  it("KS9: extractFlames with maxFlames keeps the tallest islands; the rest stay in the body in their rule colour", () => {
    const rules = [FLAME_RULE, ANY];
    const cut = (mesh: ReturnType<typeof twoCandles>, maxFlames?: number) =>
      extractFlames(mesh.positions, mesh.indices, classifyFaces(mesh.positions, mesh.indices, rules), rules, maxFlames);
    // (a) no limit: both flames, in island order.
    const two = twoCandles(1.3, 1.5);
    const all = cut(two);
    expect(all.flames).toHaveLength(2);
    expect(all.flames[0][0]).toBeCloseTo(0, 4);
    expect(all.flames[0][3]).toBeCloseTo(0.3, 4);
    expect(all.flames[1][0]).toBeCloseTo(3, 4);
    expect(all.flames[1][3]).toBeCloseTo(0.5, 4);
    // (b) maxFlames 1: the taller flame (B) wins over island order; A's cone stays, with its own rule.
    const one = cut(two, 1);
    expect(one.flames).toHaveLength(1);
    expect(one.flames[0][0]).toBeCloseTo(3, 4);
    expect(one.flames[0][3]).toBeCloseTo(0.5, 4);
    const coneA = Array.from({ length: 8 }, (_, k) => two.bodyFaces + k); // input faces of A's cone
    const faceRules = classifyFaces(two.positions, two.indices, rules);
    for (const f of coneA) {
      const out = Array.from(one.capFaceSource).indexOf(f);
      expect(out, `cone face ${f}`).toBeGreaterThanOrEqual(0);
      expect([0, 1, 2].map((k) => one.indices[out * 3 + k])).toEqual([0, 1, 2].map((k) => two.indices[f * 3 + k]));
      expect(rules[faceRules[one.capFaceSource[out]]].region).toBe("flame");
    }
    for (const [, count] of edgeUse(one.indices)) expect(count).toBe(2);
    // (c) a tie goes to the lower island index.
    const tie = cut(twoCandles(1.5, 1.5), 1);
    expect(tie.flames).toHaveLength(1);
    expect(tie.flames[0][0]).toBeCloseTo(0, 4);
    // (d) maxFlames 0: nothing is cut.
    const none = cut(two, 0);
    expect(none.flames).toEqual([]);
    expect([...none.indices]).toEqual([...two.indices]);
    expect([...none.capFaceSource]).toEqual(Array.from({ length: two.indices.length / 3 }, (_, i) => i));
    // (e) a bad limit throws.
    expect(() => cut(two, 1.5)).toThrow(/bad maxFlames/);
    expect(() => cut(two, -1)).toThrow(/bad maxFlames/);
  });

  it("KS10: buildDesignLod — addedFlames are transformed like the body; maxFlames per LOD", () => {
    const source = sourceGlb(candleWithFlame(12));
    const t = footprintTransform(readGlbMesh(source).positions, FOOTPRINT);
    const added = { x: 0, y: 1, z: 0, height: 0.5, radius: 0.25 };
    const expected = [(0 - t.cx) * t.s, (1 - t.minY) * t.s + FOOTPRINT.bottomY, (0 - t.cz) * t.s, 0.5 * t.s, 0.25 * t.s];
    const parse = (bytes: Uint8Array) => parseKrathongDesignGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const asArray = (f: { x: number; y: number; z: number; height: number; radius: number }) => [f.x, f.y, f.z, f.height, f.radius];
    // (a) no flame rule, one added flame: the anchor is the added one and the cone is still there.
    const a = parse(buildDesignLod(source, { id: "t", sourceFile: "x", referenceImage: "x", rules: [ANY], addedFlames: [added] }, "full"));
    expect(a.flames).toHaveLength(1);
    expected.forEach((v, i) => expect(asArray(a.flames[0])[i]).toBeCloseTo(v, 4));
    let maxY = -Infinity;
    for (let i = 1; i < a.positions.length; i += 3) maxY = Math.max(maxY, a.positions[i]);
    expect(maxY).toBeGreaterThan(expected[1]); // the cone is not cut
    // (b) maxFlames { low: 0 }: low keeps the flame in its rule colour and has only the added anchor; full cuts first, then adds.
    const design = { id: "t", sourceFile: "x", referenceImage: "x", rules: [FLAME_RULE, ANY], maxFlames: { low: 0 }, addedFlames: [added] };
    const low = parse(buildDesignLod(source, design, "low"));
    expect(low.flames).toHaveLength(1);
    expected.forEach((v, i) => expect(asArray(low.flames[0])[i]).toBeCloseTo(v, 4));
    const flameRgb = srgbHexToLinearBytes(FLAME_RULE.color);
    let hasFlameColour = false;
    for (let i = 0; i < low.colors.length; i += 4)
      if (low.colors[i] === flameRgb[0] && low.colors[i + 1] === flameRgb[1] && low.colors[i + 2] === flameRgb[2]) hasFlameColour = true;
    expect(hasFlameColour).toBe(true);
    const full = parse(buildDesignLod(source, design, "full"));
    expect(full.flames).toHaveLength(2);
    expected.forEach((v, i) => expect(asArray(full.flames[1])[i]).toBeCloseTo(v, 4)); // cut first, then added
    expect(asArray(full.flames[0])).not.toEqual(asArray(full.flames[1]));
  });

  it("KS11: footprintTransform is exactly the transform normaliseToFootprint applies", () => {
    const box = Float32Array.from([-2, 1, -1, 2, 1, -1, 2, 3, 1, -2, 3, 1]);
    const footprint = { radius: 1, bottomY: -0.18 };
    const t = footprintTransform(box, footprint);
    const out = normaliseToFootprint(box, footprint);
    const mine = new Float32Array(box.length);
    for (let i = 0; i < box.length; i += 3) {
      mine[i] = (box[i] - t.cx) * t.s;
      mine[i + 1] = (box[i + 1] - t.minY) * t.s + footprint.bottomY;
      mine[i + 2] = (box[i + 2] - t.cz) * t.s;
    }
    for (let i = 0; i < box.length; i++) expect(mine[i]).toBe(out[i]);
    expect(() => footprintTransform(Float32Array.from([0, 0, 0, 0, 1, 0]), footprint)).toThrow(/no horizontal extent/);
  });
});
