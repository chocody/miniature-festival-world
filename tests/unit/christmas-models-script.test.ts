// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOrnamentDesignGlb } from "@/core/customization/ornamentDesignGlb";
import { boundsCentreTransform, buildOrnamentLod, frameBasis, normaliseToBoundingRadius, orientToFrame } from "../../scripts/christmas-models-lib.mjs";
import type { OrnamentDesignSpec } from "../../scripts/christmas-models.designs.mjs";
import { runModelPackCli } from "../../scripts/model-pack-cli.mjs";
import { colourAndWeld, readGlbMesh, srgbHexToLinearBytes, writeGlb } from "../../scripts/krathong-models-lib.mjs";

const ROOT = process.cwd();
const run = (script: string, ...args: string[]) => spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, encoding: "utf8" });
const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
function jsonOf(bytes: Uint8Array): { asset: { generator: string }; meshes: Record<string, unknown>[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

const TRIANGLE = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  colors: new Uint8Array(12).fill(255),
  indices: [0, 1, 2],
};

/** A closed octahedron (radius 1, centred at the origin); the upper four face centroids are at y = 1/3. */
function octahedronSource(): Uint8Array {
  const positions = Float32Array.from([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]);
  const indices = [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5];
  // The pipeline reads only POSITION and the index of a source; the other attributes are placeholders.
  return writeGlb(
    { positions, normals: new Float32Array(positions.length), colors: new Uint8Array((positions.length / 3) * 4), indices },
    { extras: null },
  );
}

const CAP = "#CAB8A0";
const BODY = "#E0D4C4";
const octaSpec = (hook: boolean): OrnamentDesignSpec => ({
  id: "octa",
  sourceFile: "octa.glb",
  referenceImage: "none.png",
  hook,
  rules: [
    { region: "cap", color: CAP, shape: { kind: "band", yMin: 0.2, yMax: 2, rMin: 0, rMax: 2 } },
    { region: "body", color: BODY, shape: { kind: "any" } },
  ],
});

describe("christmas models script (MFW-101 / MFW-124)", () => {
  it("CS1: boundsCentreTransform / normaliseToBoundingRadius", () => {
    const corners: number[] = [];
    for (const x of [0, 2]) for (const y of [0, 4]) for (const z of [0, 2]) corners.push(x, y, z);
    const t = boundsCentreTransform(corners, 1);
    expect([t.cx, t.cy, t.cz]).toEqual([1, 2, 1]);
    expect(t.s).toBeCloseTo(1 / Math.sqrt(6), 12);
    const out = normaliseToBoundingRadius(corners, 1);
    let maxR = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < out.length; i += 3) {
      maxR = Math.max(maxR, Math.hypot(out[i], out[i + 1], out[i + 2]));
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], out[i + k]);
        max[k] = Math.max(max[k], out[i + k]);
      }
    }
    expect(Math.abs(maxR - 1)).toBeLessThanOrEqual(1e-6);
    for (let k = 0; k < 3; k++) expect(Math.abs((min[k] + max[k]) / 2)).toBeLessThanOrEqual(1e-6);
    expect(() => boundsCentreTransform([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 1)).toThrow(/no extent/);
  });

  it("CS2: writeGlb generator / extras options", () => {
    const flames = [[0, 1, 0, 0.4, 0.1]];
    const withHook = writeGlb({ ...TRIANGLE }, { generator: "g", extras: { ornamentHook: [0, 1, 0] } });
    expect(jsonOf(withHook).asset.generator).toBe("g");
    expect(jsonOf(withHook).meshes[0].extras).toEqual({ ornamentHook: [0, 1, 0] });
    const none = writeGlb({ ...TRIANGLE }, { extras: null });
    expect("extras" in jsonOf(none).meshes[0]).toBe(false);
    const krathong = writeGlb({ ...TRIANGLE, flames });
    expect(jsonOf(krathong).meshes[0].extras).toEqual({ krathongFlames: flames });
    for (const bytes of [withHook, none, krathong]) expect([...readGlbMesh(bytes).positions]).toEqual([...TRIANGLE.positions]);
  });

  it("CS3: colourAndWeld splits a shared corner only on a colour change", () => {
    const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const indices = [0, 1, 2, 2, 1, 3];
    const two = colourAndWeld({ positions, indices, creaseDeg: 60, faceRgb: (f) => (f === 0 ? [255, 0, 0] : [0, 0, 255]) });
    expect(two.positions.length / 3).toBe(6);
    const one = colourAndWeld({ positions, indices, creaseDeg: 60, faceRgb: () => [10, 20, 30] });
    expect(one.positions.length / 3).toBe(4);
    expect([...one.colors.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it("CS4: buildOrnamentLod is deterministic, parses, anchors the hook at max y and colours by rule", () => {
    const source = octahedronSource();
    const a = buildOrnamentLod(source, octaSpec(true), "full");
    const b = buildOrnamentLod(source, octaSpec(true), "full");
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
    const data = parseOrnamentDesignGlb(bufferOf(a));
    let maxY = -Infinity;
    for (let i = 1; i < data.positions.length; i += 3) maxY = Math.max(maxY, data.positions[i]);
    expect(data.hook).not.toBeNull();
    expect(data.hook?.x).toBe(0);
    expect(data.hook?.z).toBe(0);
    expect(Math.abs((data.hook?.y ?? NaN) - maxY)).toBeLessThanOrEqual(1e-4);
    const allowed = new Set([CAP, BODY].map((hex) => srgbHexToLinearBytes(hex).join(",")));
    const seen = new Set<string>();
    for (let i = 0; i < data.colors.length; i += 4) {
      const key = [...data.colors.subarray(i, i + 3)].join(",");
      expect(allowed.has(key)).toBe(true);
      seen.add(key);
    }
    expect(seen.size).toBe(2);
    expect(parseOrnamentDesignGlb(bufferOf(buildOrnamentLod(source, octaSpec(false), "low"))).hook).toBeNull();
    expect(() => buildOrnamentLod(source, octaSpec(true), "x" as "full")).toThrow(/unknown lod/);
  });

  it("CS5: christmas-models.mjs --check is up to date; bad arguments exit 2", () => {
    const check = run("scripts/christmas-models.mjs", "--check");
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("christmas models: up to date");
    expect(run("scripts/christmas-models.mjs", "--design", "nope").status).toBe(2);
    expect(run("scripts/christmas-models.mjs", "--bogus").status).toBe(2);
  });

  it("CS6: krathong-models.mjs --check is still up to date (byte identity after the refactor)", () => {
    const check = run("scripts/krathong-models.mjs", "--check");
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("krathong models: up to date");
  });

  it("CS7: orientToFrame / frameBasis", () => {
    const pts = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 1, 0]);
    expect([...orientToFrame(pts, { up: [0, 1, 0], out: [0, 0, 1] })]).toEqual([...pts]);
    const turned = orientToFrame(pts, { up: [0, 1, 0], out: [1, 0, 0] });
    [0, 0, 1, -1, 0, 0, 0, 1, 0].forEach((v, i) => expect(turned[i]).toBeCloseTo(v, 6));
    const basis = frameBasis({ up: [0, 1, 1], out: [0, 0, 1] });
    [0, 1, 0].forEach((v, i) => expect(basis.y[i]).toBeCloseTo(v, 9));
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (const v of [basis.x, basis.y, basis.z]) expect(dot(v, v)).toBeCloseTo(1, 9);
    expect(dot(basis.x, basis.y)).toBeCloseTo(0, 9);
    expect(dot(basis.y, basis.z)).toBeCloseTo(0, 9);
    expect(dot(basis.x, basis.z)).toBeCloseTo(0, 9);
    cross(basis.x, basis.y).forEach((v, i) => expect(v).toBeCloseTo(basis.z[i], 9));
    expect(() => frameBasis({ up: [0, 0, 2], out: [0, 0, 1] })).toThrow(/parallel/);
    expect(() => frameBasis({ up: [0, 1, 0], out: [0, 0, 0] })).toThrow(/no length/);
  });

  it("CS8: buildOrnamentLod applies the frame before the rules", () => {
    const source = octahedronSource();
    const framed = { ...octaSpec(true), frame: { up: [1, 0, 0], out: [0, 0, 1] } as OrnamentDesignSpec["frame"] };
    const a = buildOrnamentLod(source, framed, "full");
    expect(Buffer.compare(Buffer.from(a), Buffer.from(buildOrnamentLod(source, framed, "full")))).toBe(0);
    const data = parseOrnamentDesignGlb(bufferOf(a));
    let maxY = -Infinity;
    for (let i = 1; i < data.positions.length; i += 3) maxY = Math.max(maxY, data.positions[i]);
    expect(Math.abs((data.hook?.y ?? NaN) - maxY)).toBeLessThanOrEqual(1e-4);
    const seen = new Set<string>();
    for (let i = 0; i < data.colors.length; i += 4) seen.add([...data.colors.subarray(i, i + 3)].join(","));
    expect([...seen].sort()).toEqual([CAP, BODY].map((hex) => srgbHexToLinearBytes(hex).join(",")).sort());
    expect(Buffer.compare(Buffer.from(a), Buffer.from(buildOrnamentLod(source, octaSpec(true), "full")))).not.toBe(0);
  });

  it("CS9: runModelPackCli builds only the LODs a design lists", () => {
    const dir = mkdtempSync(join(tmpdir(), "mfw-pack-"));
    try {
      const sourceDir = join(dir, "src");
      const publicDir = join(dir, "out");
      mkdirSync(sourceDir);
      for (const name of ["a.full", "a.medium", "a.low", "b.medium", "b.low"]) writeFileSync(join(sourceDir, `${name}.glb`), name);
      const pack = {
        name: "t",
        script: "t.mjs",
        designs: [{ id: "a" }, { id: "b", lods: ["medium", "low"] }],
        lods: ["full", "medium", "low"],
        sourceDir,
        publicDir,
        build: (bytes: Uint8Array) => bytes,
      };
      expect(runModelPackCli({ ...pack, argv: [] })).toBe(0);
      expect(readdirSync(publicDir).sort()).toEqual(["a.full.glb", "a.low.glb", "a.medium.glb", "b.low.glb", "b.medium.glb"]);
      expect(runModelPackCli({ ...pack, argv: ["--check"] })).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
