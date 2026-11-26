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
  // MFW-49: water highlights / ripples build their resources through the blobShadowMeshes factories only.
  "src/components/canvas3d/WaterHighlights.tsx",
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

/** MFW-50 living world: villagers and ambient life (meshes come from factories, no console). */
const LIVING_WORLD_FILES = [
  "src/components/canvas3d/villagerMeshes.ts",
  "src/components/canvas3d/ambientMeshes.ts",
  "src/components/canvas3d/Villagers.tsx",
  "src/components/canvas3d/AmbientLife.tsx",
  "src/core/world/villagers.ts",
  "src/core/world/ambientLife.ts",
];

/** Every `useFrame(() => {` … `\n  });\n` body of a file (inline bodies use a 2-space indent). */
function frameCallbackBodies(source: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("useFrame(() => {", from);
    if (start < 0) return bodies;
    const end = source.indexOf("\n  });\n", start);
    expect(end).toBeGreaterThan(start);
    bodies.push(source.slice(start, end + 6));
    from = end;
  }
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
    for (const file of [...RIVER_FILES, ...LIVING_WORLD_FILES, "src/core/customization/krathongInstanceBuckets.ts"]) {
      expect(read(file), file).not.toMatch(CONSOLE);
    }
  });

  it("the living world allocates nothing per frame (MFW-50 AC2)", () => {
    const writers: [string, string[]][] = [
      ["src/components/canvas3d/villagerMeshes.ts", ["writeVillagerInstances"]],
      ["src/components/canvas3d/ambientMeshes.ts", ["writeMoteInstances", "writeLanternFlicker"]],
      ["src/core/world/villagers.ts", ["villagerPoseInto"]],
      ["src/core/world/ambientLife.ts", ["moteFrameInto", "lanternFlickerFactor"]],
    ];
    for (const [file, names] of writers) {
      const source = read(file);
      for (const name of names) {
        expect(functionSource(source, name), name).not.toMatch(ALLOCATION);
        expect(functionSource(source, name), name).not.toMatch(RANGE_ALLOCATION);
      }
    }
    for (const file of ["src/components/canvas3d/Villagers.tsx", "src/components/canvas3d/AmbientLife.tsx"]) {
      const source = read(file);
      const bodies = frameCallbackBodies(source);
      expect(bodies.length, file).toBeGreaterThanOrEqual(1);
      for (const body of bodies) expect(body, file).not.toMatch(ALLOCATION);
      expect(source, file).not.toMatch(NEW_RESOURCE);
      expect(source, file).not.toMatch(TEXTURE_API);
    }
    expect(frameCallbackBodies(read("src/components/canvas3d/AmbientLife.tsx")).length).toBe(2); // motes, flicker
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

  it("the mark cue allocates nothing per frame (MFW-67)", () => {
    expect(useFrameBody(read("src/components/canvas3d/OwnKrathong.tsx"))).not.toMatch(ALLOCATION);
    const curves = read("src/core/effects/gimmickCurves.ts");
    expect(functionSource(curves, "writeMarkCueAt")).not.toMatch(ALLOCATION);
    expect(functionSource(curves, "trackMarkCue")).not.toMatch(ALLOCATION);
    expect(functionSource(read("src/components/canvas3d/ownKrathongPose.ts"), "writeMarkCueScale")).not.toMatch(ALLOCATION);
  });

  it("the flame flicker allocates nothing per frame (MFW-48)", () => {
    expect(functionSource(read("src/core/customization/flameFlicker.ts"), "writeFlameFlickerAt")).not.toMatch(ALLOCATION);
    expect(useFrameBody(read("src/components/models/loyKrathong/FlameFlicker.tsx"))).not.toMatch(ALLOCATION);
    expect(useFrameBody(read("src/components/models/loyKrathong/KrathongModel.tsx"))).not.toMatch(ALLOCATION);
    const batch = read("src/components/models/loyKrathong/riverKrathongBatch.ts");
    expect(functionSource(batch, "writeKrathongItemInstances")).not.toMatch(ALLOCATION);
    for (const file of ["src/components/models/loyKrathong/FlameFlicker.tsx", "src/components/models/loyKrathong/KrathongModel.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(NEW_RESOURCE);
      expect(source, file).not.toMatch(TEXTURE_API);
      expect(source, file).not.toMatch(CONSOLE);
    }
  });

  it("the foliage sway allocates nothing per frame (MFW-70)", () => {
    expect(functionSource(read("src/components/canvas3d/foliageSway.ts"), "writeFoliageSway")).not.toMatch(ALLOCATION);
    expect(useFrameBody(read("src/components/canvas3d/SwayingInstancedPart.tsx"))).not.toMatch(ALLOCATION);
    for (const file of ["src/components/canvas3d/SwayingInstancedPart.tsx", "src/components/models/loyKrathong/RiversideFoliage.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(NEW_RESOURCE);
      expect(source, file).not.toMatch(TEXTURE_API);
      expect(source, file).not.toMatch(CONSOLE);
    }
  });

  it("MFW-48 findings doc has the automated numbers", () => {
    expect(existsSync(join(process.cwd(), "docs/perf/MFW-48.md"))).toBe(true);
    const doc = read("docs/perf/MFW-48.md");
    const start = doc.indexOf("<!-- automated:start -->");
    const end = doc.indexOf("<!-- automated:end -->");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(doc.slice(start, end)).not.toContain("TBD");
  });

  it("IA1: the MFW-60 reaction writers and curves allocate nothing", () => {
    const writers: [string, string[]][] = [
      ["src/components/canvas3d/effects/effectMeshes.ts", ["writeWindowGlowInstances", "writeFireworkInstances", "writeSkyLanternInstances"]],
      ["src/components/canvas3d/foliageSway.ts", ["writeFoliageSwayAndShake", "writeFoliageSway"]],
      ["src/core/effects/sceneNudges.ts", ["findNudgeEntry", "releaseExpiredNudges", "startNudge", "nudgeDurationMs", "retriggerGlow"]],
      ["src/components/canvas3d/villagerMeshes.ts", ["writeVillagerInstances"]],
    ];
    const curves = read("src/core/effects/reactionCurves.ts");
    const curveNames = [...curves.matchAll(/export function (\w+)\(/g)].map((m) => m[1]).filter((n) => n !== "fireworkDirectionsInto" && !n.startsWith("create"));
    expect(curveNames).toEqual(expect.arrayContaining(["writeNudgeAt", "writeFireworkShellAt", "writeFireworkSparkAt", "fireworkDurationMs", "writeSkyLanternAt"]));
    writers.push(["src/core/effects/reactionCurves.ts", curveNames]);
    for (const [file, names] of writers) {
      const source = read(file);
      for (const name of names) {
        expect(functionSource(source, name), name).not.toMatch(ALLOCATION);
        expect(functionSource(source, name), name).not.toMatch(RANGE_ALLOCATION);
      }
    }
  });

  it("IA2: the MFW-60 frame callbacks allocate nothing; the proxies and nudges create no three resource", () => {
    for (const file of [
      "src/components/canvas3d/effects/SceneEffects.tsx",
      "src/components/canvas3d/effects/PropNudges.tsx",
      "src/components/canvas3d/SwayingInstancedPart.tsx",
      "src/components/canvas3d/Villagers.tsx",
    ]) {
      const bodies = frameCallbackBodies(read(file));
      expect(bodies.length, file).toBe(1);
      for (const body of bodies) expect(body, file).not.toMatch(ALLOCATION);
    }
    for (const file of ["src/components/canvas3d/effects/PropTapProxies.tsx", "src/components/canvas3d/effects/PropNudges.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(NEW_RESOURCE);
      expect(source, file).not.toMatch(TEXTURE_API);
      expect(source, file).not.toMatch(CONSOLE);
    }
  });

  it("IA3: the MFW-72 smoke and falling-leaf writers allocate nothing", () => {
    const source = read("src/components/canvas3d/effects/effectMeshes.ts");
    for (const name of ["writeChimneySmokeInstances", "writeFallingLeafInstances"]) {
      expect(functionSource(source, name), name).not.toMatch(ALLOCATION);
      expect(functionSource(source, name), name).not.toMatch(RANGE_ALLOCATION);
    }
    const curves = read("src/core/effects/reactionCurves.ts");
    for (const name of ["writeSmokePuffAt", "writeFallingLeafAt", "chimneySmokeDurationMs", "fallingLeavesDurationMs"]) {
      expect(functionSource(curves, name), name).not.toMatch(ALLOCATION);
    }
    expect(curves).not.toMatch(/buildHouseSmokeOrigins|buildTreeLeafAnchors/); // anchors are built once, outside the curves
  });
});
