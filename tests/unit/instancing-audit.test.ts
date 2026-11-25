// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const RIVER_FILES = [
  "src/components/canvas3d/RiverFlow.tsx",
  "src/components/models/loyKrathong/RiverKrathongBatch.tsx",
  "src/components/models/loyKrathong/riverKrathongBatch.ts",
  "src/components/canvas3d/perfProbe.ts",
  "src/components/canvas3d/perfSoak.ts",
  "src/components/canvas3d/PerfProbePanel.tsx",
];
const NEW_RESOURCE = /new\s+\w*(Geometry|Material|Texture)\b/;
const TEXTURE_API = /TextureLoader|useTexture|CanvasTexture|DataTexture/;
const ALLOCATION = /\bnew\b|\.map\(|\.filter\(|\.slice\(|Array\.from|\.\.\./;
/** three pushes a fresh range object on every call of these; the commit reuses one persistent range per mesh. */
const RANGE_ALLOCATION = /addUpdateRange|\{\s*start\b/;
const CONSOLE = /\bconsole\./;
const PROBE_IMPORT = /from\s+["'][^"']*(perfProbe|perfSoak|PerfProbePanel)["']/;

function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** From `export function <name>(` to the first following line that is exactly `}`. */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end + 2);
}

/** From `useFrame(() => {` to the matching `});` at the same indentation. */
function useFrameBody(source: string): string {
  const start = source.indexOf("useFrame(() => {");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n  });\n", start);
  return source.slice(start, end + 6);
}

describe("instancing audit (backlog 8.2)", () => {
  it("positive controls: the regexes match samples", () => {
    expect(NEW_RESOURCE.test("n" + "ew BoxGeometry(1)")).toBe(true);
    expect(NEW_RESOURCE.test("n" + "ew MeshStandardMaterial()")).toBe(true);
    expect(TEXTURE_API.test("use" + "Texture(url)")).toBe(true);
    expect(ALLOCATION.test("n" + "ew Vector3()")).toBe(true);
    expect(ALLOCATION.test("a.m" + "ap(f)")).toBe(true);
    expect(ALLOCATION.test("[." + "..a]")).toBe(true);
    expect(RANGE_ALLOCATION.test("a.add" + "UpdateRange(0, 1)")).toBe(true);
    expect(CONSOLE.test("console" + ".log(1)")).toBe(true);
    expect(PROBE_IMPORT.test('import { x } from "./perf' + 'Probe"')).toBe(true);
  });

  it("river krathongs never mount KrathongModel", () => {
    expect(read("src/components/canvas3d/RiverFlow.tsx")).not.toMatch(/KrathongModel/);
  });

  it("no three resources are created on the river / probe path", () => {
    for (const file of RIVER_FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(NEW_RESOURCE);
      expect(source, file).not.toMatch(TEXTURE_API);
    }
  });

  it("the per-frame writers allocate nothing", () => {
    const batch = read("src/components/models/loyKrathong/riverKrathongBatch.ts");
    for (const name of ["writeKrathongItemInstances", "commitKrathongBatch"]) {
      expect(functionSource(batch, name), name).not.toMatch(ALLOCATION);
      expect(functionSource(batch, name), name).not.toMatch(RANGE_ALLOCATION);
    }
    expect(useFrameBody(read("src/components/canvas3d/RiverFlow.tsx"))).not.toMatch(ALLOCATION);
  });

  it("no console in the new files", () => {
    for (const file of [...RIVER_FILES, "src/core/customization/krathongInstanceBuckets.ts"]) {
      expect(read(file), file).not.toMatch(CONSOLE);
    }
  });

  it("perf probe stays in the 3D chunk", () => {
    const outside = walk("src").filter((f) => !f.startsWith("src/components/canvas3d/"));
    expect(outside.length).toBeGreaterThan(0);
    const offenders = outside.filter((f) => PROBE_IMPORT.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("findings doc has the automated numbers", () => {
    expect(existsSync(join(process.cwd(), "docs/perf/MFW-34.md"))).toBe(true);
    const doc = read("docs/perf/MFW-34.md");
    const start = doc.indexOf("<!-- automated:start -->");
    const end = doc.indexOf("<!-- automated:end -->");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(doc.slice(start, end)).not.toContain("TBD");
  });
});
